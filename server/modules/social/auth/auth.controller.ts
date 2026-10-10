import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type { Request, Response } from 'express';
import type {
  AuthStartRequest,
  AuthStartResponse,
  SocialPlatform,
} from '@shared/api.interface';
import { AuthService } from './auth.service';
import { BrowserAuthService } from './browser-auth.service';

const CALLBACK_PATH = '/api/social/auth/callback';

function pageHtml(title: string, body: string, autoClose: boolean): string {
  return `<!DOCTYPE html>
<html lang="zh">
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#f4f7f9;display:flex;align-items:center;justify-content:center;min-height:100vh">
<div style="background:#fff;border-top:3px solid #0033A0;box-shadow:0 4px 16px rgba(0,0,0,.08);padding:36px 48px;text-align:center;max-width:420px">
${body}
</div>
<script>
  try {
    if (window.opener && window.opener !== window) {
      window.opener.postMessage({ type: 'social-auth-result', platform: ${autoClose ? "'xiaohongshu'" : 'null'}, ok: ${autoClose ? 'true' : 'false'} }, '*');
    }
  } catch (e) {}
  ${autoClose ? 'setTimeout(function () { window.close(); }, 1200);' : ''}
</script>
</body></html>`;
}

@Controller('api/social/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly browserAuthService: BrowserAuthService,
  ) {}

  /** 发起授权：返回授权页地址（前端据此打开授权窗口） */
  @NeedLogin()
  @Post('start')
  async start(
    @Body() body: AuthStartRequest,
    @Req() req: Request,
  ): Promise<AuthStartResponse> {
    const redirectUri = `http://${req.headers.host}${CALLBACK_PATH}`;
    const result = await this.authService.startAuth(body.platform, redirectUri);
    return {
      authUrl: result.authUrl,
      state: result.state,
      configured: result.configured,
      message: result.message,
    };
  }

  /** 浏览器授权（个人号，无需资质）：拉起本机 Edge 登录窗口 */
  @NeedLogin()
  @Post('browser/start')
  async browserStart(
    @Body() body: { platform: SocialPlatform; accountId?: string },
  ): Promise<{ ok: boolean; message?: string }> {
    return this.browserAuthService.start(body.platform, body.accountId);
  }

  /** 浏览器授权状态轮询：登录成功后自动保存登录态并落库 */
  @NeedLogin()
  @Get('browser/status')
  async browserStatus(): Promise<{
    status: 'idle' | 'pending' | 'success' | 'failed';
    accountName?: string;
    message?: string;
  }> {
    return this.browserAuthService.status();
  }

  /** 平台回调地址（由平台重定向，无本地登录态，直接处理） */
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.authService.handleCallback(state, code);
    res.type('text/html; charset=utf-8');
    if (result.success) {
      res.send(
        pageHtml(
          '授权成功',
          `<h2 style="color:#0033A0;margin:0 0 12px">✓ 授权成功</h2>
           <p style="color:#475569;margin:0 0 6px">已添加账号：<strong>${result.accountName ?? ''}</strong></p>
           <p style="color:#94a3b8;font-size:12px;margin:0">本窗口即将自动关闭，可返回客户端查看账号列表</p>`,
          true,
        ),
      );
    } else {
      res.status(400).send(
        pageHtml(
          '授权失败',
          `<h2 style="color:#ef4444;margin:0 0 12px">✕ 授权失败</h2>
           <p style="color:#475569;margin:0 0 6px">${result.message}</p>
           <p style="color:#94a3b8;font-size:12px;margin:0">请关闭本窗口后在客户端重新发起授权</p>`,
          false,
        ),
      );
    }
  }
}
