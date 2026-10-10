import { Inject, Controller, Get, Query } from '@nestjs/common';
import { exec } from 'child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { eq } from 'drizzle-orm';
import { socialAccounts } from '@server/database/schema';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const playwright = require('playwright') as any;

/** 账号登录态目录：%APPDATA%/SocialManager/auth（与 BrowserAuthService 一致） */
function authDir(): string {
  const logDir = process.env.LOG_DIR;
  if (logDir) return join(logDir, '..', 'auth');
  return join(process.cwd(), 'auth');
}

/**
 * 打开外部链接：
 * - 带 accountId：查找该账号的独立登录态（xiaohongshu-<userId>.json），
 *   用 Playwright 拉起本机 Edge 有头窗口，注入该账号 cookie 后打开创作中心；
 *   每次使用全新的临时浏览器 profile（无缓存残留）。
 *   无登录态文件则回退系统默认浏览器。
 * - 不带 accountId：由后端 Node 执行 Windows `start` 命令，用系统默认浏览器打开。
 * 不依赖 Tauri IPC/插件，前端与 web 端同源调用。
 */
@Controller('api/social/open-external')
export class OpenExternalController {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  @Get()
  async open(
    @Query('url') url: string,
    @Query('accountId') accountId?: string,
  ): Promise<{ ok: boolean; windowed?: boolean }> {
    if (!url || !/^https?:\/\//.test(url)) {
      return { ok: false };
    }

    // 按账号打开：查找该账号独立登录态
    if (accountId) {
      try {
        const rows = await this.db
          .select()
          .from(socialAccounts)
          .where(eq(socialAccounts.id, accountId))
          .limit(1);
        const account = rows[0];
        if (account?.platformUid) {
          // 独立登录态文件命名：<platform>-<userId>.json（platformUid 形如 douyin-xxx）
          const uid = account.platformUid.replace(/^[a-z]+-/, '');
          const statePath = join(authDir(), `${account.platform}-${uid}.json`);
          if (existsSync(statePath)) {
            void this.openWithState(url, statePath);
            return { ok: true, windowed: true };
          }
        }
      } catch (e) {
        console.error(
          '[open-external] 按账号打开失败，回退系统浏览器:',
          (e as Error).message,
        );
      }
    }

    exec(`start "" "${url}"`, (err) => {
      if (err) {
        console.error('[open-external] 打开失败:', err.message);
      }
    });
    return { ok: true, windowed: false };
  }

  /**
   * 用 Playwright 拉起本机 Edge 有头窗口，注入该账号登录态后打开目标页。
   * 每次 `launch()` 都会创建全新的临时浏览器 profile（playwright 自动管理并清理），
   * 进程与 profile 完全隔离，杜绝旧缓存/旧 cookie 残留串号；
   * 登录态用 `newContext({ storageState })` 注入——实测该路径 cookies+localStorage
   * 注入可靠（launchPersistentContext 的 storageState 在 msedge channel 下会丢失
   * localStorage，导致打开创作中心未登录，已弃用）。
   */
  private async openWithState(url: string, statePath: string): Promise<void> {
    let browser: any = null;
    try {
      browser = await playwright.chromium.launch({
        channel: 'msedge',
        headless: false,
        args: ['--disable-blink-features=AutomationControlled'],
        ignoreDefaultArgs: ['--enable-automation'],
      });
      const context = await browser.newContext({
        storageState: statePath,
        viewport: { width: 1280, height: 800 },
      });
      const page = await context.newPage();
      await page
        .goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
        .catch(() => {
          /* 导航失败由用户自行处理 */
        });
      // 窗口保持打开，由用户自行关闭（浏览器句柄随窗口关闭而结束）
    } catch (e) {
      console.error('[open-external] 拉起 Edge 失败:', (e as Error).message);
    }
  }
}
