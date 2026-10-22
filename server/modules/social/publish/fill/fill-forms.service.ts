/**
 * 自动填表服务：把 multipost-core（Apache-2.0）的注入函数跑在 Playwright（headed, msedge）里，
 * 打开各平台发布页并填好表单，但【不点击发布】——最后一步由用户人工确认。
 *
 * 与 executors.ts（自动发布，B站已打通）互补：本服务只填表、不提交。
 * 复用同一套登录态（authDir 下的 storageState）。
 */
import { Injectable, Logger } from '@nestjs/common';
import type { SocialPlatform } from '@shared/api.interface';
import type { FilesService } from '../../files.service';
import { PublishService } from '../../publish.service';
import { authDir } from '../../auth/auth-util';
import { getFillSpec, PLATFORM_CN, type FillContentType } from './platform-map';
import type { FileData, SyncData } from './fill-types';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const playwright = require('playwright') as any;
const { existsSync } = require('node:fs') as typeof import('node:fs');
const { readFile } = require('node:fs/promises') as typeof import('node:fs/promises');
const { join } = require('node:path');

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** 各平台「未登录」的 URL 特征（goto 后命中即视为登录态失效） */
const LOGIN_URL_MARKS: Record<SocialPlatform, RegExp> = {
  douyin: /passport\.douyin\.com|\/login/,
  xiaohongshu: /\/login|passport/,
  bilibili: /passport\.bilibili\.com/,
  shipinhao: /channels\.weixin\.qq\.com\/login/,
  weibo: /passport\.weibo\.com|login\.sina\.com\.cn/,
  kuaishou: /passport\.kuaishou\.com|cpassport/,
  youtube: /accounts\.google\.com|ServiceLogin/,
};

export interface FillTarget {
  /** 发布单目标记录 ID（用于实时回写填表失败信息） */
  targetId: string;
  platform: SocialPlatform;
  accountId: string;
  platformUid?: string | null;
  accountName: string;
}

export interface FillFormsResult {
  /** 填表服务地址（媒体文件 fetch 用） */
  baseUrl: string;
  opened: {
    platform: SocialPlatform;
    platformName: string;
    accountName: string;
    status: 'filled' | 'skipped' | 'failed';
    message: string;
    url: string;
  }[];
}

export interface FillFormsParams {
  /** 发布单 ID：窗口被用户关闭时据此记录该平台已发布 */
  taskId: string;
  publishType: FillContentType;
  title: string;
  body: string;
  topic: string;
  coverFileKey: string | null;
  mediaFileKeys: string[];
  scheduledAt?: string | null;
  targets: FillTarget[];
  files: FilesService;
}

@Injectable()
export class FillFormsService {
  private readonly logger = new Logger(FillFormsService.name);
  constructor(private readonly publishService: PublishService) {}
  /** 上一个填表会话打开的浏览器（新任务自动关闭旧会话窗口） */
  private activeBrowser: any = null;
  /** 填表互斥锁：同一时刻只允许一个填表任务，避免互相 closePrevious 掐断 */
  private fillBusy: Promise<FillFormsResult> | null = null;
  /** 每个平台注入填表的最长等待（秒），超时则记 failed 继续下一个平台 */
  private readonly PER_PLATFORM_TIMEOUT_MS = 150_000;

  private baseUrl(): string {
    const port = Number(process.env.SERVER_PORT || '55725');
    return `http://127.0.0.1:${port}`;
  }

  /** 关闭上一个填表浏览器（下一次填表前自动清场） */
  private async closePrevious(): Promise<void> {
    const b = this.activeBrowser;
    this.activeBrowser = null;
    if (b) {
      try {
        await b.close();
      } catch {
        /* 窗口可能已被用户手动关闭 */
      }
    }
  }

  private joinAuth(platform: SocialPlatform, uid: string): string | null {
    const base = authDir();
    const withUid = join(base, `${platform}-${uid}.json`);
    if (existsSync(withUid)) return withUid;
    const fallback = join(base, `${platform}.json`);
    return existsSync(fallback) ? fallback : null;
  }

  /**
   * 解析目标账号的登录态 uid：优先 target.platformUid（新任务），
   * 缺失时（老任务未存该字段）按 accountId 实时查账号表兜底。
   */
  private async resolveUid(t: { accountId: string; platformUid?: string }): Promise<string> {
    let uid = String(t.platformUid ?? '').replace(/^[a-z]+-/, '');
    if (!uid) {
      const pu = await this.publishService.getAccountPlatformUid(t.accountId).catch(() => null);
      uid = String(pu ?? '').replace(/^[a-z]+-/, '');
    }
    return uid;
  }

  /** topic（#话题1 #话题2 或逗号分隔）→ tags 数组 */
  private parseTags(topic: string): string[] {
    return (topic || '')
      .split(/[#,\s]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 10);
  }

  private toFileData(fileKey: string, name: string): FileData {
    return {
      name: name || fileKey.split('/').pop() || 'file',
      url: `${this.baseUrl()}/api/social/files/${fileKey}`,
      type: fileKey.toLowerCase().match(/\.(mp4|webm|mov|jpg|jpeg|png|gif|webp|avif)$/)?.[1]
        ? {
            mp4: 'video/mp4',
            webm: 'video/webm',
            mov: 'video/quicktime',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            png: 'image/png',
            gif: 'image/gif',
            webp: 'image/webp',
            avif: 'image/avif',
          }[fileKey.toLowerCase().match(/\.(mp4|webm|mov|jpg|jpeg|png|gif|webp|avif)$/)![1]]
        : 'application/octet-stream',
    };
  }

  private buildSyncData(p: FillFormsParams): SyncData {
    const tags = this.parseTags(p.topic);
    const scheduledPublishTime = p.scheduledAt ? new Date(p.scheduledAt).getTime() : undefined;
    if (p.publishType === 'video') {
      const videoKey = p.mediaFileKeys[0];
      const data: SyncData = {
        platforms: [],
        isAutoPublish: false,
        data: {
          title: p.title || '',
          content: p.body || '',
          video: videoKey
            ? this.toFileData(videoKey, `${p.title || 'video'}.mp4`)
            : { name: '', url: '', type: '' },
          tags,
          scheduledPublishTime,
        },
      };
      if (p.coverFileKey) {
        (data.data as any).cover = this.toFileData(p.coverFileKey, 'cover.jpg');
      }
      return data;
    }
    // image（图文）
    const images = (p.mediaFileKeys ?? []).map((k, i) =>
      this.toFileData(k, `${p.title || 'image'}-${i + 1}.jpg`),
    );
    return {
      platforms: [],
      isAutoPublish: false,
      data: {
        title: p.title || '',
        content: p.body || '',
        images,
        videos: [],
        tags,
        scheduledPublishTime,
      },
    };
  }

  private async isLoggedIn(
    page: any,
    platform: SocialPlatform,
    ssoLoggedOut = false,
  ): Promise<boolean> {
    try {
      await page.waitForTimeout(4000);
      const url: string = page.url();
      if (LOGIN_URL_MARKS[platform].test(url)) return false;
      // 兜底：平台页面 console 已报"未登录"（如快手 SSO 同步失败后停留在原页面不跳转）
      if (ssoLoggedOut) return false;
      return true;
    } catch {
      return true;
    }
  }

  async fillForms(p: FillFormsParams): Promise<FillFormsResult> {
    // 并发互斥：已有填表任务在进行时直接报错，避免 closePrevious 关掉正在跑的会话
    if (this.fillBusy) {
      throw new Error('已有自动填表正在进行（浏览器已打开平台页面），请先完成/关闭后再试');
    }
    const run = (async (): Promise<FillFormsResult> => {
      await this.closePrevious();
      const syncData = this.buildSyncData(p);

      if (p.targets.length === 0) {
        return { baseUrl: this.baseUrl(), opened: [] };
      }

      const browser = await playwright.chromium.launch({
        channel: 'msedge',
        headless: false,
        args: [
          '--disable-blink-features=AutomationControlled',
          // 禁掉"设备上的应用"/"本地网络"（Apps on device / Local Network Access）权限弹窗：
          // 页面 fetch 本机 55726 媒体文件不再每次要人工点"允许"
          '--disable-features=PrivateNetworkAccessChecks,LocalNetworkAccess,LocalNetworkAccessChecks,AppsOnDevice',
        ],
      });
      this.activeBrowser = browser;

      // 窗口分组：同一窗口内每个平台只允许一个账号（一个域名一套 cookie）；
      // 遇到同平台第二个账号 → 另开新窗口；窗口内跨平台用标签页（tab）累加。
      const windows = this.groupTargetsByWindow(p.targets);
      const windowResults = await Promise.allSettled(
        windows.map(async (group) => {
          const merged = await this.mergeStorageState(group);
          const context = await browser.newContext({
            ...(merged ? { storageState: merged } : {}),
            viewport: { width: 1440, height: 900 },
            userAgent: DEFAULT_UA,
          });
          // 双保险：预授权 local-network / apps-on-device（新 Chromium 把本地访问拆成两个权限）；不支持时忽略
          await context
            .grantPermissions(['local-network', 'apps-on-device'])
            .catch(() => {});
          // 窗口内并行：每个账号一个标签页（同一 context 的 newPage = 同窗口新 tab）
          const inner = await Promise.allSettled(
            group.map((target) =>
              this.fillOneTarget(p.taskId, context, syncData, target, p.publishType),
            ),
          );
          return inner
            .filter((s) => s.status === 'fulfilled')
            .map((s) => (s as PromiseFulfilledResult<FillFormsResult['opened'][number]>).value);
        }),
      );
      const result: FillFormsResult['opened'] = [];
      for (const ws of windowResults) {
        if (ws.status === 'fulfilled') {
          result.push(...ws.value);
        } else {
          this.logger.warn(`窗口填表失败: ${(ws.reason as Error).message}`);
        }
      }

      // 不关闭浏览器：留窗口给用户人工检查并点击发布
      this.logger.log(`自动填表完成: ${result.filter((r) => r.status === 'filled').length}/${result.length} 个平台已填写`);
      return { baseUrl: this.baseUrl(), opened: result };
    })();
    this.fillBusy = run;
    try {
      return await run;
    } finally {
      this.fillBusy = null;
    }
  }

  /**
   * 窗口分组：顺序遍历目标账号，当前窗口已含该平台则另起新窗口（同域名 cookie 冲突），
   * 否则加入当前窗口（跨平台 → 同窗口标签页）。
   * 例：[B站A, 抖音, 小红书, B站B, 抖音B] → [[B站A, 抖音, 小红书], [B站B, 抖音B]]
   */
  private groupTargetsByWindow(targets: FillTarget[]): FillTarget[][] {
    const windows: FillTarget[][] = [];
    let list: FillTarget[] = [];
    const used = new Set<SocialPlatform>();
    for (const t of targets) {
      if (used.has(t.platform)) {
        if (list.length > 0) windows.push(list);
        list = [];
        used.clear();
      }
      used.add(t.platform);
      list.push(t);
    }
    if (list.length > 0) windows.push(list);
    return windows;
  }

  /** 合并多个账号的 storageState：cookies 按 domain|path|name 去重（后者覆盖），localStorage 按 origin 合并 */
  private async mergeStorageState(targets: FillTarget[]): Promise<any | null> {
    const states: any[] = [];
    for (const t of targets) {
      const uid = await this.resolveUid(t);
      const path = this.joinAuth(t.platform, uid);
      if (!path) continue;
      try {
        states.push(JSON.parse(await readFile(path, 'utf8')));
      } catch (e) {
        this.logger.warn(`读取登录态失败 ${path}: ${(e as Error).message}`);
      }
    }
    if (states.length === 0) return null;
    const cookieMap = new Map<string, any>();
    for (const st of states) {
      for (const c of st.cookies || []) {
        cookieMap.set(`${c.domain}|${c.path}|${c.name}`, c);
      }
    }
    const originMap = new Map<string, Map<string, string>>();
    for (const st of states) {
      for (const o of st.origins || []) {
        if (!originMap.has(o.origin)) originMap.set(o.origin, new Map());
        const m = originMap.get(o.origin)!;
        for (const kv of o.localStorage || []) m.set(kv.name, kv.value);
      }
    }
    return {
      cookies: Array.from(cookieMap.values()),
      origins: Array.from(originMap.entries()).map(([origin, kv]) => ({
        origin,
        localStorage: Array.from(kv.entries()).map(([name, value]) => ({ name, value })),
      })),
    };
  }

  /** 单个平台填表（并行子任务）：在传入 context 内开标签页、注入填表函数、留窗待人工确认 */
  private async fillOneTarget(
    taskId: string,
    context: any,
    syncData: SyncData,
    target: FillTarget,
    publishType: FillContentType,
  ): Promise<FillFormsResult['opened'][number]> {
    const cn = PLATFORM_CN[target.platform];
    const spec = getFillSpec(target.platform, publishType);
    if (!spec) {
      await this.publishService.setTargetFillError(target.targetId, `${cn} 暂不支持该内容类型（video/image）自动填表`).catch(() => {});
      return {
        platform: target.platform,
        platformName: cn,
        accountName: target.accountName,
        status: 'skipped',
        message: `${cn} 暂不支持该内容类型（video/image）自动填表`,
        url: '',
      };
    }
    // 填表开始：清掉上一次的填表失败信息（重新填表时行状态立即回到「填表中」）
    await this.publishService.setTargetFillError(target.targetId, null).catch(() => {});
    const uid = await this.resolveUid(target);
    const statePath = this.joinAuth(target.platform, uid);
    if (!statePath) {
      await this.publishService.setTargetFillError(target.targetId, `未找到 ${cn} 登录态（auth/${target.platform}.json），请先在平台授权`).catch(() => {});
      return {
        platform: target.platform,
        platformName: cn,
        accountName: target.accountName,
        status: 'failed',
        message: `未找到 ${cn} 登录态（auth/${target.platform}.json），请先在平台授权`,
        url: '',
      };
    }

    let page: any;
    let ssoLoggedOut = false;
    try {
      page = await context.newPage();
      page.on('console', (msg: any) => {
        try {
          const text = msg.text() || '';
          // 快手 SSO 同步失败会在 console 报"未登录"（页面不跳转登录 URL，URL 正则拦不到）
          if (target.platform === 'kuaishou' && text.includes('未登录')) {
            ssoLoggedOut = true;
          }
          this.logger.log(`[${cn} page-console] ${msg.type()}: ${text}`);
        } catch {
          /* ignore */
        }
      });
      page.on('pageerror', (err: any) => {
        try {
          this.logger.warn(`[${cn} page-error] ${String(err)}`);
        } catch {
          /* ignore */
        }
      });
      // 关窗检测：仅记日志。不再自动标记"已发布"——用户可能未发布就关窗，
      // 发布与否由用户在填表弹窗里手动确认（markTargetStatus）
      page.on('close', () => {
        this.logger.log(`[${cn}] 平台窗口已关闭（${target.accountName}），是否发布由用户手动确认`);
      });
      await page.goto(spec.injectUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(3000);

      if (!(await this.isLoggedIn(page, target.platform, ssoLoggedOut))) {
        await page.bringToFront().catch(() => {});
        const msg = `${cn} 登录态已失效，请到「账号 → ${cn} → 重新授权」刷新登录态后再试`;
        await this.publishService.setTargetFillError(target.targetId, msg).catch(() => {});
        return {
          platform: target.platform,
          platformName: cn,
          accountName: target.accountName,
          status: 'failed',
          message: msg,
          url: page.url() || spec.injectUrl,
        };
      }

      // 注入填表函数（isAutoPublish=false：只填表，不点发布）
      // 超时保护：平台页面/上传流程偶发卡住时不阻塞其他平台
      await Promise.race([
        page.evaluate(spec.injectFunction, syncData),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`${cn} 填表超时（${this.PER_PLATFORM_TIMEOUT_MS / 1000}s），已跳过该平台`)), this.PER_PLATFORM_TIMEOUT_MS),
        ),
      ]);
      // 给上传/渲染留时间，然后置前窗口等用户人工确认
      await page.waitForTimeout(5000);
      this.logger.log(`[${cn}] 注入填表函数执行完成，开始 DOM dump 校核…`);
        // 调试：dump 封面/原创声明相关 DOM 结构 + 截图（用于修正平台页面选择器）
        try {
          const dump = await page.evaluate(`(async () => {
            const out = [];
            const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
            const pushNodes = (sel, label) => {
              const nodes = document.querySelectorAll(sel);
              out.push(label + ' nodes=' + nodes.length);
              for (const n of Array.from(nodes).slice(0, 15)) {
                const cls = typeof n.className === 'string' ? n.className.slice(0, 90) : '';
                out.push('  <' + n.tagName.toLowerCase() + ' class="' + cls + '">' + ((n.textContent || '').trim().slice(0, 20)));
              }
            };
            // 创作声明 radio 文本
            const radios = Array.from(document.querySelectorAll('span.check-radio-v2-name')).map((s) => (s.textContent || '').trim());
            out.push('ORIG-RADIO-TEXT=' + radios.join(' | '));
            // 点击封面添加按钮，观察弹窗
            const pill = document.querySelector('div.cover-empty-pill, div.cover-slot, div.cover-empty');
            if (pill) { out.push('CLICK cover-pill: ' + (pill.textContent || '').trim().slice(0, 12)); pill.click(); await sleep(2500); }
            pushNodes('[class*="cover-select" i], [class*="cover-modal" i]', 'POPUP');
            pushNodes('input[type="file"]', 'FILE-INPUT');
            pushNodes('div.bcc-upload-wrapper, [class*="upload" i]', 'UPLOAD');
            const btns = Array.from(document.querySelectorAll('button, span, div')).filter((b) => /上传|完成|截取|本地|选择文件/.test((b.textContent || '') + '') && (b.textContent || '').trim().length < 12).slice(0, 10);
            out.push('POPUP-BTNS=' + btns.map((b) => '<' + (b.textContent || '').trim().slice(0, 10) + ' class="' + String(b.className).slice(0, 40) + '">').join(' | '));
            return out.join('\\n');
          })()`);
          this.logger.log(`[${cn} dom-dump]\n${dump}`);
          const shot = `F:\\04-软件开发\\MediaConsole\\bili-page-debug.png`;
          await page.screenshot({ path: shot }).catch(() => {});
        } catch (e) {
          this.logger.warn(`[${cn} dump 失败] ${(e as Error).message}`);
        }
        await page.bringToFront().catch(() => {});
        await this.publishService.setTargetFillError(target.targetId, null).catch(() => {});
        return {
          platform: target.platform,
          platformName: cn,
          accountName: target.accountName,
          status: 'filled',
          message: `已在浏览器中打开 ${cn} 发布页并自动填写，请人工检查后点击发布`,
          url: page.url() || spec.injectUrl,
        };
      } catch (e) {
        this.logger.warn(`${cn} 填表失败: ${(e as Error).message}`);
        const msg = `${cn} 填表失败: ${(e as Error).message}`;
        await this.publishService.setTargetFillError(target.targetId, msg).catch(() => {});
        return {
          platform: target.platform,
          platformName: cn,
          accountName: target.accountName,
          status: 'failed',
          message: msg,
          url: spec.injectUrl,
        };
      }
  }
}
