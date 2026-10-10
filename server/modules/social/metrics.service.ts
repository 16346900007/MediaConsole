import { and, eq, gte, inArray, lte, sum } from 'drizzle-orm';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { socialAccounts, socialMetrics } from '@server/database/schema';
import {
  SOCIAL_PLATFORMS,
  type MetricBatchResponse,
  type MetricInput,
  type MetricsAccountPoint,
  type MetricsDailyPoint,
  type MetricsPlatformPoint,
  type MetricsSummaryResponse,
  type SocialPlatform,
} from '@shared/api.interface';
import { METRIC_DATE_PATTERN } from './metrics.dto';

const MAX_RANGE_DAYS = 366;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** YYYY-MM-DD 且为真实存在的日历日期 */
function isRealDateString(value: string): boolean {
  if (!METRIC_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map((part: string) => Number(part));
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function shiftIsoDate(value: string, days: number): string {
  const [year, month, day] = value.split('-').map((part: string) => Number(part));
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function differenceDays(start: string, end: string): number {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  return Math.round((endMs - startMs) / 86400000);
}

/** 业务时区（Asia/Shanghai）的今天 */
function todayInShanghai(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return '未知错误';
}

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  /** 单条录入：校验账号存在 + 日期合法，accountId+date 冲突则覆盖更新 */
  async createMetric(input: MetricInput): Promise<void> {
    if (!isRealDateString(input.date)) {
      throw new BadRequestException('日期格式必须为合法的 YYYY-MM-DD');
    }
    const platform = await this.findAccountPlatform(input.accountId);
    if (platform === null) {
      throw new NotFoundException('账号不存在');
    }
    await this.upsertMetric(input, platform);
  }

  /** 批量导入：逐条校验并 upsert，失败行记入 errors，不整体回滚 */
  async importMetrics(items: MetricInput[]): Promise<MetricBatchResponse> {
    const errors: { row: number; message: string }[] = [];
    let succeeded = 0;

    // 预取所有合法 UUID 对应的账号，避免逐行查询
    const uuidIds = Array.from(
      new Set(
        items
          .map((item: MetricInput) => item.accountId)
          .filter((id: string) => UUID_PATTERN.test(id)),
      ),
    );
    const accountRows =
      uuidIds.length > 0
        ? await this.db
            .select({
              id: socialAccounts.id,
              platform: socialAccounts.platform,
            })
            .from(socialAccounts)
            .where(inArray(socialAccounts.id, uuidIds))
        : [];
    const platformByAccountId = new Map<string, string>(
      accountRows.map((row) => [row.id, row.platform]),
    );

    for (let index = 0; index < items.length; index += 1) {
      const row = index + 1;
      const item = items[index];
      const message = this.validateItem(item, platformByAccountId);
      if (message !== null) {
        errors.push({ row, message });
        continue;
      }
      const platform = platformByAccountId.get(item.accountId);
      if (platform === undefined) {
        // validateItem 已保证存在，这里做防御性兜底
        errors.push({ row, message: '账号不存在' });
        continue;
      }
      try {
        await this.upsertMetric(item, platform);
        succeeded += 1;
      } catch (error) {
        const writeMessage = resolveErrorMessage(error);
        this.logger.warn(`导入第 ${row} 行写入失败：${writeMessage}`);
        errors.push({ row, message: `写入失败：${writeMessage}` });
      }
    }

    return { succeeded, errors };
  }

  /** 区间汇总：totals / daily（补齐每天）/ byPlatform / byAccount */
  async getSummary(
    startParam?: string,
    endParam?: string,
  ): Promise<MetricsSummaryResponse> {
    const end = this.normalizeDateParam(endParam) ?? todayInShanghai();
    // 未传 start 时默认近 30 天（含当天）
    const normalizedStart =
      this.normalizeDateParam(startParam) ?? shiftIsoDate(end, -29);

    if (normalizedStart > end) {
      throw new BadRequestException('开始日期不能晚于结束日期');
    }
    const rangeDays = differenceDays(normalizedStart, end) + 1;
    if (rangeDays > MAX_RANGE_DAYS) {
      throw new BadRequestException(`日期范围过大，最多支持 ${MAX_RANGE_DAYS} 天`);
    }

    const rangeCondition = and(
      gte(socialMetrics.date, normalizedStart),
      lte(socialMetrics.date, end),
    );

    const [totalRows, dailyRows, platformRows, accountRows] = await Promise.all([
      this.db
        .select({
          views: sum(socialMetrics.views),
          likes: sum(socialMetrics.likes),
          comments: sum(socialMetrics.comments),
          shares: sum(socialMetrics.shares),
          followersDelta: sum(socialMetrics.followersDelta),
        })
        .from(socialMetrics)
        .where(rangeCondition),
      this.db
        .select({
          date: socialMetrics.date,
          views: sum(socialMetrics.views),
          likes: sum(socialMetrics.likes),
          comments: sum(socialMetrics.comments),
          followersDelta: sum(socialMetrics.followersDelta),
        })
        .from(socialMetrics)
        .where(rangeCondition)
        .groupBy(socialMetrics.date)
        .orderBy(socialMetrics.date),
      this.db
        .select({
          platform: socialMetrics.platform,
          views: sum(socialMetrics.views),
          likes: sum(socialMetrics.likes),
          comments: sum(socialMetrics.comments),
          followersDelta: sum(socialMetrics.followersDelta),
        })
        .from(socialMetrics)
        .where(rangeCondition)
        .groupBy(socialMetrics.platform),
      this.db
        .select({
          accountId: socialMetrics.accountId,
          accountName: socialAccounts.accountName,
          platform: socialMetrics.platform,
          views: sum(socialMetrics.views),
          likes: sum(socialMetrics.likes),
          followersDelta: sum(socialMetrics.followersDelta),
        })
        .from(socialMetrics)
        .innerJoin(socialAccounts, eq(socialMetrics.accountId, socialAccounts.id))
        .where(rangeCondition)
        .groupBy(
          socialMetrics.accountId,
          socialAccounts.accountName,
          socialMetrics.platform,
        ),
    ]);

    const totalsRow = totalRows[0];
    const totals = {
      views: Number(totalsRow?.views ?? 0),
      likes: Number(totalsRow?.likes ?? 0),
      comments: Number(totalsRow?.comments ?? 0),
      shares: Number(totalsRow?.shares ?? 0),
      followersDelta: Number(totalsRow?.followersDelta ?? 0),
    };

    // 按日补齐区间内每一天，无数据日填 0
    const dailyMap = new Map<string, MetricsDailyPoint>();
    for (const row of dailyRows) {
      dailyMap.set(row.date, {
        date: row.date,
        views: Number(row.views ?? 0),
        likes: Number(row.likes ?? 0),
        comments: Number(row.comments ?? 0),
        followersDelta: Number(row.followersDelta ?? 0),
      });
    }
    const daily: MetricsDailyPoint[] = [];
    let cursor = normalizedStart;
    while (cursor <= end) {
      daily.push(
        dailyMap.get(cursor) ?? {
          date: cursor,
          views: 0,
          likes: 0,
          comments: 0,
          followersDelta: 0,
        },
      );
      cursor = shiftIsoDate(cursor, 1);
    }

    const byPlatform: MetricsPlatformPoint[] = platformRows
      .filter((row) => SOCIAL_PLATFORMS.includes(row.platform as SocialPlatform))
      .map((row) => ({
        platform: row.platform as SocialPlatform,
        views: Number(row.views ?? 0),
        likes: Number(row.likes ?? 0),
        comments: Number(row.comments ?? 0),
        followersDelta: Number(row.followersDelta ?? 0),
      }));

    const byAccount: MetricsAccountPoint[] = accountRows.map((row) => ({
      accountId: row.accountId,
      accountName: row.accountName,
      platform: row.platform as SocialPlatform,
      views: Number(row.views ?? 0),
      likes: Number(row.likes ?? 0),
      followersDelta: Number(row.followersDelta ?? 0),
    }));

    return {
      start: normalizedStart,
      end,
      totals,
      daily,
      byPlatform,
      byAccount,
    };
  }

  private normalizeDateParam(value?: string): string | null {
    if (value === undefined || value === '') return null;
    if (!isRealDateString(value)) {
      throw new BadRequestException('日期参数格式必须为合法的 YYYY-MM-DD');
    }
    return value;
  }

  private async findAccountPlatform(accountId: string): Promise<string | null> {
    if (!UUID_PATTERN.test(accountId)) return null;
    const rows = await this.db
      .select({ platform: socialAccounts.platform })
      .from(socialAccounts)
      .where(eq(socialAccounts.id, accountId));
    return rows.length > 0 ? rows[0].platform : null;
  }

  private async upsertMetric(
    input: MetricInput,
    platform: string,
  ): Promise<void> {
    const values = {
      accountId: input.accountId,
      platform,
      date: input.date,
      views: input.views ?? 0,
      likes: input.likes ?? 0,
      comments: input.comments ?? 0,
      shares: input.shares ?? 0,
      followersDelta: input.followersDelta ?? 0,
    };
    await this.db
      .insert(socialMetrics)
      .values(values)
      .onConflictDoUpdate({
        target: [socialMetrics.accountId, socialMetrics.date],
        set: {
          views: values.views,
          likes: values.likes,
          comments: values.comments,
          shares: values.shares,
          followersDelta: values.followersDelta,
        },
      });
  }

  private validateItem(
    item: MetricInput,
    platformByAccountId: Map<string, string>,
  ): string | null {
    if (typeof item.accountId !== 'string' || item.accountId.length === 0) {
      return '账号 ID 不能为空';
    }
    if (!platformByAccountId.has(item.accountId)) {
      return '账号不存在';
    }
    if (typeof item.date !== 'string' || !isRealDateString(item.date)) {
      return '日期格式必须为合法的 YYYY-MM-DD';
    }
    const numericFields: { label: string; value: number | undefined }[] = [
      { label: '播放', value: item.views },
      { label: '点赞', value: item.likes },
      { label: '评论', value: item.comments },
      { label: '分享', value: item.shares },
      { label: '涨粉', value: item.followersDelta },
    ];
    for (const field of numericFields) {
      if (field.value === undefined) continue;
      if (
        typeof field.value !== 'number' ||
        !Number.isInteger(field.value) ||
        field.value < 0
      ) {
        return `${field.label}必须为非负整数`;
      }
    }
    return null;
  }
}
