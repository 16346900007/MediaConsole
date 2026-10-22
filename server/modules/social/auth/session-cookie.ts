import type { SocialPlatform } from '@shared/api.interface';

/**
 * 平台登录会话的标志性 cookie 键。
 * 命中任意一个即确认该平台已完成登录（比"URL 是否在登录页"更可靠——
 * 抖音等平台未登录时不跳独立登录域，仅靠 URL 会把未登录误判为已登录）。
 * 未列出的平台（如视频号，微信扫码登录态由微信域管理）不做强校验，回退 URL 判据。
 */
export const SESSION_COOKIE_KEYS: Partial<Record<SocialPlatform, string[]>> = {
  // 注意：只放"登录后才有"的会话凭证。抖音未登录也会种 passport_csrf_token
  // （匿名 CSRF 令牌），绝不能作为会话判据；sessionid 才是登录会话
  douyin: ['sessionid'],
  // 小红书创作者中心登录态没有主站的 web_session，用创作者平台自身的
  // 登录凭证（access token / SSO 会话 / 用户ID，游客不会下发）
  xiaohongshu: [
    'access-token-creator.xiaohongshu.com',
    'customer-sso-sid',
    'x-user-id-creator.xiaohongshu.com',
  ],
  bilibili: ['SESSDATA'],
  weibo: ['SUB', 'SUBP'],
  kuaishou: ['kuaishou.web.cp.api_st', 'userId'],
  // 实测：快手创作者平台登录态由 api_st/userId 维系（发布页可用），
  // kwssectoken/kwscode 过期不影响已登录会话，不作为判据。
  youtube: ['SID', 'SSID'],
};

/** 该平台是否配置了会话 cookie 强校验（未配置则仅靠 URL 判据） */
export function hasSessionCookieCheck(platform: SocialPlatform): boolean {
  return (SESSION_COOKIE_KEYS[platform]?.length ?? 0) > 0;
}

/** 从 cookie 列表中判断是否命中平台的标志性会话 cookie */
export function hasSessionCookie(
  cookies: { name: string }[],
  platform: SocialPlatform,
): boolean {
  const keys = SESSION_COOKIE_KEYS[platform];
  if (!keys || keys.length === 0) return false;
  const names = new Set(cookies.map((c) => c.name));
  return keys.some((k) => names.has(k));
}
