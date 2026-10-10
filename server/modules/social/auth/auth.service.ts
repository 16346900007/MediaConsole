import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { and, eq } from 'drizzle-orm';
import { socialAccounts } from '@server/database/schema';
import type { SocialPlatform } from '@shared/api.interface';
import { buildAuthorizeUrl, exchangeCode } from './xiaohongshu';

/** 授权码 10 分钟有效，state 同步过期 */
const STATE_TTL_MS = 10 * 60 * 1000;

export interface StartAuthResult {
  authUrl: string;
  state: string;
  configured: boolean;
  message?: string;
}

export interface CallbackResult {
  success: boolean;
  platform?: SocialPlatform;
  accountName?: string;
  message: string;
}

@Injectable()
export class AuthService {
  /** state -> 授权发起记录（进程内，授权流程短，重启失效可接受） */
  private readonly states = new Map<
    string,
    { platform: SocialPlatform; createdAt: number }
  >();

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  /** 发起平台授权，返回引导用户跳转的授权页地址 */
  async startAuth(
    platform: SocialPlatform,
    redirectUri: string,
  ): Promise<StartAuthResult> {
    const state = `${platform}:${randomUUID().replaceAll('-', '')}`;
    this.states.set(state, { platform, createdAt: Date.now() });
    this.pruneStates();

    switch (platform) {
      case 'xiaohongshu': {
        const appId = process.env.XHS_APP_ID;
        const appSecret = process.env.XHS_APP_SECRET;
        if (!appId || !appSecret) {
          return {
            authUrl: '',
            state,
            configured: false,
            message: '小红书凭证未配置：请在本机 env.local 填写 XHS_APP_ID / XHS_APP_SECRET',
          };
        }
        return {
          authUrl: buildAuthorizeUrl({ appId, redirectUri, state }),
          state,
          configured: true,
        };
      }
      default:
        return {
          authUrl: '',
          state,
          configured: false,
          message: `平台 ${platform} 暂未接入 OAuth 授权`,
        };
    }
  }

  /** 处理平台授权回调（code + state） */
  async handleCallback(
    state: string,
    code: string,
  ): Promise<CallbackResult> {
    if (!state || !code) {
      return { success: false, message: '回调缺少 code 或 state 参数' };
    }
    const rec = this.states.get(state);
    if (!rec || Date.now() - rec.createdAt > STATE_TTL_MS) {
      return { success: false, message: '授权状态已失效或不存在，请重新发起授权' };
    }
    this.states.delete(state);

    const { platform } = rec;
    if (platform === 'xiaohongshu') {
      return this.handleXiaohongshu(code);
    }
    return { success: false, message: `平台 ${platform} 暂未接入 OAuth 回调` };
  }

  /** 小红书：code 换 token → 按商家编码 upsert 账号 */
  private async handleXiaohongshu(
    code: string,
  ): Promise<CallbackResult> {
    const appId = process.env.XHS_APP_ID;
    const appSecret = process.env.XHS_APP_SECRET;
    if (!appId || !appSecret) {
      return { success: false, message: '小红书凭证未配置：XHS_APP_ID / XHS_APP_SECRET' };
    }

    const token = await exchangeCode({ appId, appSecret, code });
    const expiresAt = new Date(token.accessTokenExpiresAt);

    const existing = await this.db
      .select()
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts.platform, 'xiaohongshu'),
          eq(socialAccounts.platformUid, token.sellerId),
        ),
      )
      .limit(1);

    if (existing[0]) {
      await this.db
        .update(socialAccounts)
        .set({
          accountName: token.sellerName,
          accessToken: token.accessToken,
          refreshToken: token.refreshToken,
          tokenExpiresAt: expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(socialAccounts.id, existing[0].id));
    } else {
      await this.db.insert(socialAccounts).values({
        platform: 'xiaohongshu',
        accountName: token.sellerName,
        platformUid: token.sellerId,
        homeUrl: 'https://www.xiaohongshu.com/',
        followersCount: 0,
        status: 'active',
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        tokenExpiresAt: expiresAt,
        note: `小红书商家授权 · ${new Date().toLocaleString()}`,
      });
    }

    return {
      success: true,
      platform: 'xiaohongshu',
      accountName: token.sellerName,
      message: '授权成功',
    };
  }

  private pruneStates(): void {
    const now = Date.now();
    for (const [k, v] of this.states) {
      if (now - v.createdAt > STATE_TTL_MS) this.states.delete(k);
    }
  }
}
