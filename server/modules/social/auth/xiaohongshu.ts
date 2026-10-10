import { createHash } from 'node:crypto';

/**
 * 小红书开放平台（商家）OAuth 适配器
 * 官方文档：https://xiaohongshu.apifox.cn
 * - 授权页：https://ark.xiaohongshu.com/ark/authorization?appId=&redirectUri=&state=
 * - 换 token：POST https://ark.xiaohongshu.com/ark/open_api/v3/common_controller
 * - 签名：`method?appId=xxx&timestamp=xxx&version=2.0` + appSecret → MD5(hex 小写)
 */

export interface XhsTokenResult {
  accessToken: string;
  /** 过期时间（毫秒时间戳） */
  accessTokenExpiresAt: number;
  refreshToken: string;
  /** 过期时间（毫秒时间戳） */
  refreshTokenExpiresAt: number;
  /** 商家编码（平台侧唯一标识） */
  sellerId: string;
  /** 商家名 / 店铺名 */
  sellerName: string;
}

const AUTH_ENDPOINT = 'https://ark.xiaohongshu.com/ark/authorization';
const TOKEN_ENDPOINT = 'https://ark.xiaohongshu.com/ark/open_api/v3/common_controller';

/** 生成 open_api 请求签名（文档 doc-2810932：MD5） */
export function buildSign(opts: {
  appId: string;
  appSecret: string;
  method: string;
  timestamp: number;
}): string {
  const raw = `${opts.method}?appId=${opts.appId}&timestamp=${opts.timestamp}&version=2.0${opts.appSecret}`;
  return createHash('md5').update(raw, 'utf8').digest('hex');
}

/** 组装授权页地址（state 由平台原样带回） */
export function buildAuthorizeUrl(opts: {
  appId: string;
  redirectUri: string;
  state: string;
}): string {
  const q = new URLSearchParams({
    appId: opts.appId,
    redirectUri: opts.redirectUri,
    state: opts.state,
  });
  return `${AUTH_ENDPOINT}?${q.toString()}`;
}

/** 用授权 code 换取 accessToken / refreshToken / 商家信息 */
export async function exchangeCode(opts: {
  appId: string;
  appSecret: string;
  code: string;
}): Promise<XhsTokenResult> {
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = buildSign({
    appId: opts.appId,
    appSecret: opts.appSecret,
    method: 'oauth.getAccessToken',
    timestamp,
  });

  let res: Response;
  try {
    res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json;charset=utf-8' },
      body: JSON.stringify({
        sign,
        appId: opts.appId,
        timestamp: String(timestamp),
        version: '2.0',
        method: 'oauth.getAccessToken',
        code: opts.code,
      }),
    });
  } catch (e) {
    throw new Error(`小红书接口请求失败（网络/超时）: ${(e as Error).message}`);
  }

  const json = (await res.json().catch(() => null)) as {
    error_code?: number;
    error_msg?: string;
    success?: boolean;
    data?: {
      accessToken?: string;
      accessTokenExpiresAt?: number;
      refreshToken?: string;
      refreshTokenExpiresAt?: number;
      sellerId?: number | string;
      sellerName?: string;
    };
  } | null;

  if (!json || json.error_code !== 0 || !json.data?.accessToken) {
    throw new Error(
      `小红书换取 token 失败: HTTP ${res.status} ${JSON.stringify(json) ?? res.statusText}`,
    );
  }

  return {
    accessToken: json.data.accessToken,
    accessTokenExpiresAt: Number(json.data.accessTokenExpiresAt),
    refreshToken: json.data.refreshToken ?? '',
    refreshTokenExpiresAt: Number(json.data.refreshTokenExpiresAt),
    sellerId: String(json.data.sellerId),
    sellerName: String(json.data.sellerName),
  };
}
