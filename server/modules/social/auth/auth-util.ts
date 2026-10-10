import { join } from 'node:path';

/** 账号登录态目录：%APPDATA%/SocialManager/auth（由 LOG_DIR 推导） */
export function authDir(): string {
  const logDir = process.env.LOG_DIR;
  if (logDir) return join(logDir, '..', 'auth');
  return join(process.cwd(), 'auth');
}

/** 各平台 localStorage 中的用户信息 key（按优先级） */
const PLATFORM_USER_KEYS: Record<string, string[]> = {
  xiaohongshu: ['USER_INFO_FOR_BIZ', 'USER_INFO'],
  douyin: ['user_info', 'userInfo', 'USER_INFO', 'SSR_AWEME_USER'],
  bilibili: ['user', 'userInfo', 'bili_user'],
  shipinhao: ['userInfo', 'USERINFO', 'wx_user_info'],
  weibo: ['userInfo', 'USER_INFO', 'WBUser'],
  kuaishou: ['userInfo', 'user_info', 'KUAI_USER'],
  youtube: ['yt-remote-user', 'SESSION_PREFIX', 'SAPISID'],
};

/** 宽松解析一个可能含用户信息的对象/字符串，抓取常见字段 */
function pickInfo(raw: unknown): {
  userId?: string;
  userName?: string;
  userAvatar?: string;
} {
  const walk = (node: any, depth: number): {
    userId?: string;
    userName?: string;
    userAvatar?: string;
  } | null => {
    if (!node || depth > 6) return null;
    if (typeof node === 'string' || typeof node === 'number') return null;
    if (Array.isArray(node)) {
      for (const item of node) {
        const hit = walk(item, depth + 1);
        if (hit) return hit;
      }
      return null;
    }
    const out: { userId?: string; userName?: string; userAvatar?: string } = {};
    const strVal = (v: unknown): string | undefined =>
      typeof v === 'string' && v ? v : undefined;
    const idKey =
      ['userId', 'user_id', 'uid', 'mid', 'id', 'uin', 'userid'].find(
        (k) => k in node,
      ) ?? null;
    const nameKey =
      ['userName', 'user_name', 'nickname', 'nick', 'name', 'screenName'].find(
        (k) => k in node,
      ) ?? null;
    const avatarKey =
      [
        'userAvatar',
        'user_avatar',
        'avatar',
        'avatarUrl',
        'avatar_url',
        'headUrl',
        'head_img',
        'photo',
      ].find((k) => k in node) ?? null;
    if (idKey) out.userId = strVal(node[idKey]);
    if (nameKey) out.userName = strVal(node[nameKey]);
    if (avatarKey) out.userAvatar = strVal(node[avatarKey]);
    if (out.userName || out.userId) return out;
    for (const [k, v] of Object.entries(node)) {
      if (k === 'localStorage') continue;
      const hit = walk(v, depth + 1);
      if (hit) return hit;
    }
    return null;
  };
  let parsed: any = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return walk(parsed, 0) ?? {};
}

/**
 * 从 storageState 提取平台用户信息（昵称/头像/用户ID）。
 * B站走官方接口（页面/本地存储不渲染昵称）；其余平台优先查 localStorage key，
 * 再宽松扫描全部 localStorage，最后从 cookie 补平台用户 ID（抖音 uid_tt 等）。
 */
export async function extractStoredUserInfo(
  state: any,
  platform = 'xiaohongshu',
): Promise<{
  userId?: string;
  userName?: string;
  userAvatar?: string;
}> {
  // B站：创作中心不渲染昵称文本，直接调官方接口（cookie 带 SESSDATA）
  if (platform === 'bilibili') {
    const bili = await extractBiliFromApi(state);
    if (bili.userName || bili.userId) return bili;
  }
  // 微博：passport 登录页不渲染用户信息，直接调微博官方接口（cookie 带 SUB/SUBP）
  if (platform === 'weibo') {
    const wb = await extractWeiboFromApi(state);
    if (wb.userName || wb.userId) return wb;
  }
  // 抖音：uid_tt 是匿名设备 UUID（每次登录会变），必须走官方接口拿真实 uid
  // （www.douyin.com self 接口返回 user.uid/nickname/avatar，cookie 带 sessionid 即可）
  if (platform === 'douyin') {
    const dy = await extractDouyinFromApi(state);
    if (dy.userId) return dy;
  }
  // 视频号：finder_username 是视频号唯一 ID（同一微信可开多个视频号，cookie wxuin
  // 仅能区分微信账号），优先 localStorage 提取；wxuin 由下方 cookie 兜底
  if (platform === 'shipinhao') {
    for (const origin of state?.origins ?? []) {
      const hit = (origin.localStorage ?? []).find(
        (e: { name: string; value: string }) => e.name === 'finder_username',
      );
      if (hit?.value) {
        const uid = String(hit.value).replace(/@finder$/, '');
        if (uid) return { userId: uid };
      }
    }
  }
  let info: { userId?: string; userName?: string; userAvatar?: string } = {};
  try {
    const knownKeys = PLATFORM_USER_KEYS[platform] ?? [];
    for (const origin of state?.origins ?? []) {
      const entries = (origin.localStorage ?? []) as {
        name: string;
        value: string;
      }[];
      // 1. 平台已知 key
      for (const key of knownKeys) {
        const hit = entries.find((e) => e.name === key);
        if (!hit) continue;
        const found = pickInfo(hit.value);
        if (found.userName || found.userId) {
          info = found;
          break;
        }
      }
      // 2. 宽松扫描（避免漏抓）
      if (!info.userName && !info.userId) {
        for (const e of entries) {
          if (e.name.length > 40 || e.value.length > 20_000) continue;
          const found = pickInfo(e.value);
          if (found.userName || found.userId) {
            info = found;
            break;
          }
        }
      }
      if (info.userName || info.userId) break;
    }
  } catch {
    /* 忽略 */
  }
  // 3. cookie 中的平台用户 ID（localStorage 未命中时兜底）
  if (!info.userId) {
    const uidCookieKeys: Record<string, string[]> = {
      douyin: ['uid_tt'],
      bilibili: ['DedeUserID'],
      weibo: ['uid'],
      // 视频号（微信生态）localStorage 无用户信息，wxuin 是稳定微信用户 ID
      shipinhao: ['wxuin'],
      // 快手：userId 仅在登录后下发（游客无），是快手用户 ID
      kuaishou: ['userId'],
    };
    const keys = uidCookieKeys[platform] ?? [];
    for (const c of state?.cookies ?? []) {
      if (keys.includes(c.name) && c.value) {
        info.userId = c.value;
        break;
      }
    }
  }
  return info;
}

/**
 * 抖音官方接口提取：创作者中心/主页不渲染稳定用户 ID（localStorage 无用户信息，
 * cookie 的 uid_tt 是匿名设备 UUID 每次登录会变），直接调 www.douyin.com self 接口。
 * 需要 sessionid 登录 cookie；失败返回空由调用方回退现有 localStorage/cookie 逻辑。
 */
async function extractDouyinFromApi(state: any): Promise<{
  userId?: string;
  userName?: string;
  userAvatar?: string;
}> {
  try {
    const cookies = state?.cookies ?? [];
    const cookieStr = cookies
      .map((c: { name: string; value: string }) => `${c.name}=${c.value}`)
      .join('; ');
    if (!cookieStr.includes('sessionid')) return {};
    const res = await fetch(
      'https://www.douyin.com/aweme/v1/web/user/profile/self/?aid=6383&channel=channel_pc_web&mute=1&show_name=1',
      {
        headers: {
          Cookie: cookieStr,
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Referer: 'https://www.douyin.com/',
        },
        signal: AbortSignal.timeout(8000),
      },
    );
    const json = await res.json().catch(() => null);
    const u = json?.user;
    if (json?.status_code === 0 && u?.uid != null) {
      const avatar =
        u.avatar_168x168?.url_list?.[0] ||
        u.avatar_300x300?.url_list?.[0] ||
        u.avatar_larger?.url_list?.[0];
      return {
        userId: String(u.uid),
        userName: u.nickname || undefined,
        userAvatar: avatar || undefined,
      };
    }
  } catch {
    /* 忽略，调用方回退 */
  }
  return {};
}

/** 页面级用户信息提取（昵称/头像）：平台相关选择器，title 兜底 */
export async function extractPageUserInfo(
  page: any,
  platform = 'xiaohongshu',
): Promise<{ userName?: string; userAvatar?: string }> {
  if (platform === 'douyin') return extractDouyinPageUser(page);
  // B站创作中心不渲染昵称文本，页面仅兜底头像（bfs/face 为头像 CDN）
  if (platform === 'bilibili') {
    const avatar = await pickPageAvatar(page, [
      'img[src*="bfs/face"]',
      '[class*="avatar"] img',
      'img[class*="avatar"]',
    ]);
    return { userAvatar: avatar };
  }
  const sels = pageUserSelectors(platform);
  const avatar = await pickPageAvatar(page, sels.avatar);
  // 1. 常见用户区元素
  for (const selector of sels.name) {
    try {
      const loc = page.locator(selector);
      if ((await loc.count()) > 0) {
        const text = (await loc.first().textContent())?.trim();
        if (text && text.length >= 1 && text.length <= 30) {
          return { userName: text, userAvatar: avatar };
        }
      }
    } catch {
      /* 尝试下一个 */
    }
  }
  // 2. 页面 title 兜底（排除平台通用页面名）
  try {
    const title = (await page.title().catch(() => '')) ?? '';
    const banned = ['登录', '创作者中心', '创作服务平台', '创作中心'];
    if (title && !banned.some((w) => title.includes(w))) {
      const t = title.trim();
      if (t.length >= 1 && t.length <= 30) return { userName: t, userAvatar: avatar };
    }
  } catch {
    /* 忽略 */
  }
  return { userAvatar: avatar };
}

/**
 * 抖音创作者中心：头像 img 的 src 稳定含 aweme-avatar（class 为 hash 类名不可用），
 * 昵称取该头像元素祖先链文本的首行（用户卡片区：昵称\n抖音号\n签名）。
 */
async function extractDouyinPageUser(
  page: any,
): Promise<{ userName?: string; userAvatar?: string }> {
  try {
    const img = page.locator('img[src*="aweme-avatar"]');
    if ((await img.count()) > 0) {
      const src = (await img.first().getAttribute('src')) || undefined;
      const lines = await img
        .first()
        .evaluate((el: any) => {
          const out: string[] = [];
          let n = el;
          for (let i = 0; i < 6 && n; i++) {
            n = n.parentElement;
            if (!n) break;
            const t = (n.innerText || '').trim();
            if (t && t.length <= 120) out.push(t);
          }
          return out;
        })
        .catch(() => [] as string[]);
      let userName: string | undefined;
      for (const t of lines) {
        const first = t.split('\n')[0].trim();
        if (!first || first.length > 30) continue;
        if (
          ['关注', '粉丝', '获赞', '登录', '注册'].includes(first) ||
          first.includes('抖音号')
        ) {
          continue;
        }
        userName = first;
        break;
      }
      return {
        userName,
        userAvatar: src && /^https?:\/\//.test(src) ? src : undefined,
      };
    }
  } catch {
    /* 忽略 */
  }
  return {};
}

/** 各平台页面昵称/头像选择器 */
function pageUserSelectors(platform: string): {
  name: string[];
  avatar: string[];
} {
  const common = {
    name: ['[class*="nickname"]', '[class*="user-name"]', 'img[alt*="头像"]'],
    avatar: ['[class*="avatar"] img', 'img[class*="avatar"]'],
  };
  if (platform === 'douyin') {
    return {
      name: [
        '[data-e2e*="nickname"]',
        '[class*="nickname"]',
        '[class*="user-name"]',
        '[class*="user-info"]',
        '[class*="username"]',
        'img[alt*="头像"]',
      ],
      avatar: [
        '[class*="avatar"] img',
        'img[class*="avatar"]',
        '[data-e2e*="avatar"] img',
        'img[data-e2e*="avatar"]',
      ],
    };
  }
  return common;
}

/**
 * 微博官方信息提取：passport 登录页/创作平台不渲染用户信息，直接抓 weibo.com 首页。
 * 首页 HTML 内嵌 window.$CONFIG.user（id / screen_name / profile_image_url），
 * 需要 SUB/SUBP 登录 cookie（weibo.com 域）；失败返回空由调用方回退。
 */
async function extractWeiboFromApi(state: any): Promise<{
  userId?: string;
  userName?: string;
  userAvatar?: string;
}> {
  try {
    const cookies = state?.cookies ?? [];
    const cookieStr = cookies
      .map((c: { name: string; value: string }) => `${c.name}=${c.value}`)
      .join('; ');
    if (!cookieStr.includes('SUB')) return {};
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const html = await fetch('https://weibo.com/', {
      headers: { Cookie: cookieStr, 'User-Agent': ua },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    })
      .then((r) => r.text().catch(() => ''))
      .catch(() => '');
    if (!html.includes('$CONFIG')) return {};
    // 提取 $CONFIG.user 对象片段（字段顺序不固定，逐个正则抓取）
    const user = html.match(/"user"\s*:\s*\{[^}]{0,1200}/)?.[0];
    if (!user) return {};
    const id = user.match(/"id"\s*:\s*(\d+)/)?.[1];
    const name = user.match(/"screen_name"\s*:\s*"([^"]+)"/)?.[1];
    const avatar = user.match(/"profile_image_url"\s*:\s*"(https?:[^"]+)"/)?.[1];
    if (id && name) {
      return {
        userId: id,
        userName: name,
        userAvatar: avatar || undefined,
      };
    }
  } catch {
    /* 忽略，调用方回退 */
  }
  return {};
}

/**
 * B站官方接口提取（创作中心页面不渲染昵称文本，接口最可靠）。
 * 需要 SESSDATA 登录 cookie；失败返回空由调用方回退。
 */async function extractBiliFromApi(state: any): Promise<{
  userId?: string;
  userName?: string;
  userAvatar?: string;
}> {
  try {
    const cookies = state?.cookies ?? [];
    const cookieStr = cookies
      .map((c: { name: string; value: string }) => `${c.name}=${c.value}`)
      .join('; ');
    if (!cookieStr.includes('SESSDATA')) return {};
    const res = await fetch('https://api.bilibili.com/x/web-interface/nav', {
      headers: {
        Cookie: cookieStr,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(8000),
    });
    const json = await res.json().catch(() => null);
    if (json?.code === 0 && json?.data?.isLogin) {
      return {
        userId: json.data.mid != null ? String(json.data.mid) : undefined,
        userName: json.data.uname || undefined,
        userAvatar: json.data.face || undefined,
      };
    }
  } catch {
    /* 忽略，调用方回退 */
  }
  return {};
}

/** 从页面取头像图片地址 */
async function pickPageAvatar(
  page: any,
  avatarSelectors: string[],
): Promise<string | undefined> {
  for (const selector of avatarSelectors) {
    try {
      const loc = page.locator(selector);
      if ((await loc.count()) > 0) {
        const src = await loc
          .first()
          .getAttribute('src')
          .catch(() => null);
        if (src && /^https?:\/\//.test(src)) return src;
      }
    } catch {
      /* 尝试下一个 */
    }
  }
  return undefined;
}
