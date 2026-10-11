/**
 * B站投稿元数据服务：
 * - 分区（单选，无二级）：通过无头模式（playwright）注入本机 B站登录态 cookie
 *   （auth/bilibili*.json），请求创作中心真实分区接口
 *   member.bilibili.com/x/vupre/web/archive/human/type2/list（data.type_list，
 *   33 个投稿分类，与投稿页「分区」下拉完全一致），内存缓存 10 分钟
 *   （有缓存先返回，超时后台刷新，与工作台数据口径一致）。
 */
import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { authDir } from '../auth/auth-util';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const playwright = require('playwright') as any;

export interface BiliPartitionChild {
  tid: number;
  name: string;
}
export interface BiliPartition {
  tid: number;
  name: string;
  children: BiliPartitionChild[];
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
/** 缓存有效期：10 分钟（与数据页工作台一致；有缓存先返回，超时后台刷新） */
const CACHE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class BilibiliMetaService {
  private readonly logger = new Logger(BilibiliMetaService.name);
  private cache: { ts: number; data: BiliPartition[] } | null = null;
  private refreshing: Promise<BiliPartition[]> | null = null;

  /**
   * 分区树（含二级，投稿用 tid）：
   * 与工作台数据同策略——命中缓存立即返回；缓存超过 10 分钟先返回旧数据，
   * 同时后台拉取新数据刷新缓存（首次无缓存时才同步等待抓取）。
   */
  async getPartitions(): Promise<BiliPartition[]> {
    if (this.cache) {
      if (Date.now() - this.cache.ts >= CACHE_TTL_MS) {
        void this.refresh().catch(() => undefined);
      }
      return this.cache.data;
    }
    return this.refresh();
  }

  private refresh(): Promise<BiliPartition[]> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.fetchFromBilibili()
      .then((data) => {
        this.cache = { ts: Date.now(), data };
        return data;
      })
      .finally(() => {
        this.refreshing = null;
      });
    return this.refreshing;
  }

  private async fetchFromBilibili(): Promise<BiliPartition[]> {
    const browser = await playwright.chromium.launch({
      channel: 'msedge',
      headless: true,
      args: ['--disable-blink-features=AutomationControlled'],
    });
    try {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        userAgent: UA,
      });

      // 注入本机 B站登录态 cookie（archive/pre 为登录接口，未登录返回 -101）
      const cookies = this.loadBiliCookies();
      if (cookies.length > 0) {
        await context
          .addCookies(
            cookies.map((c) => ({
              name: c.name,
              value: c.value,
              domain: c.domain || '.bilibili.com',
              path: c.path || '/',
            })),
          )
          .catch(() => {});
      }

      const page = await context.newPage();
      // 同源访问创作中心，再 fetch 投稿表单数据接口
      await page
        .goto('https://member.bilibili.com/', {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        })
        .catch((e: Error) => {
          throw new Error(`B站创作中心访问失败: ${e.message}`);
        });
      await page.waitForTimeout(2500);

      const data = await page.evaluate(async () => {
        const url =
          'https://member.bilibili.com/x/vupre/web/archive/human/type2/list?t=' +
          Date.now() +
          '&x-bili-locale-json=%7B%22c_locale%22:%7B%22language%22:%22zh%22,%22script%22:%22Hans%22%7D,%22always_translate%22:false%7D&x-bili-device-req-json=%7B%22platform%22:%22web%22,%22device%22:%22pc%22,%22mobi_app%22:%22web_cn%22,%22spmid%22:%220.0%22%7D';
        const resp = await fetch(url, { credentials: 'include' });
        const json = (await resp.json()) as {
          code: number;
          data?: { type_list?: Array<{ id: number; name: string }> };
        };
        if (json.code !== 0 || !Array.isArray(json.data?.type_list)) {
          throw new Error('B站投稿分区接口返回异常 code=' + json.code);
        }
        // 投稿分区为单选分类（无二级），children 恒为空
        return (json.data.type_list as Array<{ id: number; name: string }>)
          .filter((t) => t && t.id != null && t.name)
          .map((t) => ({ tid: Number(t.id), name: String(t.name), children: [] }));
      });
      this.logger.log(`B站投稿分区已更新：${data.length} 个分类`);
      return data;
    } finally {
      await browser.close().catch(() => {});
    }
  }

  /** 读取本机 B站登录态 cookie（bilibili.json 或 bilibili-<uid>.json） */
  private loadBiliCookies(): Array<{ name: string; value: string; domain?: string; path?: string }> {
    try {
      const base = authDir();
      const candidates: string[] = [];
      if (existsSync(join(base, 'bilibili.json'))) candidates.push(join(base, 'bilibili.json'));
      // 兜底：bilibili-*.json（按 uid 分文件）
      const { readdirSync } = require('node:fs') as typeof import('node:fs');
      try {
        for (const f of readdirSync(base)) {
          if (/^bilibili-\d+\.json$/.test(f)) candidates.push(join(base, f));
        }
      } catch {
        /* 忽略 */
      }
      for (const path of candidates) {
        try {
          const state = JSON.parse(readFileSync(path, 'utf8'));
          const raw = state.cookies ?? state;
          if (Array.isArray(raw) && raw.length > 0) {
            const list = raw
              .map((c: any) => ({
                name: String(c.name ?? ''),
                value: String(c.value ?? ''),
                domain: c.domain,
                path: c.path,
              }))
              .filter((c: any) => c.name && c.value);
            if (list.length > 0) return list;
          }
        } catch {
          /* 尝试下一个 */
        }
      }
    } catch {
      /* 无登录态 */
    }
    return [];
  }
}
