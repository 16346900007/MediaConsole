import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { and, eq } from 'drizzle-orm';
import { writeFile, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { socialAccounts } from '@server/database/schema';
import type { SocialPlatform } from '@shared/api.interface';
import { PLATFORM_MAP } from '@shared/platforms';
import {
  hasSessionCookie,
  hasSessionCookieCheck,
} from './session-cookie';
import {
  authDir,
  extractPageUserInfo,
  extractStoredUserInfo,
  extractYoutubeFromPage,
} from './auth-util';

/**
 * 浏览器授权服务（个人号方案，无需企业资质）：
 * 1. 后端拉起本机 Edge 有头窗口打开平台登录页，用户手动登录；
 * 2. 检测登录成功后抓取登录态（cookies + localStorage，storageState）；
 * 3. 登录态存本地 auth/<platform>.json，账号信息落库；
 * 4. 后续发布复用该登录态（无头浏览器）。
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const playwright = require('playwright') as any;

interface AuthSession {
  platform: SocialPlatform;
  browser: any;
  context: any;
  page: any;
  startedAt: number;
  status: 'pending' | 'success' | 'failed';
  error?: string;
  accountName?: string;
  /** 从原账号卡片发起重授权时带上：授权成功后刷新该账号而非新建 */
  accountId?: string;
}

/** 登录会话超时：10 分钟 */
const SESSION_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class BrowserAuthService {
  private session: AuthSession | null = null;

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  /** 拉起本机 Edge 窗口打开登录页（有头，用户手动登录） */
  async start(
    platform: SocialPlatform,
    accountId?: string,
  ): Promise<{ ok: boolean; message?: string }> {
    if (!PLATFORM_MAP[platform]) {
      throw new BadRequestException(`平台 ${platform} 未配置`);
    }
    if (this.session) {
      const s = this.session;
      // 用户主动再次发起授权：无论旧会话处于什么状态，一律放弃并重建，
      // 避免"已有授权会话进行中"的 400 把用户卡死（旧 Edge 窗口可能已关/被遮挡）
      if (s.browser?.isConnected?.()) {
        console.log('[browser-auth] 重新发起授权，关闭旧会话浏览器窗口');
      }
      void s.browser.close().catch(() => {});
      this.session = null;
    }

    const browser = await playwright.chromium.launch({
      channel: 'msedge',
      headless: false,
      args: ['--disable-blink-features=AutomationControlled'],
      ignoreDefaultArgs: ['--enable-automation'],
    });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    this.session = {
      platform,
      browser,
      context,
      page,
      startedAt: Date.now(),
      status: 'pending',
      accountId,
    };

    // 后台导航到平台创作中心（未登录会跳登录页）
    const creatorUrl = PLATFORM_MAP[platform]?.creatorUrl;
    if (!creatorUrl) {
      throw new BadRequestException(`平台 ${platform} 未配置创作中心地址`);
    }
    console.log(
      `[browser-auth] ${platform} target=${creatorUrl} envProxy=${process.env.HTTP_PROXY || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.https_proxy || 'none'}`,
    );
    void page
      .goto(creatorUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      })
      .then((resp) => {
        console.log(
          `[browser-auth] ${platform} goto done: ${page.url()} status=${resp?.status()} loc=${resp?.headers()?.['location'] ?? ''}`,
        );
      })
      .catch((e: unknown) => {
        console.log(
          `[browser-auth] ${platform} goto err: ${e instanceof Error ? e.message : String(e)} url=${page.url()}`,
        );
      });
    // 3 秒后再记录一次（捕获登录页后续重定向）
    setTimeout(() => {
      console.log(`[browser-auth] ${platform} 3s later url: ${page.url()}`);
    }, 3000);

    const meta = PLATFORM_MAP[platform];
    return {
      ok: true,
      message: `已打开登录窗口，请在弹出的 Edge 窗口中登录${meta?.name ?? platform}`,
    };
  }

  /** 轮询登录状态；检测到登录成功则保存登录态并落库 */
  async status(): Promise<{
    status: 'idle' | 'pending' | 'success' | 'failed';
    accountName?: string;
    message?: string;
  }> {
    const s = this.session;
    if (!s) return { status: 'idle' };
    if (s.status === 'success') {
      return { status: 'success', accountName: s.accountName };
    }
    if (s.status === 'failed') {
      return { status: 'failed', message: s.error };
    }
    if (Date.now() - s.startedAt > SESSION_TTL_MS) {
      s.status = 'failed';
      s.error = '登录超时（10 分钟），请重新发起授权';
      void s.browser.close().catch(() => {});
      this.session = null;
      return { status: 'failed', message: s.error };
    }

    try {
      let url = String(s.page.url() ?? '');
      let isLoginPage =
        url.includes('login') ||
        url.includes('passport') ||
        url.includes('signin');

      // 视频号特殊流程：扫码只完成微信侧授权，页面还会出现"微信快捷登录"按钮，
      // 需再点一次才真正进入创作中心 —— 检测到按钮时自动点击完成登录
      let clickedQuickLogin = false;
      if (s.platform === 'shipinhao' && isLoginPage) {
        try {
          const quickLogin = s.page
            .getByText('微信快捷登录', { exact: true })
            .first();
          if (await quickLogin.count()) {
            await quickLogin.click({ timeout: 3000 }).catch(() => {});
            clickedQuickLogin = true;
            await s.page.waitForTimeout(2500);
          }
        } catch {
          /* 忽略，走常规判据 */
        }
        url = String(s.page.url() ?? '');
        isLoginPage =
          url.includes('login') ||
          url.includes('passport') ||
          url.includes('signin');
      }

      // 登录成功的判据：已离开登录页且 URL 回到平台主域（创作中心 host 前缀）
      const host = PLATFORM_MAP[s.platform]?.creatorUrl
        ? new URL(PLATFORM_MAP[s.platform].creatorUrl).hostname
        : `${s.platform}.com`;
      const hostBase = host.split('.').slice(-2).join('.');
      // 会话级强校验：平台有标志性会话 cookie 时，必须命中才视为真正登录，
      // 避免抖音等平台未登录不跳独立登录域、仅靠 URL 误判为已登录
      const sessionCookies = await s.context.cookies().catch(() => []);
      const hasSession = hasSessionCookie(sessionCookies, s.platform);
      // 快手诊断：cp.kuaishou.com/profile 未登录页 URL 无 login 字样，登录判据全靠会话
      // cookie，打印实际 cookie 键名以核对判据是否正确（登录前后各一次）
      if (s.platform === 'kuaishou') {
        console.log(
          `[browser-auth] kuaishou poll url=${url} hasSession=${hasSession} cookies=[${sessionCookies
            .map((c) => c.name)
            .join(',')}]`,
        );
      }
      // YouTube 诊断：Google 登录流程会经 accounts.google.com → www.youtube.com/signin
      // → studio.youtube.com，登录后 URL 可能含 signin 被 isLoginPage 误判，打印关键状态
      if (s.platform === 'youtube') {
        console.log(
          `[browser-auth] youtube poll url=${url} isLoginPage=${isLoginPage} hasSession=${hasSession} sessionCookies=[${sessionCookies
            .filter((c) => /SID|SSID|SAPISID|HSID|APISID/i.test(c.name))
            .map((c) => `${c.name}@${c.domain}`)
            .join(',')}]`,
        );
      }
      // 视频号：点击"微信快捷登录"后按钮消失（进入创作中心但 URL 未变）视为已登录
      let quickLoginConfirmed = false;
      if (s.platform === 'shipinhao') {
        const left = await s.page
          .getByText('微信快捷登录', { exact: true })
          .count()
          .catch(() => 1);
        quickLoginConfirmed = clickedQuickLogin && left === 0;
      }
      // 微博 passport 特判：passport.weibo.com 游客只有 X-CSRF-TOKEN（无 SUB/SUBP，已实测），
      // 登录后出现 SUB/SUBP 即视为登录完成（即使页面尚未跳转到 weibo.com）
      const weiboPassportConfirmed =
        s.platform === 'weibo' &&
        url.includes('passport.weibo.com') &&
        hasSession;
      // OAuth 回调过渡页（code 换 token 中）不算完成，等待跳转创作中心
      const oauthPending = url.includes('oauth-callback');
      const loggedIn =
        !oauthPending &&
        (url.includes(hostBase) || url.includes('weixin.qq.com')) &&
        ((!isLoginPage && (hasSession || !hasSessionCookieCheck(s.platform))) ||
          quickLoginConfirmed ||
          weiboPassportConfirmed);

      if (loggedIn) {
        // 稳定 2 秒，确认登录已完成（避免跳转中途误判）
        await s.page.waitForTimeout(2000);
        const url2 = String(s.page.url() ?? '');
        if (
          url2.includes('login') ||
          url2.includes('passport') ||
          url2.includes('signin')
        ) {
          return { status: 'pending', message: '等待登录完成…' };
        }

        // 保存登录态（cookies + localStorage）
        const state = await s.context.storageState();
        const dir = authDir();
        await mkdir(dir, { recursive: true });
        const platform = s.platform;
        // 用户信息：localStorage 提取（昵称/头像/ID），失败回退页面 DOM 抓取
        const info = await extractStoredUserInfo(state, platform);
        // YouTube：studio 无 localStorage 用户信息，从 ytcfg 拿 CHANNEL_ID 后
        // 跳转频道页取频道名/头像（node 直连会被 Google CookieMismatch 拦截，必须页面内提取）
        if (platform === 'youtube') {
          const yt = await extractYoutubeFromPage(s.page).catch(() => ({}));
          if (yt.userId || yt.userName) {
            info.userId = yt.userId || info.userId;
            info.userName = yt.userName || info.userName;
            info.userAvatar = yt.userAvatar || info.userAvatar;
          }
        }
        const pageInfo = await extractPageUserInfo(s.page, platform).catch(
          () => ({}),
        );
        const nickname =
          info.userName?.trim() ||
          pageInfo.userName?.trim() ||
          `${PLATFORM_MAP[platform]?.name ?? platform}账号（请编辑）`;
        const avatar = info.userAvatar ?? pageInfo.userAvatar ?? null;
        const uid =
          (info.userId && `${platform}-${info.userId}`) ||
          `${platform}-browser-${Date.now()}`;
        // 按账号独立保存登录态：<platform>-<userId>.json（多账号互不覆盖）
        const stateName = info.userId
          ? `${platform}-${info.userId}.json`
          : `${platform}.json`;
        await writeFile(join(dir, stateName), JSON.stringify(state), 'utf8');
        // 同时保留"最近账号"默认文件（兼容旧逻辑/兜底）
        await writeFile(
          join(dir, `${platform}.json`),
          JSON.stringify(state),
          'utf8',
        );

        // 落库：按 platformUid（用户ID）匹配——同一账号重新登录则更新该账号；
        // 匹配不到说明登录的是其他账号，一律新建，绝不覆盖现有账号信息
        // 授权刚成功即登录态有效，直接标记在线，无需再手动校验
        // 创作中心地址：优先平台 homeUrl（登录后可直达的后台），回退 creatorUrl
        const homeUrl =
          PLATFORM_MAP[platform]?.homeUrl ??
          PLATFORM_MAP[platform]?.creatorUrl ??
          null;
        const note = `浏览器授权 · 登录态已保存 · ${new Date().toLocaleString()}`;
        const now = new Date();
        const byUid = await this.db
          .select({ id: socialAccounts.id })
          .from(socialAccounts)
          .where(eq(socialAccounts.platformUid, uid))
          .limit(1);
        if (byUid.length > 0) {
          await this.db
            .update(socialAccounts)
            .set({
              accountName: nickname,
              avatar,
              homeUrl,
              note,
              online: true,
              lastVerifiedAt: now,
            })
            .where(eq(socialAccounts.id, byUid[0].id));
        } else {
          await this.db.insert(socialAccounts).values({
            platform,
            accountName: nickname,
            platformUid: uid,
            avatar,
            homeUrl,
            followersCount: 0,
            status: 'active',
            note,
            online: true,
            lastVerifiedAt: now,
          });
        }

        s.status = 'success';
        s.accountName = nickname;
        void s.browser.close().catch(() => {});
        this.session = null;
        return { status: 'success', accountName: nickname };
      }

      return { status: 'pending', message: '等待登录完成…' };
    } catch (e) {
      s.status = 'failed';
      s.error = `检测登录状态失败：${(e as Error).message}`;
      void s.browser.close().catch(() => {});
      this.session = null;
      return { status: 'failed', message: s.error };
    }
  }
}
