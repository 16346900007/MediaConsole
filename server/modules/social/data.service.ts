/**
 * 数据页服务：
 * - overview：6 KPI 聚合（发布/粉丝/播放/评论/点赞/收藏）+ 账号筛选数据，10 分钟缓存 stale 标记
 * - sync：逐账号无头抓取平台真实作品（串行执行，防多窗口并发触发风控），upsert social_posts
 * - posts：账号作品列表
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { socialAccounts, socialPosts } from '@server/database/schema';
import type {
  DataAccountPoint,
  DataOverviewResponse,
  DataPlatformPoint,
  SocialPlatform,
  SocialPost,
} from '@shared/api.interface';
import { PLATFORM_MAP } from '@shared/platforms';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  followerCountByPlatform,
  PLATFORM_FETCHERS,
  type FetchContext,
  type SocialPostInput,
} from './data/fetchers';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const playwright = require('playwright') as any;

/** 缓存有效期：10 分钟 */
const CACHE_TTL_MS = 10 * 60 * 1000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PostRow = typeof socialPosts.$inferSelect;
type AccountRow = typeof socialAccounts.$inferSelect;

/** 登录态目录：%APPDATA%/SocialManager/auth */
function authDir(): string {
  const logDir = process.env.LOG_DIR;
  if (logDir) return join(logDir, '..', 'auth');
  return join(process.cwd(), 'auth');
}

@Injectable()
export class DataService {
  private readonly logger = new Logger(DataService.name);
  /** 同步中账号集合（防并发触发同一账号） */
  private readonly syncing = new Set<string>();
  /** 同步任务是否已排队（防重复整库同步） */
  private syncQueued = false;

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  /* ------------------------------------------------------------------ */
  /* 总览聚合                                                             */
  /* ------------------------------------------------------------------ */
  async getOverview(accountId?: string): Promise<DataOverviewResponse> {
    const conditions = accountId && UUID_PATTERN.test(accountId)
      ? [eq(socialPosts.accountId, accountId)]
      : [];
    const postsCond = conditions.length > 0 ? and(...conditions) : undefined;

    const [accounts, postRows, syncingAccounts] = await Promise.all([
      this.db.select().from(socialAccounts).orderBy(socialAccounts.createdAt),
      this.db.select().from(socialPosts).where(postsCond),
      this.listSyncingAccounts(),
    ]);

    // 账号级聚合
    const postByAccount = new Map<string, PostRow[]>();
    for (const row of postRows) {
      const arr = postByAccount.get(row.accountId) ?? [];
      arr.push(row);
      postByAccount.set(row.accountId, arr);
    }

    const byAccount: DataAccountPoint[] = accounts.map((acct) => {
      const posts = postByAccount.get(acct.id) ?? [];
      const agg = aggregate(posts);
      return {
        accountId: acct.id,
        accountName: acct.accountName,
        platform: acct.platform as SocialPlatform,
        avatar: acct.avatar,
        followersCount: acct.followersCount,
        postCount: posts.length,
        ...agg,
      };
    });

    // 平台级聚合
    const byPlatformMap = new Map<SocialPlatform, DataPlatformPoint>();
    for (const point of byAccount) {
      const existing = byPlatformMap.get(point.platform);
      if (!existing) {
        byPlatformMap.set(point.platform, {
          platform: point.platform,
          postCount: point.postCount,
          followersCount: point.followersCount,
          views: point.views,
          likes: point.likes,
          comments: point.comments,
          favorites: point.favorites,
        });
      } else {
        existing.postCount += point.postCount;
        existing.followersCount += point.followersCount;
        existing.views += point.views;
        existing.likes += point.likes;
        existing.comments += point.comments;
        existing.favorites += point.favorites;
      }
    }
    const byPlatform = Array.from(byPlatformMap.values()).sort(
      (a, b) => b.views - a.views,
    );

    const totals = byPlatform.reduce(
      (acc, p) => ({
        postCount: acc.postCount + p.postCount,
        followersCount: acc.followersCount + p.followersCount,
        views: acc.views + p.views,
        likes: acc.likes + p.likes,
        comments: acc.comments + p.comments,
        favorites: acc.favorites + p.favorites,
      }),
      { postCount: 0, followersCount: 0, views: 0, likes: 0, comments: 0, favorites: 0 },
    );

    // stale 判断：目标账号最近同步时间是否超过 10 分钟
    const targetAccounts = accountId ? accounts.filter((a) => a.id === accountId) : accounts;
    const syncedAt = targetAccounts.reduce<Date | null>((acc, a) => {
      if (!a.lastDataSyncedAt) return acc;
      const t = new Date(a.lastDataSyncedAt);
      return !acc || t > acc ? t : acc;
    }, null);
    const syncingNow = syncingAccounts.some((id) =>
      accountId ? id === accountId : true,
    );
    const stale =
      targetAccounts.length > 0 &&
      (syncedAt === null || Date.now() - syncedAt.getTime() > CACHE_TTL_MS);

    return {
      updatedAt: syncedAt ? syncedAt.toISOString() : null,
      stale: stale || syncingNow,
      syncing: syncingNow,
      totals,
      byPlatform,
      byAccount,
    };
  }

  /** 账号作品列表 */
  async listPosts(accountId: string): Promise<SocialPost[]> {
    if (!UUID_PATTERN.test(accountId)) {
      throw new NotFoundException('账号不存在');
    }
    const rows: PostRow[] = await this.db
      .select()
      .from(socialPosts)
      .where(eq(socialPosts.accountId, accountId))
      .orderBy(desc(socialPosts.publishedAt));
    return rows.map((row) => this.toPost(row));
  }

  /* ------------------------------------------------------------------ */
  /* 同步抓取                                                             */
  /* ------------------------------------------------------------------ */
  /**
   * 触发同步。默认全部账号；传 accountId 只同步该账号。
   * 串行执行（一次只跑一个账号），已在同步中的账号跳过。
   */
  async sync(accountId?: string): Promise<{ started: boolean; accounts: number }> {
    const conditions = accountId && UUID_PATTERN.test(accountId)
      ? [eq(socialAccounts.id, accountId)]
      : [];
    const rows: AccountRow[] = await this.db
      .select()
      .from(socialAccounts)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    const targets = rows.filter(
      (a) => a.platformUid && !this.syncing.has(a.id),
    );
    if (targets.length === 0) return { started: false, accounts: 0 };

    for (const acct of targets) this.syncing.add(acct.id);
    // 异步执行，不阻塞请求
    void this.runSync(targets)
      .catch((error) => {
        this.logger.error(`[data-sync] 同步异常：${error instanceof Error ? error.message : String(error)}`);
      })
      .finally(() => {
        for (const acct of targets) this.syncing.delete(acct.id);
      });
    return { started: true, accounts: targets.length };
  }

  private async runSync(accounts: AccountRow[]): Promise<void> {
    for (const acct of accounts) {
      try {
        const posts = await this.fetchPostsFor(acct);
        await this.upsertPosts(acct, posts);
        const fc = followerCountByPlatform[acct.platform as string];
        if (typeof fc === 'number' && fc > 0) {
          await this.db
            .update(socialAccounts)
            .set({ followersCount: fc, lastDataSyncedAt: new Date() })
            .where(eq(socialAccounts.id, acct.id));
          this.logger.log(
            `[data-sync] ${acct.platform}/${acct.accountName} 粉丝数回写 ${fc}`,
          );
        } else {
          await this.db
            .update(socialAccounts)
            .set({ lastDataSyncedAt: new Date() })
            .where(eq(socialAccounts.id, acct.id));
        }
        this.logger.log(
          `[data-sync] ${acct.platform}/${acct.accountName} 同步 ${posts.length} 条作品`,
        );
      } catch (e) {
        this.logger.warn(
          `[data-sync] ${acct.platform}/${acct.accountName} 同步失败: ${(e as Error).message}`,
        );
      }
    }
  }

  private async fetchPostsFor(acct: AccountRow): Promise<SocialPostInput[]> {
    const fetcher = PLATFORM_FETCHERS[acct.platform as SocialPlatform];
    if (!fetcher) return [];
    const uid = String(acct.platformUid ?? '').replace(/^[a-z]+-/, '');
    let statePath = join(authDir(), `${acct.platform}-${uid}.json`);
    if (!existsSync(statePath)) {
      const fallback = join(authDir(), `${acct.platform}.json`);
      if (existsSync(fallback)) statePath = fallback;
      else return [];
    }
    let browser: any = null;
    try {
      browser = await playwright.chromium.launch({
        channel: 'msedge',
        headless: true,
        args: ['--disable-blink-features=AutomationControlled'],
      });
      const context = await browser.newContext({
        storageState: statePath,
        viewport: { width: 1440, height: 900 },
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      });
      const page = await context.newPage();
      const ctx: FetchContext = {
        page,
        context,
        account: {
          id: acct.id,
          platformUid: acct.platformUid,
          accountName: acct.accountName,
        },
      };
      return await fetcher(ctx);
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }

  private async upsertPosts(
    acct: AccountRow,
    inputs: SocialPostInput[],
  ): Promise<void> {
    const fetchedIds: string[] = [];
    for (const input of inputs) {
      const id = input.platformPostId;
      if (!id) continue;
      fetchedIds.push(id);
      const values = {
        accountId: acct.id,
        platform: acct.platform,
        platformPostId: id,
        title: input.title ?? '',
        coverUrl: input.coverUrl ?? null,
        postUrl: input.postUrl ?? null,
        views: input.views ?? 0,
        likes: input.likes ?? 0,
        comments: input.comments ?? 0,
        favorites: input.favorites ?? 0,
        watchRate: input.watchRate ?? null,
        followersDelta: input.followersDelta ?? 0,
        publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
        raw: (input.raw ?? null) as any,
      };
      await this.db
        .insert(socialPosts)
        .values(values)
        .onConflictDoUpdate({
          target: [socialPosts.accountId, socialPosts.platformPostId],
          set: {
            title: values.title,
            coverUrl: values.coverUrl,
            postUrl: values.postUrl,
            views: values.views,
            likes: values.likes,
            comments: values.comments,
            favorites: values.favorites,
            watchRate: values.watchRate,
            followersDelta: values.followersDelta,
            publishedAt: values.publishedAt,
            raw: values.raw,
            updatedAt: new Date(),
          },
        });
    }
    // 清理平台已删除的作品：抓取成功（非空）时，删除本地不在本次抓取结果中的记录。
    // 空集合视为抓取失败/未登录，跳过清理避免误删历史数据。
    await this.deleteGonePosts(acct, fetchedIds);
  }

  /** 删除本地库中已不在平台作品列表里的记录（平台侧删除后同步自动清理） */
  private async deleteGonePosts(acct: AccountRow, fetchedIds: string[]): Promise<void> {
    if (fetchedIds.length === 0) return;
    const fetched = new Set(fetchedIds);
    const existing = await this.db
      .select({ platformPostId: socialPosts.platformPostId })
      .from(socialPosts)
      .where(eq(socialPosts.accountId, acct.id));
    const gone = existing
      .map((r) => r.platformPostId)
      .filter((id) => id && !fetched.has(id));
    if (gone.length === 0) return;
    // 分批删除（inArray 长列表拆 500 一批）
    for (let i = 0; i < gone.length; i += 500) {
      const batch = gone.slice(i, i + 500);
      await this.db
        .delete(socialPosts)
        .where(
          and(
            eq(socialPosts.accountId, acct.id),
            inArray(socialPosts.platformPostId, batch),
          ),
        );
    }
    this.logger.log(
      `[data-sync] ${acct.platform}/${acct.accountName} 清理 ${gone.length} 条平台已删除作品`,
    );
  }

  /* ------------------------------------------------------------------ */
  /* 工具                                                                 */
  /* ------------------------------------------------------------------ */
  private async listSyncingAccounts(): Promise<string[]> {
    return Array.from(this.syncing);
  }

  private toPost(row: PostRow): SocialPost {
    return {
      id: row.id,
      accountId: row.accountId,
      platform: row.platform as SocialPlatform,
      platformPostId: row.platformPostId,
      title: row.title,
      coverUrl: row.coverUrl,
      postUrl: row.postUrl,
      views: row.views,
      likes: row.likes,
      comments: row.comments,
      favorites: row.favorites,
      watchRate: row.watchRate === null ? null : Number(row.watchRate),
      followersDelta: row.followersDelta,
      raw: row.raw as Record<string, unknown> | null,
      publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

function aggregate(posts: PostRow[]) {
  let views = 0;
  let likes = 0;
  let comments = 0;
  let favorites = 0;
  for (const p of posts) {
    views += p.views;
    likes += p.likes;
    comments += p.comments;
    favorites += p.favorites;
  }
  return { views, likes, comments, favorites };
}
