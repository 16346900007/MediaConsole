/**
 * 平台作品抓取适配器：playwright 带登录态抓各平台创作中心的真实作品数据。
 * 每个平台实现 fetchPosts(context, account) → SocialPostInput[]。
 * 通用策略：监听页面真实请求（创作中心自动拉取作品列表的接口），
 * 必要时滚动/点击"加载更多"翻页，避免手工构造带签名的请求。
 */
import type { Page, BrowserContext } from 'playwright';
import type { SocialPlatform } from '@shared/api.interface';

export interface SocialPostInput {
  platformPostId: string;
  title: string;
  coverUrl?: string | null;
  postUrl?: string | null;
  views?: number;
  likes?: number;
  comments?: number;
  favorites?: number;
  /** 完播率（%），平台无此指标时为 null */
  watchRate?: number | null;
  followersDelta?: number;
  publishedAt?: string | null;
  /** 平台原始数据（前端平台特有列展示用） */
  raw?: Record<string, unknown> | null;
}

export interface FetchContext {
  page: Page;
  context: BrowserContext;
  account: { id: string; platformUid?: string | null; accountName: string };
}

export type PlatformFetcher = (ctx: FetchContext) => Promise<SocialPostInput[]>;

/* ------------------------------------------------------------------ */
/* 快手：cp.kuaishou.com/profile/works                                  */
/* 作品分析接口 rest/cp/creator/analysis/pc/home/photo/list             */
/* 字段：photoId/title/cover/publishTime/playCount/likeCount/           */
/*       commentCount/collectCount/followCount/fpr(完播率小数)          */
/* ------------------------------------------------------------------ */
async function fetchKuaishou(ctx: FetchContext): Promise<SocialPostInput[]> {
  const { page } = ctx;
  const captured: { items: Record<string, any>[]; list: Record<string, any>[] }[] = [];

  page.on('response', async (resp) => {
    const url = resp.url();
    if (
      url.includes('/rest/cp/') &&
      (url.includes('analysis/pc/home/photo/list') ||
        url.includes('works/v2/video/pc/home/photo/list'))
    ) {
      try {
        const json = JSON.parse(await resp.text());
        const items = json?.data?.photoList?.photoItems;
        const list = json?.data?.list;
        if (Array.isArray(items) || Array.isArray(list)) {
          captured.push({ items: items ?? [], list: list ?? [] });
        }
      } catch {
        /* 忽略不可解析响应 */
      }
    }
  });

  await page
    .goto('https://cp.kuaishou.com/profile/works', {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    })
    .catch(() => {});
  // 等待作品列表接口返回
  await page.waitForTimeout(6000);

  // 循环翻页：作品数未齐时滚动 + 点击"加载更多"
  for (let round = 0; round < 8; round += 1) {
    const seen = new Set<string>();
    for (const cap of captured) {
      for (const item of cap.items) if (item.photoId) seen.add(String(item.photoId));
      for (const item of cap.list) if (item.workId) seen.add(String(item.workId));
    }
    const totalText = await page
      .evaluate(() => {
        // 从页面上找到作品总数（如 "共 12 条"）
        const el = Array.from(document.querySelectorAll('*')).find(
          (e) => e.children.length === 0 && /共\s*\d+\s*条/.test(e.textContent || ''),
        );
        return el ? (el.textContent || '').match(/\d+/)?.[0] ?? '' : '';
      })
      .catch(() => '');
    const total = totalText ? Number(totalText) : seen.size;
    if (total <= seen.size) break;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
    await page.waitForTimeout(2200);
    const clicked = await page
      .evaluate(() => {
        const btns = Array.from(
          document.querySelectorAll('button, span, div, a'),
        ).filter((b) => /加载更多|查看更多/.test(b.textContent || ''));
        if (btns.length) {
          btns[0].click();
          return true;
        }
        return false;
      })
      .catch(() => false);
    if (!clicked) await page.waitForTimeout(2500);
  }
  await page.waitForTimeout(2000);

  // 合并去重：analysis（字段全）优先
  const map = new Map<string, SocialPostInput>();
  const collect = (id: string, item: Record<string, any>, fromList: boolean) => {
    if (!id || map.has(id)) return;
    map.set(id, {
      platformPostId: id,
      title: String(item.title ?? '').replace(/\s+/g, ' ').trim(),
      coverUrl: item.cover ?? item.publishCoverUrl ?? null,
      postUrl: `https://www.kuaishou.com/short-video/${id}`,
      views: Number(item.playCount ?? 0),
      likes: Number(item.likeCount ?? 0),
      comments: Number(item.commentCount ?? 0),
      favorites: Number(item.collectCount ?? 0),
      watchRate:
        typeof item.fpr === 'number'
          ? Number((item.fpr * 100).toFixed(2))
          : null,
      followersDelta: Number(item.followCount ?? 0),
      publishedAt: (() => {
        const ts = item.publishTime ?? item.uploadTime;
        return ts ? new Date(Number(ts)).toISOString() : null;
      })(),
      raw: item,
    });
  };
  for (const cap of captured) {
    for (const item of cap.items) collect(String(item.photoId ?? ''), item, false);
    for (const item of cap.list) collect(String(item.workId ?? ''), item, true);
  }
  return Array.from(map.values());
}

/* ------------------------------------------------------------------ */
/* 平台适配器注册表：未实测平台留占位（返回空，待逐个适配）              */
/* ------------------------------------------------------------------ */
async function fetchUnsupported(): Promise<SocialPostInput[]> {
  return [];
}

export const PLATFORM_FETCHERS: Record<SocialPlatform, PlatformFetcher> = {
  kuaishou: fetchKuaishou,
  douyin: fetchUnsupported,
  xiaohongshu: fetchUnsupported,
  bilibili: fetchUnsupported,
  shipinhao: fetchUnsupported,
  weibo: fetchUnsupported,
  youtube: fetchUnsupported,
};
