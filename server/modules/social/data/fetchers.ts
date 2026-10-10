/**
 * 平台作品抓取适配器：playwright 带登录态抓各平台创作中心的真实作品数据。
 * 每个平台实现 fetchPosts(context, account) → SocialPostInput[]。
 * 通用策略：监听页面真实请求（创作中心自动拉取作品列表的接口），
 * 必要时滚动/点击"加载更多"翻页，避免手工构造带签名的请求。
 */
import type { Page, BrowserContext } from 'playwright';
import type { SocialPlatform } from '@shared/api.interface';

/** 各平台账号粉丝数（适配器抓取时写入，data.service 同步后回写 social_accounts） */
export const followerCountByPlatform: Record<string, number> = {};

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
/* 抖音：creator.douyin.com/creator-micro/content/manage               */
/* 接口 /janus/douyin/creator/pc/work_list                             */
/* 字段：aweme_id/caption/Cover.url_list/create_time(秒)/               */
/*       statistics{play_count,digg_count,comment_count,collect_count,  */
/*       share_count}/share_url，翻页 has_more+max_cursor               */
/* ------------------------------------------------------------------ */
async function fetchDouyin(ctx: FetchContext): Promise<SocialPostInput[]> {
  const { page } = ctx;
  const responses: Record<string, any>[] = [];

  page.on('response', async (resp) => {
    const url = resp.url();
    if (url.includes('/janus/douyin/creator/pc/work_list')) {
      try {
        const json = JSON.parse(await resp.text());
        if (Array.isArray(json?.aweme_list)) responses.push(json);
      } catch {
        /* 忽略不可解析响应 */
      }
    }
  });

  await page
    .goto('https://creator.douyin.com/creator-micro/content/manage', {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    })
    .catch(() => {});
  await page.waitForTimeout(10000);

  // 滚动触发懒加载/翻页
  for (let round = 0; round < 6; round += 1) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
    await page.waitForTimeout(2500);
  }
  await page.waitForTimeout(1500);

  const map = new Map<string, SocialPostInput>();
  for (const json of responses) {
    for (const item of json.aweme_list ?? []) {
      const id = String(item.aweme_id ?? item.item_id ?? '');
      if (!id || map.has(id)) continue;
      const stat = item.statistics ?? {};
      const author = item.author ?? {};
      if (Number(author.follower_count) > 0)
        followerCountByPlatform.douyin = Number(author.follower_count);
      map.set(id, {
        platformPostId: id,
        title: String(item.caption || item.item_title || item.desc || '').replace(/\s+/g, ' ').trim(),
        coverUrl: item.Cover?.url_list?.[0] ?? null,
        postUrl: `https://www.douyin.com/video/${id}`,
        views: Number(stat.play_count ?? 0),
        likes: Number(stat.digg_count ?? 0),
        comments: Number(stat.comment_count ?? 0),
        favorites: Number(stat.collect_count ?? 0),
        watchRate: null,
        followersDelta: 0,
        publishedAt: item.create_time
          ? new Date(Number(item.create_time) * 1000).toISOString()
          : null,
        raw: item,
      });
    }
  }
  return Array.from(map.values());
}

/* ------------------------------------------------------------------ */
/* 小红书：creator.xiaohongshu.com/new/note-manager                     */
/* 接口 /api/galaxy/v2/creator/note/user/posted                        */
/* 字段：id/display_title/images_list[0].url/visible_time(秒)/          */
/*       view_count/likes/comments_count/collected_count/shared_count/  */
/*       xsec_token + xsec_source（详情页跳转需要）                     */
/* ------------------------------------------------------------------ */
async function fetchXiaohongshu(ctx: FetchContext): Promise<SocialPostInput[]> {
  const { page } = ctx;
  const responses: Record<string, any>[] = [];

  page.on('response', async (resp) => {
    const url = resp.url();
    if (url.includes('/api/galaxy/v2/creator/note/user/posted')) {
      try {
        const json = JSON.parse(await resp.text());
        if (Array.isArray(json?.data?.notes)) responses.push(json);
      } catch {
        /* 忽略不可解析响应 */
      }
    }
  });

  await page
    .goto('https://creator.xiaohongshu.com/new/note-manager', {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    })
    .catch(() => {});
  await page.waitForTimeout(10000);

  // 滚动触发懒加载
  for (let round = 0; round < 6; round += 1) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
    await page.waitForTimeout(2500);
  }
  await page.waitForTimeout(1500);

  const map = new Map<string, SocialPostInput>();
  for (const json of responses) {
    for (const item of json.data?.notes ?? []) {
      const id = String(item.id ?? '');
      if (!id || map.has(id)) continue;
      const token = item.xsec_token ?? '';
      const source = item.xsec_source ?? 'pc_creatormng';
      const suffix = token ? `?xsec_token=${encodeURIComponent(token)}&xsec_source=${encodeURIComponent(source)}` : '';
      map.set(id, {
        platformPostId: id,
        title: String(item.display_title ?? '').replace(/\s+/g, ' ').trim(),
        coverUrl: item.images_list?.[0]?.url ?? null,
        postUrl: `https://www.xiaohongshu.com/explore/${id}${suffix}`,
        views: Number(item.view_count ?? 0),
        likes: Number(item.likes ?? 0),
        comments: Number(item.comments_count ?? 0),
        favorites: Number(item.collected_count ?? 0),
        watchRate: null,
        followersDelta: 0,
        publishedAt: item.visible_time
          ? new Date(Number(item.visible_time) * 1000).toISOString()
          : null,
        raw: item,
      });
    }
  }
  return Array.from(map.values());
}

/* ------------------------------------------------------------------ */
/* B站：member.bilibili.com 内容管理-稿件管理                           */
/* 接口 /x/web/archives（页面内点击触发）                                */
/* 字段：arc_audits[].Archive{bvid/title/cover/duration/ptime(秒)}      */
/*       + arc_audits[].stat{view/like/coin/favorite/reply/danmaku/share} */
/* ------------------------------------------------------------------ */
async function fetchBilibili(ctx: FetchContext): Promise<SocialPostInput[]> {
  const { page } = ctx;
  const responses: Record<string, any>[] = [];

  page.on('response', async (resp) => {
    const url = resp.url();
    if (url.includes('/x/web/archives')) {
      try {
        const json = JSON.parse(await resp.text());
        if (Array.isArray(json?.data?.arc_audits)) responses.push(json);
      } catch {
        /* 忽略不可解析响应 */
      }
    }
  });

  await page
    .goto('https://member.bilibili.com/platform/home', {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    })
    .catch(() => {});
  await page.waitForTimeout(8000);

  // 点击左侧「稿件管理」菜单
  const clicked = await page
    .evaluate(() => {
      const spans = Array.from(document.querySelectorAll('span'));
      const target = spans.find((s) => (s.textContent || '').trim() === '稿件管理');
      if (!target) return false;
      let el: Element | null = target;
      for (let i = 0; i < 5 && el; i += 1) {
        if (el.tagName === 'A' && el.getAttribute('href')) {
          el.click();
          return true;
        }
        el = el.parentElement;
      }
      target.click();
      return true;
    })
    .catch(() => false);
  if (!clicked) {
    // 兜底：直接 goto 稿件管理路由（部分版本可直达）
    await page
      .goto('https://member.bilibili.com/platform/upload-manager/article', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      })
      .catch(() => {});
  }
  await page.waitForTimeout(9000);

  // 滚动触发翻页
  for (let round = 0; round < 6; round += 1) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
    await page.waitForTimeout(2200);
  }
  await page.waitForTimeout(1500);

  const map = new Map<string, SocialPostInput>();
  for (const json of responses) {
    for (const entry of json.data?.arc_audits ?? []) {
      const archive = entry?.Archive ?? {};
      const id = String(archive.bvid ?? archive.aid ?? '');
      if (!id || map.has(id)) continue;
      const stat = entry?.stat ?? {};
      map.set(id, {
        platformPostId: id,
        title: String(archive.title ?? '').replace(/\s+/g, ' ').trim(),
        coverUrl: archive.cover ?? null,
        postUrl: `https://www.bilibili.com/video/${id}`,
        views: Number(stat.view ?? 0),
        likes: Number(stat.like ?? 0),
        comments: Number(stat.reply ?? 0),
        favorites: Number(stat.favorite ?? 0),
        watchRate: null,
        followersDelta: 0,
        publishedAt: archive.ptime
          ? new Date(Number(archive.ptime) * 1000).toISOString()
          : null,
        raw: { archive, stat, typename: entry.typename ?? '' },
      });
    }
  }
  return Array.from(map.values());
}

/* ------------------------------------------------------------------ */
/* 视频号：channels.weixin.qq.com/platform/post/list                    */
/* 接口 /cgi-bin/mmfinderassistant-bin/post/post_list                   */
/* 字段：objectId/createTime(秒)/readCount/likeCount/commentCount/      */
/*       favCount/forwardCount/desc.media[]{thumbUrl,coverUrl,          */
/*       videoPlayLen}                                                 */
/* ------------------------------------------------------------------ */
async function fetchShipinhao(ctx: FetchContext): Promise<SocialPostInput[]> {
  const { page } = ctx;
  const responses: Record<string, any>[] = [];

  page.on('response', async (resp) => {
    const url = resp.url();
    if (url.includes('/cgi-bin/mmfinderassistant-bin/post/post_list')) {
      try {
        const json = JSON.parse(await resp.text());
        if (Array.isArray(json?.data?.list)) responses.push(json);
      } catch {
        /* 忽略不可解析响应 */
      }
    }
  });

  await page
    .goto('https://channels.weixin.qq.com/platform/post/list', {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    })
    .catch(() => {});
  await page.waitForTimeout(10000);

  // 滚动触发翻页
  for (let round = 0; round < 6; round += 1) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
    await page.waitForTimeout(2500);
  }
  await page.waitForTimeout(1500);

  const map = new Map<string, SocialPostInput>();
  for (const json of responses) {
    for (const item of json.data?.list ?? []) {
      const id = String(item.objectId ?? '');
      if (!id || map.has(id)) continue;
      const media = item.desc?.media?.[0] ?? {};
      map.set(id, {
        platformPostId: id,
        title: String(item.desc?.text ?? '').replace(/\s+/g, ' ').trim(),
        coverUrl: media.coverUrl ?? media.thumbUrl ?? null,
        postUrl: `https://channels.weixin.qq.com/platform/post/${id}`,
        views: Number(item.readCount ?? 0),
        likes: Number(item.likeCount ?? 0),
        comments: Number(item.commentCount ?? 0),
        favorites: Number(item.favCount ?? 0),
        watchRate: null,
        followersDelta: 0,
        publishedAt: item.createTime
          ? new Date(Number(item.createTime) * 1000).toISOString()
          : null,
        raw: item,
      });
    }
  }
  return Array.from(map.values());
}

/* ------------------------------------------------------------------ */
/* 微博：weibo.com/u/<uid>（个人主页）                                   */
/* 接口 /ajax/statuses/mymblog                                         */
/* 字段：idstr/mblogid/text_raw/reads_count/attitudes_count(赞)/        */
/*       comments_count/reposts_count(转)/created_at(文本)/             */
/*       url_struct[0].long_url（原博文链接）                          */
/* ------------------------------------------------------------------ */
function parseWeiboTime(s: string): string | null {
  // "Sat Oct 10 18:58:34 +0800 2026"
  const m = s.match(/(\w{3}) (\w{3}) (\d{2}) (\d{2}):(\d{2}):(\d{2}) [+-]\d{4} (\d{4})/);
  if (!m) return null;
  const months: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const mon = months[m[2]];
  if (mon === undefined) return null;
  const d = new Date(Date.UTC(Number(m[7]), mon, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])));
  // 减去 +0800 时区偏移，得到 UTC
  return new Date(d.getTime() - 8 * 3600 * 1000).toISOString();
}

async function fetchWeibo(ctx: FetchContext): Promise<SocialPostInput[]> {
  const { page, account } = ctx;
  const responses: Record<string, any>[] = [];

  page.on('response', async (resp) => {
    const url = resp.url();
    if (url.includes('/ajax/statuses/mymblog')) {
      try {
        const json = JSON.parse(await resp.text());
        if (Array.isArray(json?.data?.list)) {
          responses.push(json);
          const u = json.data?.user;
          if (u && Number(u.followers_count) > 0)
            followerCountByPlatform.weibo = Number(u.followers_count);
        }
      } catch {
        /* 忽略不可解析响应 */
      }
    }
    // 个人主页用户信息接口（含 followers_count）
    if (url.includes('/ajax/profile/info') || url.includes('/ajax/statuses/profile')) {
      try {
        const json = JSON.parse(await resp.text());
        const u = json?.data?.user ?? json?.user;
        if (u && Number(u.followers_count) > 0)
          followerCountByPlatform.weibo = Number(u.followers_count);
      } catch {
        /* 忽略不可解析响应 */
      }
    }
  });

  const uid = String(account.platformUid || '').replace(/^[a-z]+-/, '');
  await page
    .goto(`https://weibo.com/u/${uid}`, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    })
    .catch(() => {});
  await page.waitForTimeout(10000);

  // 滚动触发加载更多
  for (let round = 0; round < 6; round += 1) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
    await page.waitForTimeout(2500);
  }
  await page.waitForTimeout(1500);

  const map = new Map<string, SocialPostInput>();
  for (const json of responses) {
    for (const item of json.data?.list ?? []) {
      const id = String(item.mblogid ?? item.idstr ?? item.id ?? '');
      if (!id || map.has(id)) continue;
      const link = item.url_struct?.find((u: any) => u?.long_url)?.long_url ?? null;
      // 纯文本（去 html 标签）
      const rawText = String(item.text_raw ?? item.text ?? '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      map.set(id, {
        platformPostId: id,
        title: rawText.slice(0, 200),
        coverUrl: (() => {
          const pi = item.page_info ?? {};
          if (pi?.page_pic?.url) return pi.page_pic.url;
          if (pi?.media_info?.h5_url) return null;
          return null;
        })(),
        postUrl: link ?? `https://weibo.com/${uid}/${id}`,
        views: Number(item.reads_count ?? 0),
        likes: Number(item.attitudes_count ?? 0),
        comments: Number(item.comments_count ?? 0),
        favorites: 0, // 微博无收藏指标（转发见 raw.reposts_count）
        watchRate: null,
        followersDelta: 0,
        publishedAt: parseWeiboTime(String(item.created_at ?? '')),
        raw: item,
      });
    }
  }
  return Array.from(map.values());
}

/* ------------------------------------------------------------------ */
/* YouTube：studio.youtube.com/channel/<id>/videos                      */
/* 接口 /youtubei/v1/creator/list_creator_videos                        */
/* 字段：videos[]{videoId/title/thumbnail.thumbnail.thumbnails[0].url/  */
/*       publishedTimeText/viewsText/likesText/commentsText}            */
/* ------------------------------------------------------------------ */
function parseYtCount(s: string): number {
  // "1.2万次观看" → 12000；"3,456次观看" → 3456
  const m = String(s ?? '').replace(/[，,]/g, '').match(/([\d.]+)\s*(万|亿)?/);
  if (!m) return 0;
  const n = Number(m[1]);
  if (m[2] === '万') return Math.round(n * 10000);
  if (m[2] === '亿') return Math.round(n * 100000000);
  return Math.round(n);
}

async function fetchYoutube(ctx: FetchContext): Promise<SocialPostInput[]> {
  const { page, account } = ctx;
  const responses: Record<string, any>[] = [];

  page.on('response', async (resp) => {
    const url = resp.url();
    if (url.includes('/youtubei/v1/creator/list_creator_videos')) {
      try {
        const json = JSON.parse(await resp.text());
        if (Array.isArray(json?.videos)) responses.push(json);
      } catch {
        /* 忽略不可解析响应 */
      }
    }
  });

  const channelId = String(account.platformUid || '').replace(/^[a-z]+-/, '');
  await page
    .goto(`https://studio.youtube.com/channel/${channelId}/videos`, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    })
    .catch(() => {});
  await page.waitForTimeout(12000);

  // 滚动触发懒加载
  for (let round = 0; round < 6; round += 1) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
    await page.waitForTimeout(2500);
  }
  await page.waitForTimeout(1500);

  const map = new Map<string, SocialPostInput>();
  for (const json of responses) {
    for (const item of json.videos ?? []) {
      const id = String(item.videoId ?? '');
      if (!id || map.has(id)) continue;
      const thumb = item.thumbnail?.thumbnail?.thumbnails?.[0]?.url ?? null;
      map.set(id, {
        platformPostId: id,
        title: String(item.title ?? '').replace(/\s+/g, ' ').trim(),
        coverUrl: thumb,
        postUrl: `https://www.youtube.com/watch?v=${id}`,
        views: parseYtCount(item.viewsText),
        likes: parseYtCount(item.likesText),
        comments: parseYtCount(item.commentsText),
        favorites: 0,
        watchRate: null,
        followersDelta: 0,
        publishedAt: null, // Studio 列表无绝对时间，raw 保留 publishedTimeText
        raw: item,
      });
    }
  }
  return Array.from(map.values());
}

/* ------------------------------------------------------------------ */
/* 平台适配器注册表                                                      */
/* ------------------------------------------------------------------ */
async function fetchUnsupported(): Promise<SocialPostInput[]> {
  return [];
}

export const PLATFORM_FETCHERS: Record<SocialPlatform, PlatformFetcher> = {
  kuaishou: fetchKuaishou,
  douyin: fetchDouyin,
  xiaohongshu: fetchXiaohongshu,
  bilibili: fetchBilibili,
  shipinhao: fetchShipinhao,
  weibo: fetchWeibo,
  youtube: fetchYoutube,
};
