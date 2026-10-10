import { Controller, Get, Post } from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { exec } from 'child_process';
import { existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 桌面端缓存管理（WebView2）：
 * - 前端页面经后端 http 加载，WebView2 会缓存 assets（带内容哈希可长缓存），
 *   清理 HTTP/GPU/Code 缓存后重新加载即可让新前端立即生效（解决"改代码不生效"）。
 * - 缓存目录：%LOCALAPPDATA%\com.socialmanager.desktop\EBWebView\Default
 * - 只清缓存类子目录，绝不清 Local Storage / Session Storage / IndexedDB / Network
 *   （登录态 localStorage 与 cookies 在此，清了会导致所有平台掉线）。
 */
@Controller('api/social/app')
export class AppController {
  /** 可安全清理的缓存子目录（HTTP/GPU/Code 缓存，不含登录态数据） */
  private readonly CACHE_DIRS = [
    'Cache',
    'Code Cache',
    'GPUCache',
    'DawnGraphiteCache',
    'DawnWebGPUCache',
    'GraphiteDawnCache',
    'Shared Dictionary',
    'optimization_guide_hint_cache_store',
    'Feature Engagement Tracker',
    'AutofillAiModelCache',
    'AutofillStrikeDatabase',
  ];

  private cacheProfileDir(): string {
    const local = process.env.LOCALAPPDATA || join(process.cwd(), '.local');
    return join(local, 'com.socialmanager.desktop', 'EBWebView', 'Default');
  }

  private cacheDirs(): string[] {
    const base = this.cacheProfileDir();
    // 必须 map 出完整路径再过滤：filter 直接返回目录名会导致后续按 cwd 解析（ENOENT）
    return this.CACHE_DIRS.map((name) => join(base, name)).filter((p) => existsSync(p));
  }

  private dirSize(dir: string): number {
    let total = 0;
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        try {
          if (entry.isDirectory()) total += this.dirSize(p);
          else total += statSync(p).size;
        } catch {
          /* 单个文件读取失败跳过 */
        }
      }
    } catch {
      /* 目录读取失败跳过 */
    }
    return total;
  }

  private clearDir(dir: string): { removed: number; failed: number } {
    let removed = 0;
    let failed = 0;
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        try {
          rmSync(p, { recursive: true, force: true });
          removed++;
        } catch {
          // 文件被 WebView2 进程占用（正在读写）时删除失败，跳过（下次启动可清）
          failed++;
        }
      }
    } catch {
      failed++;
    }
    return { removed, failed };
  }

  /** 缓存目录与占用大小（MB） */
  @Get('cache-info')
  cacheInfo(): { dir: string; sizeMB: number } {
    const dirs = this.cacheDirs();
    const bytes = dirs.reduce((sum, d) => sum + this.dirSize(d), 0);
    return { dir: this.cacheProfileDir(), sizeMB: Math.round((bytes / 1024 / 1024) * 100) / 100 };
  }

  /** 清理缓存（可删即删，被进程占用的跳过），返回清理结果 */
  @NeedLogin()
  @Post('clear-cache')
  clearCache(): { clearedMB: number; removedItems: number; failedItems: number } {
    const dirs = this.cacheDirs();
    let clearedBytes = 0;
    let removedItems = 0;
    let failedItems = 0;
    for (const d of dirs) {
      clearedBytes += this.dirSize(d);
      const r = this.clearDir(d);
      removedItems += r.removed;
      failedItems += r.failed;
    }
    return {
      clearedMB: Math.round((clearedBytes / 1024 / 1024) * 100) / 100,
      removedItems,
      failedItems,
    };
  }

  /** 打开缓存目录（Windows 资源管理器） */
  @NeedLogin()
  @Post('open-cache-dir')
  openCacheDir(): { ok: boolean } {
    const dir = this.cacheProfileDir();
    exec(`start "" "explorer.exe" "${dir}"`, (err) => {
      if (err) console.error('[app] 打开缓存目录失败:', err.message);
    });
    return { ok: true };
  }
}
