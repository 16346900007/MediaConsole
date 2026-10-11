import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type PostgresJsDatabase,
  DRIZZLE_DATABASE,
} from '@lark-apaas/fullstack-nestjs-core';
import { and, asc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { socialAccountGroups, socialAccounts } from '@server/database/schema';
import type { AccountGroup, SocialAccount, SocialPlatform } from '@shared/api.interface';
import { PLATFORM_MAP } from '@shared/platforms';
import type {
  AccountBatchMoveDto,
  CreateAccountDto,
  UpdateAccountDto,
} from './accounts.dto';
import {
  authDir,
  extractPageUserInfo,
  extractStoredUserInfo,
} from './auth/auth-util';
import {
  hasSessionCookie,
  hasSessionCookieCheck,
} from './auth/session-cookie';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const playwright = require('playwright') as any;

type AccountRow = typeof socialAccounts.$inferSelect;

@Injectable()
export class AccountsService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  private toAccount(row: AccountRow): SocialAccount {
    return {
      id: row.id,
      platform: row.platform as SocialAccount['platform'],
      accountName: row.accountName,
      homeUrl: row.homeUrl,
      followersCount: row.followersCount,
      groupName: row.groupName,
      status: row.status as SocialAccount['status'],
      note: row.note,
      platformUid: row.platformUid,
      avatar: row.avatar,
      online: row.online ?? null,
      lastVerifiedAt: row.lastVerifiedAt
        ? row.lastVerifiedAt.toISOString()
        : null,
      tokenExpiresAt: row.tokenExpiresAt
        ? row.tokenExpiresAt.toISOString()
        : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async listAccounts(params?: {
    platform?: string;
    group?: string;
    status?: string;
  }): Promise<SocialAccount[]> {
    const conditions: SQL[] = [];
    if (params?.platform) {
      conditions.push(eq(socialAccounts.platform, params.platform));
    }
    if (params?.group) {
      conditions.push(eq(socialAccounts.groupName, params.group));
    }
    if (params?.status) {
      conditions.push(eq(socialAccounts.status, params.status));
    }

    const rows: AccountRow[] =
      conditions.length > 0
        ? await this.db
            .select()
            .from(socialAccounts)
            .where(and(...conditions))
        : await this.db.select().from(socialAccounts);

    return rows.map((row: AccountRow) => this.toAccount(row));
  }

  async createAccount(dto: CreateAccountDto): Promise<SocialAccount> {
    const inserted: AccountRow[] = await this.db
      .insert(socialAccounts)
      .values({
        platform: dto.platform,
        accountName: dto.accountName,
        homeUrl: dto.homeUrl ?? null,
        followersCount: dto.followersCount ?? 0,
        groupName: dto.groupName ?? null,
        status: dto.status ?? 'active',
        note: dto.note ?? null,
      })
      .returning();
    return this.toAccount(inserted[0]);
  }

  async updateAccount(
    id: string,
    dto: UpdateAccountDto,
  ): Promise<SocialAccount> {
    const patch: Partial<typeof socialAccounts.$inferInsert> = {};
    if (dto.accountName !== undefined) patch.accountName = dto.accountName;
    if (dto.homeUrl !== undefined) patch.homeUrl = dto.homeUrl;
    if (dto.followersCount !== undefined) {
      patch.followersCount = dto.followersCount;
    }
    if (dto.groupName !== undefined) patch.groupName = dto.groupName;
    if (dto.status !== undefined) patch.status = dto.status;
    if (dto.note !== undefined) patch.note = dto.note;

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('未提供可更新字段');
    }

    patch.updatedAt = new Date();

    const rows: AccountRow[] = await this.db
      .update(socialAccounts)
      .set(patch)
      .where(eq(socialAccounts.id, id))
      .returning();
    if (rows.length === 0) {
      throw new NotFoundException('账号不存在');
    }
    return this.toAccount(rows[0]);
  }

  async deleteAccount(id: string): Promise<void> {
    const rows: { id: string }[] = await this.db
      .delete(socialAccounts)
      .where(eq(socialAccounts.id, id))
      .returning({ id: socialAccounts.id });
    if (rows.length === 0) {
      throw new NotFoundException('账号不存在');
    }
  }

  /** 账号分组列表：分组表 + 账号 groupName 聚合兜底（与素材库一致） */
  async listGroups(): Promise<AccountGroup[]> {
    const groupRows = await this.db
      .select({ name: socialAccountGroups.name })
      .from(socialAccountGroups)
      .orderBy(asc(socialAccountGroups.createdAt));

    const countRows = await this.db
      .select({
        name: socialAccounts.groupName,
        count: sql<number>`count(*)::int`,
      })
      .from(socialAccounts)
      .where(sql`${socialAccounts.groupName} IS NOT NULL`)
      .groupBy(socialAccounts.groupName);
    const countMap = new Map<string, number>();
    for (const row of countRows) {
      if (row.name !== null) {
        countMap.set(row.name, row.count);
      }
    }

    const knownNames = new Set<string>(
      groupRows.map((row: { name: string }) => row.name),
    );
    const groups: AccountGroup[] = groupRows.map(
      (row: { name: string }): AccountGroup => ({
        name: row.name,
        count: countMap.get(row.name) ?? 0,
      }),
    );
    for (const [name, count] of countMap) {
      if (!knownNames.has(name)) {
        groups.push({ name, count });
      }
    }
    return groups;
  }

  async createGroup(name: string): Promise<void> {
    await this.db
      .insert(socialAccountGroups)
      .values({ name })
      .onConflictDoNothing();
  }

  async renameGroup(oldName: string, newName: string): Promise<void> {
    const groupRows: { id: string }[] = await this.db
      .update(socialAccountGroups)
      .set({ name: newName, updatedAt: new Date() })
      .where(eq(socialAccountGroups.name, oldName))
      .returning({ id: socialAccountGroups.id });
    if (groupRows.length === 0) {
      throw new NotFoundException('分组不存在');
    }
    await this.db
      .update(socialAccounts)
      .set({ groupName: newName, updatedAt: new Date() })
      .where(eq(socialAccounts.groupName, oldName));
  }

  async deleteGroup(name: string): Promise<void> {
    const groupRows: { id: string }[] = await this.db
      .delete(socialAccountGroups)
      .where(eq(socialAccountGroups.name, name))
      .returning({ id: socialAccountGroups.id });
    if (groupRows.length === 0) {
      throw new NotFoundException('分组不存在');
    }
    // 分组下账号移到未分组
    await this.db
      .update(socialAccounts)
      .set({ groupName: null, updatedAt: new Date() })
      .where(eq(socialAccounts.groupName, name));
  }

  async batchMove(dto: AccountBatchMoveDto): Promise<void> {
    if (dto.ids.length === 0) {
      throw new BadRequestException('未选择账号');
    }
    await this.db
      .update(socialAccounts)
      .set({
        groupName: dto.groupName ?? null,
        updatedAt: new Date(),
      })
      .where(inArray(socialAccounts.id, dto.ids));
  }

  /**
   * 校验单个账号登录态是否有效（cookie 过期检测 + 重新提取用户信息更新）：
   * 用本机 Edge 无头加载创作中心，判断是否被踢回登录页；同时从已保存登录态
   * 的 localStorage 重新提取昵称/头像回填。返回更新后的账号。
   */
  async verifyAccount(id: string): Promise<SocialAccount> {
    const rows: AccountRow[] = await this.db
      .select()
      .from(socialAccounts)
      .where(eq(socialAccounts.id, id))
      .limit(1);
    if (rows.length === 0) {
      throw new NotFoundException('账号不存在');
    }
    const account = rows[0];

    let online = false;
    let accountName = account.accountName;
    let avatar = account.avatar;
    let platformUid = account.platformUid;

    // 有独立登录态文件的账号（任意平台）可做 cookie 校验与信息回写
    if (account.platformUid) {
      const uid = account.platformUid.replace(/^[a-z]+-/, '');
      // 优先按 <platform>-<uid>.json 匹配；fallback 到 <platform>.json
      // （早期未提取到用户ID时登录态写在默认文件）
      let statePath = join(authDir(), `${account.platform}-${uid}.json`);
      if (!existsSync(statePath)) {
        const fallback = join(authDir(), `${account.platform}.json`);
        if (existsSync(fallback)) statePath = fallback;
      }
      if (existsSync(statePath)) {
        try {
          const state = JSON.parse(readFileSync(statePath, 'utf8'));
          // 重新提取用户信息（昵称/头像可能变化）
          const info = await extractStoredUserInfo(state, account.platform);
          if (info.userName) accountName = info.userName;
          if (info.userAvatar) avatar = info.userAvatar;
          // 规范化 fallback uid（早期未提取到用户ID的账号）：
          // 授权时能提取真实用户ID后，避免重新授权时新建重复账号
          if (
            info.userId &&
            account.platformUid.startsWith(`${account.platform}-browser-`)
          ) {
            platformUid = `${account.platform}-${info.userId}`;
          }
          // 无头访问创作中心，验证 cookie 是否仍有效，并抓取页面昵称/头像回填
          const result = await this.verifyCookieOnline(statePath, account.platform);
          online = result.online;
          // 页面提取仅做兜底：接口/localStorage 提取的昵称更准确
          // （如微博打开首页 title 是"微博-随时随地发现新鲜事"通用页名，不得覆盖真实昵称）
          if (!info.userName && result.userName) accountName = result.userName;
          // 头像优先级：localStorage 提取（稳定可加载）> 页面 DOM（可能带防盗链）
          if (info.userAvatar) avatar = info.userAvatar;
          else if (result.userAvatar) avatar = result.userAvatar;
        } catch (e) {
          console.error('[verify] 校验账号失败:', (e as Error).message);
        }
      }
    }

    const now = new Date();
    const updated: AccountRow[] = await this.db
      .update(socialAccounts)
      .set({
        online,
        accountName,
        avatar,
        platformUid,
        lastVerifiedAt: now,
      })
      .where(eq(socialAccounts.id, id))
      .returning();
    return this.toAccount(updated[0]);
  }

  /** 无头加载创作中心，判断登录态是否有效（是否被重定向到登录页），并抓取页面昵称/头像 */
  private async verifyCookieOnline(
    statePath: string,
    platform: SocialPlatform,
  ): Promise<{ online: boolean; userName?: string; userAvatar?: string }> {
    let browser: any = null;
    try {
      browser = await playwright.chromium.launch({
        channel: 'msedge',
        headless: true,
      });
      const context = await browser.newContext({ storageState: statePath });
      const page = await context.newPage();
      // 校验目标：优先创作中心 homeUrl（登录后可直达的后台），回退授权/登录入口 creatorUrl
      const targetUrl =
        PLATFORM_MAP[platform]?.homeUrl ?? PLATFORM_MAP[platform]?.creatorUrl;
      if (!targetUrl) return { online: false };
      await page.goto(targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      // 等待可能的登录页重定向
      await page.waitForTimeout(4000);
      const url = String(page.url() ?? '');
      const kickedToLogin =
        url.includes('login') ||
        url.includes('passport') ||
        url.includes('signin');
      // 会话级强校验：有标志性会话 cookie 才算在线（兜底 URL 判据的误判）
      const sessionCookies = await context.cookies().catch(() => []);
      const hasSession = hasSessionCookie(sessionCookies, platform);
      const noStrongCheck = !hasSessionCookieCheck(platform);
      // 微博特判：授权入口是 passport 登录页（passport.weibo.com/sso/signin），
      // 有 SUB/SUBP 会话 cookie 即视为在线（登录页本身不因含 "passport" 判离线）
      const weiboOnline = platform === 'weibo' && hasSession;
      const online = weiboOnline || (!kickedToLogin && (hasSession || noStrongCheck));
      // 页面昵称/头像回填（登录态有效时从 DOM 抓取）
      const pageInfo = online
        ? await extractPageUserInfo(page, platform).catch(() => ({}))
        : {};
      return { online, userName: pageInfo.userName, userAvatar: pageInfo.userAvatar };
    } catch {
      return { online: false };
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }
}
