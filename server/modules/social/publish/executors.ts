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

export async function runPublish(
  platform: SocialPlatform,
  task: PublishTaskPayload,
  account: { id: string; platformUid?: string | null; accountName: string },
  files: FilesService,
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
    const ctx: PublishContext = { page, context, account, task, files };

    switch (platform) {
      case 'bilibili':
        return await publishBilibili(ctx);
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
  const { existsSync, join } = require('node:fs') as typeof import('node:fs');
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
async function publishBilibili(ctx: PublishContext): Promise<PublishResult> {
  const { page, task, files } = ctx;
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
  // 等待上传完成（页面出现可用的投稿按钮）
  await waitForUpload(page, 5 * 60 * 1000);

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

  // 5. 分区（必填；B站投稿为单选分类下拉，联想输入分区名后点选候选）
  const partitionName = String(
    biliPf.partitionName || biliPf.subPartitionName || '',
  );
  const pInputSel =
    'input[placeholder*="分区"], input[placeholder*="搜索"], input[placeholder*="请选择"], input[placeholder*="选择"], input[aria-label*="分区"]';
  const pickOption = async (name: string): Promise<boolean> => {
    const opt = page
      .locator('li, div, span, [role="option"]', { hasText: name })
      .filter({ has: page.locator('text=' + name) })
      .last();
    if ((await opt.count()) > 0) {
      await opt.click().catch(() => {});
      await page.waitForTimeout(900);
      return true;
    }
    return false;
  };
  if (!partitionName) {
    throw new Error('B站投稿需选择分区（请在发布页选择分区）');
  }
  const pInput = page.locator(pInputSel).first();
  if ((await pInput.count()) === 0) throw new Error('未找到 B站分区输入框');
  await pInput.click().catch(() => {});
  await page.waitForTimeout(600);
  await pInput.fill(partitionName);
  await page.waitForTimeout(1600);
  await pickOption(partitionName);

  // 6. 创作声明（必填；下拉选择对应声明项）
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
  const declSel = page.locator('.bcc-select-input-inner, select, [class*="select"]').nth(1);
  if ((await declSel.count()) > 0) {
    await declSel.click().catch(() => {});
    await page.waitForTimeout(800);
    await pickOption(declareMap[declare]);
  }

  // 7. 标签（B站投稿标签为必填，英文逗号分隔；标签=话题，自动取话题值）
  const tagsText = String(biliPf.tag || task.topic || '');
  if (tagsText) {
    const tagInput = page.locator('input[placeholder*="标签"]').first();
    if ((await tagInput.count()) > 0) {
      const tags = tagsText
        .split(/[#,\s]+/)
        .filter(Boolean)
        .slice(0, 5)
        .join(',');
      await tagInput.fill(tags);
    }
  }

  // 8. 发布
  const submit = page.locator('button', { hasText: /立即投稿|发布/ }).first();
  if ((await submit.count()) === 0) throw new Error('未找到发布按钮');
  await submit.click();
  // 等待发布成功（URL 跳转或出现成功提示）
  await waitForPublish(page, 3 * 60 * 1000);

  return { platformPostId: undefined, postUrl: undefined };
}

async function waitForUpload(page: Page, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (Date.now() > deadline) throw new Error('视频上传超时');
    const state = await page
      .evaluate(() => {
        const text = document.body?.innerText || '';
        const btn = Array.from(document.querySelectorAll('button')).find(
          (b) => /立即投稿|发布/.test(b.textContent || ''),
        );
        return {
          uploading: /上传中|转码中/.test(text),
          btnOk: !!btn && !(btn as HTMLButtonElement).disabled,
          done: /上传完成/.test(text),
        };
      })
      .catch(() => ({ uploading: true, btnOk: false, done: false }));
    if (state.btnOk || state.done) return;
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
