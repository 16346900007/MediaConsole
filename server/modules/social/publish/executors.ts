/**
 * 平台发布执行器：playwright 带登录态在各平台创作后台完成真实发布。
 * 与抓取适配器（data/fetchers.ts）共用同一套 storageState 登录态。
 *
 * 当前进度：
 *  - bilibili：视频发布（UI 流程，端到端已打通）
 *  - 其余平台：执行器待接入（目标会标记 failed："发布执行器未接入"）
 * 后续按调研报告顺序逐个接入：youtube → kuaishou → shipinhao → douyin/xiaohongshu → weibo。
 */
import type { Page, BrowserContext } from 'playwright';
import type { SocialPlatform } from '@shared/api.interface';
import type { FilesService } from '../files.service';
import { authDir } from '../auth/auth-util';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const playwright = require('playwright') as any;

export interface PublishTaskPayload {
  publishType: 'video' | 'image' | 'article';
  title: string;
  body: string;
  topic: string;
  location: string;
  coverFileKey: string | null;
  mediaFileKeys: string[];
  visibility: 'public' | 'private';
  platformFields: Record<string, Record<string, unknown>>;
}

export interface PublishContext {
  page: Page;
  context: BrowserContext;
  account: { id: string; platformUid?: string | null; accountName: string };
  task: PublishTaskPayload;
  files: FilesService;
}

export interface PublishResult {
  platformPostId?: string;
  postUrl?: string;
}

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface PublishProgress {
  /** 0-100；0=准备上传，100=上传完成（进入转码/表单阶段） */
  percent: number;
  /** 阶段描述：upload（上传主体）/transcode（转码）/form（表单填写）等 */
  stage: string;
}

export async function runPublish(
  platform: SocialPlatform,
  task: PublishTaskPayload,
  account: { id: string; platformUid?: string | null; accountName: string },
  files: FilesService,
  onProgress?: (p: PublishProgress) => void,
): Promise<PublishResult> {
  const uid = String(account.platformUid ?? '').replace(/^[a-z]+-/, '');
  let statePath = joinAuth(platform, uid);
  if (!statePath) return { platformPostId: undefined };

  const browser = await playwright.chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  try {
    const context = await browser.newContext({
      storageState: statePath,
      viewport: { width: 1440, height: 900 },
      userAgent: DEFAULT_UA,
    });
    const page = await context.newPage();
    let ctx: PublishContext = { page, context, account, task, files };

    // 话题自动拼入正文的平台：这些平台的话题是嵌入正文/描述发布的，
    // 用户正文只写普通描述，发布时自动把话题追加到正文末尾。
    // 微博为 #话题#（双边）格式，小红书/视频号/快手为 #话题（单边）格式。
    const TOPIC_IN_BODY: ReadonlySet<SocialPlatform> = new Set([
      'xiaohongshu',
      'shipinhao',
      'weibo',
      'kuaishou',
    ]);
    if (TOPIC_IN_BODY.has(platform) && task.topic) {
      const rawTopics = task.topic
        .split(/\s+/)
        .map((t) => t.trim().replace(/^#+/, ''))
        .filter(Boolean);
      if (rawTopics.length > 0) {
        const appended =
          platform === 'weibo'
            ? rawTopics.map((t) => `#${t}#`).join(' ')
            : rawTopics.map((t) => `#${t}`).join(' ');
        const body = task.body.trim();
        ctx = { ...ctx, task: { ...task, body: body ? `${body}\n${appended}` : appended } };
      }
    }

    switch (platform) {
      case 'bilibili':
        return await publishBilibili(ctx, onProgress);
      case 'youtube':
        return await publishYoutube(ctx);
      case 'kuaishou':
        return await publishKuaishou(ctx);
      case 'shipinhao':
        return await publishShipinhao(ctx);
      case 'douyin':
        return await publishDouyin(ctx);
      case 'xiaohongshu':
        return await publishXiaohongshu(ctx);
      case 'weibo':
        return await publishWeibo(ctx);
      default:
        throw new Error(`未知平台: ${platform}`);
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

function joinAuth(platform: string, uid: string): string | null {
  const { existsSync } = require('node:fs') as typeof import('node:fs');
  const { join } = require('node:path');
  const base = authDir();
  const withUid = join(base, `${platform}-${uid}.json`);
  if (existsSync(withUid)) return withUid;
  const fallback = join(base, `${platform}.json`);
  return existsSync(fallback) ? fallback : null;
}

/* ------------------------------------------------------------------ */
/* B站：视频投稿（UI 流程）                                            */
/* 页面 member.bilibili.com/platform/upload/video/frame                */
/* ------------------------------------------------------------------ */
async function publishBilibili(
  ctx: PublishContext,
  onProgress?: (p: PublishProgress) => void,
): Promise<PublishResult> {
  const { page, task, files } = ctx;
  // 记录实际调用的接口（诊断用，追加到后端日志目录）
  const { appendFileSync } = require('node:fs') as typeof import('node:fs');
  const BILI_LOG = 'C:/Users/Administrator/AppData/Roaming/SocialManager/logs/bili-requests.log';
  page.on('request', (r) => {
    const u = r.url();
    if (
      /member\.bilibili\.com\/x\/vupre/.test(u) ||
      /member\.bilibili\.com\/upload\//.test(u)
    ) {
      try {
        appendFileSync(
          BILI_LOG,
          `${new Date().toISOString()} ${r.method()} ${u.split('?')[0]}\n`,
        );
      } catch {}
    }
  });
  // 记录响应状态码：上传接口（multipart/part、complete 等）只有状态码能证明是否真正成功
  page.on('response', (r) => {
    const u = r.url();
    if (
      /member\.bilibili\.com\/x\/vupre/.test(u) ||
      /member\.bilibili\.com\/upload\//.test(u)
    ) {
      try {
        appendFileSync(
          BILI_LOG,
          `${new Date().toISOString()} RESP ${r.status()} ${r.request().method()} ${u.split('?')[0]}\n`,
        );
      } catch {}
    }
  });
  const videoKey = task.mediaFileKeys?.[0];
  if (!videoKey) throw new Error('视频文件缺失（mediaFileKeys 为空）');
  const videoPath = await files.toLocalFile(videoKey);

  await page
    .goto('https://member.bilibili.com/platform/upload/video/frame', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    })
    .catch((e) => {
      throw new Error(`投稿页打开失败: ${e.message}`);
    });
  await page.waitForTimeout(5000);

  // 1. 注入视频文件
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(videoPath);
  onProgress?.({ percent: 5, stage: 'upload' });
  // 等待上传完成（页面出现可用的投稿按钮）
  await waitForUpload(page, 10 * 60 * 1000, onProgress);
  onProgress?.({ percent: 100, stage: 'upload' });

  // 2. 封面（如有自定义封面先上传；否则自动截帧，跳过）
  if (task.coverFileKey) {
    const coverPath = await files.toLocalFile(task.coverFileKey);
    const coverBtn = page
      .locator('button, span, div', {
        hasText: /编辑封面|上传封面/,
      })
      .first();
    if ((await coverBtn.count()) > 0) {
      await coverBtn.click().catch(() => {});
      await page.waitForTimeout(1500);
      const coverInput = page.locator('input[type="file"]').first();
      await coverInput.setInputFiles(coverPath).catch(() => {});
      await page.waitForTimeout(3000);
      // 确认封面
      const confirm = page
        .locator('button, span', { hasText: /确定|完成/ })
        .first();
      if ((await confirm.count()) > 0) await confirm.click().catch(() => {});
      await page.waitForTimeout(1000);
    }
  }

  // 3. 标题（必填）
  const titleInput = page
    .locator('input[placeholder*="标题"], input[placeholder*="title"], textarea[placeholder*="标题"]')
    .first();
  if ((await titleInput.count()) === 0) throw new Error('未找到标题输入框');
  await titleInput.fill(task.title || '未命名稿件');

  // 4. 简介（可选）
  if (task.body) {
    const descInput = page
      .locator('textarea[placeholder*="简介"], textarea[placeholder*="简介"], [contenteditable="true"]')
      .first();
    if ((await descInput.count()) > 0) await descInput.fill(task.body).catch(() => {});
  }

  const biliPf = (task.platformFields?.bilibili ?? {}) as Record<string, unknown>;

  /**
   * 点选下拉候选：投稿页表单在 shadow DOM（jinkela）内，playwright locator 可穿透；
   * 逐项过滤「可见」的候选元素（li/role=option/*option*），避免匹配到页面其他文本。
   */
  const pickOption = async (name: string): Promise<boolean> => {
    const opts = page.locator('[role="option"], li, [class*="option"], [class*="dropdown"] div', {
      hasText: name,
    });
    const cnt = await opts.count().catch(() => 0);
    for (let i = 0; i < cnt; i++) {
      if (await opts.nth(i).isVisible().catch(() => false)) {
        await opts.nth(i).click().catch(() => {});
        await page.waitForTimeout(1000);
        return true;
      }
    }
    return false;
  };

  // 5. 分区（必填；单选分类下拉。点击 readonly 的 bcc-select 输入框展开候选后点选）
  const partitionName = String(biliPf.partitionName || biliPf.subPartitionName || '');
  if (!partitionName) {
    throw new Error('B站投稿需选择分区（请在发布页选择分区）');
  }
  const pInput = page.locator('input.bcc-select-input-inner').first();
  if ((await pInput.count()) === 0) throw new Error('未找到 B站分区下拉框');
  await pInput.click().catch(() => {});
  await page.waitForTimeout(1500);
  if (!(await pickOption(partitionName))) {
    // 兜底：有些分区名带空格，去掉空格再试
    await pickOption(partitionName.replace(/\s+/g, ''));
  }

  // 6. 创作声明（必填；下拉框 placeholder 为「请选择符合您视频内容的创作声明」，选完分区后渲染）
  const declare = String(biliPf.declare ?? '');
  const declareMap: Record<string, string> = {
    '1': '内容无需标注',
    '2': '含AI生成内容',
    '3': '含虚构演绎内容',
    '4': '内容含营销信息',
    '5': '个人观点，仅供参考',
    '6': '内容为转载',
  };
  if (!declareMap[declare]) {
    throw new Error('B站投稿需选择创作声明（请在发布页选择创作声明）');
  }
  const declSel = page.locator('input.bcc-select-input-inner[placeholder*="创作声明"]');
  let dc = await declSel.count().catch(() => 0);
  for (let w = 0; w < 8 && dc === 0; w++) {
    await page.waitForTimeout(1000);
    dc = await declSel.count().catch(() => 0);
  }
  if (dc === 0) {
    // 兜底：页面全部 bcc-select 输入框，分区之后的那一个即创作声明
    const all = page.locator('input.bcc-select-input-inner');
    const an = await all.count().catch(() => 0);
    if (an < 2) throw new Error('未找到 B站创作声明下拉框');
    await all.nth(1).click().catch(() => {});
  } else {
    await declSel.first().click().catch(() => {});
  }
  await page.waitForTimeout(1200);
  await pickOption(declareMap[declare]);

  // 7. 标签（必填；标签=话题自动取值。输入框 placeholder 为「按回车键Enter创建标签」）
  const tagsText = String(biliPf.tag || task.topic || '');
  if (tagsText) {
    const tagInput = page
      .locator('input[placeholder*="标签"], input[placeholder*="回车"], input[placeholder*="Enter"], input[placeholder*="enter"]')
      .first();
    if ((await tagInput.count()) > 0) {
      const tags = tagsText
        .split(/[#,\s]+/)
        .filter(Boolean)
        .slice(0, 5)
        .join(',');
      await tagInput.fill(tags);
      await page.waitForTimeout(500);
    }
  }

  // 8. 发布（2026-10-12 probe 探查结论：
  //    a. 「立即投稿」不是 <button>，而是 <div><span class="submit-add">立即投稿</span></div>
  //       （存草稿为 span.submit-draft）。旧定位器 page.locator('button', {hasText}) 永远 0，
  //       这是历次"未找到发布按钮"的真正根因，与滚动无关；
  //    b. 按钮一直在 DOM 里，位于文档底部（视口外 y≈1657）；window.scrollTo 到底后 y≈828 进入视口；
  //    c. 页面无内部溢出滚动容器（documentElement 即滚动元素，唯一 simplebar 容器 817/817 无溢出）。）
  const scrollPageBottom = async (): Promise<void> => {
    await page
      .evaluate(() => {
        const se = document.scrollingElement || document.documentElement;
        window.scrollTo(0, se.scrollHeight);
        // 兜底：shadow DOM 内若存在溢出容器，一并滚到底
        const walk = (root: Document | ShadowRoot): void => {
          for (const el of Array.from(root.querySelectorAll('*'))) {
            const anyEl = el as HTMLElement & { shadowRoot?: ShadowRoot | null };
            if (anyEl.shadowRoot) walk(anyEl.shadowRoot);
            const cs = getComputedStyle(el);
            if (
              (cs.overflowY === 'auto' || cs.overflowY === 'scroll') &&
              el.scrollHeight > el.clientHeight + 4
            ) {
              el.scrollTop = el.scrollHeight;
            }
          }
        };
        walk(document);
      })
      .catch(() => {});
  };
  await scrollPageBottom();
  await page.waitForTimeout(1500);

  // 立即投稿：优先实测 class span.submit-add；兜底精确文本匹配（最内层命中）
  let submit = page.locator('span.submit-add, [class*="submit-add"]').first();
  let sn = await submit.count().catch(() => 0);
  if (sn === 0) {
    const alt = page.getByText('立即投稿', { exact: true }).last();
    const an = await alt.count().catch(() => 0);
    if (an > 0) {
      sn = an;
      submit = alt;
    }
  }
  // 按钮渲染后轮询等待（最多 ~2min），期间反复滚到底
  for (let w = 0; w < 40 && sn === 0; w++) {
    await scrollPageBottom();
    await page.waitForTimeout(3000);
    sn = await submit.count().catch(() => 0);
  }
  if (sn === 0) {
    const btns = await page.locator('button').allInnerTexts().catch(() => []);
    const diag = await page
      .evaluate(() => {
        const se = document.scrollingElement || document.documentElement;
        return {
          winY: Math.round(window.scrollY),
          scrollEl: `${Math.round(se.scrollTop)}/${se.scrollHeight}/${se.clientHeight}`,
          bodyH: document.body?.scrollHeight ?? 0,
          winH: window.innerHeight,
        };
      })
      .catch(() => null);
    throw new Error(
      `未找到发布按钮。按钮(${btns.filter((b) => b.trim()).slice(0, 20).join(' | ') || '(无)'}) 滚动诊断: ${JSON.stringify(diag)}`,
    );
  }
  // 滚到底 + 等按钮进入视口，playwright click 自动等待可操作性
  await scrollPageBottom();
  await page.waitForTimeout(1000);
  await submit.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(800);
  await submit.click();
  // 等待发布成功（URL 跳转或出现成功提示）
  await waitForPublish(page, 3 * 60 * 1000);

  return { platformPostId: undefined, postUrl: undefined };
}

async function waitForUpload(
  page: Page,
  timeoutMs: number,
  onProgress?: (p: PublishProgress) => void,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastText = '';
  let lastReported = -1;
  for (;;) {
    if (Date.now() > deadline) {
      throw new Error(`视频上传超时。页面状态: ${lastText || '(无上传/转码状态文本)'}`);
    }
    const state = await page
      .evaluate(() => {
        const text = document.body?.innerText || '';
        const marks = (text.match(/(上传中|转码中|视频正在处理|上传完成|上传失败|上传进度|%|已上传)/g) || []).slice(-8);
        const m = text.match(/(\d{1,3})\s*%/);
        return {
          uploading: /上传中|转码中|视频正在处理|已上传/.test(text),
          pct: m ? Math.min(100, Number(m[1])) : null,
          text: marks.join(' | '),
        };
      })
      .catch(() => ({ uploading: true, pct: null, text: '' }));
    lastText = state.text;
    // 回传真实上传百分比（B站页面上传进度文本）
    if (typeof state.pct === 'number' && state.pct > lastReported) {
      lastReported = state.pct;
      onProgress?.({ percent: Math.max(10, Math.min(99, state.pct)), stage: 'upload' });
    }
    if (!state.uploading) {
      // 上传文本消失：等待表单字段（分区下拉）真正渲染，避免转码暂停时误判
      const sel = page.locator('input.bcc-select-input-inner').first();
      const sn = await sel.count().catch(() => 0);
      if (sn > 0) return;
      await page.waitForTimeout(3000);
      continue;
    }
    await page.waitForTimeout(5000);
  }
}

async function waitForPublish(page: Page, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (Date.now() > deadline) throw new Error('发布提交超时');
    const ok = await page
      .evaluate(() => {
        const text = document.body?.innerText || '';
        return /投稿成功|发布成功|已提交审核/.test(text) || /platform\/content-manage|upload-manager/.test(location.href);
      })
      .catch(() => false);
    if (ok) return;
    await page.waitForTimeout(5000);
  }
}

/* ------------------------------------------------------------------ */
/* 其余平台：待接入（当前明确报错，目标标记 failed）                    */
/* ------------------------------------------------------------------ */
function notImplemented(platform: string): Promise<PublishResult> {
  return Promise.reject(new Error(`【${platform}】发布执行器待接入（后续迭代）`));
}

async function publishYoutube(ctx: PublishContext): Promise<PublishResult> {
  return notImplemented('YouTube');
}
async function publishKuaishou(ctx: PublishContext): Promise<PublishResult> {
  return notImplemented('快手');
}
async function publishShipinhao(ctx: PublishContext): Promise<PublishResult> {
  return notImplemented('视频号');
}
async function publishDouyin(ctx: PublishContext): Promise<PublishResult> {
  return notImplemented('抖音');
}
async function publishXiaohongshu(ctx: PublishContext): Promise<PublishResult> {
  return notImplemented('小红书');
}
async function publishWeibo(ctx: PublishContext): Promise<PublishResult> {
  return notImplemented('微博');
}
