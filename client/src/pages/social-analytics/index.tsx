import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  Eye,
  MessageCircle,
  RotateCcw,
  ThumbsUp,
  UserPlus,
} from 'lucide-react';
import type {
  MetricsSummaryResponse,
  SocialPlatform,
} from '@shared/api.interface';
import { PLATFORMS, PLATFORM_MAP } from '@shared/platforms';
import { getMetricsSummary } from '@client/src/api/social';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import PlatformPie from './platform-pie';
import TrendChart from './trend-chart';
import { formatCount, resolveErrorMessage } from './helpers';

type PlatformFilter = 'all' | SocialPlatform;

interface DatePickerFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

const DatePickerField: React.FC<DatePickerFieldProps> = ({
  label,
  value,
  onChange,
}) => {
  const [open, setOpen] = useState<boolean>(false);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="mb-2 text-[10px] font-black uppercase tracking-tight text-[#94A3B8]">
        {label}
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="justify-start rounded-none border-[#E2E8F0] px-4 font-medium hover:bg-slate-50"
          >
            <CalendarDays className="size-4 text-[#94A3B8]" />
            <span className="font-mono text-sm">{value}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={dayjs(value).toDate()}
            onSelect={(date: Date | undefined) => {
              if (date) {
                onChange(dayjs(date).format('YYYY-MM-DD'));
                setOpen(false);
              }
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
};

const EmptyHint: React.FC = () => (
  <div className="flex h-[300px] flex-col items-center justify-center gap-2 rounded-none border border-dashed border-[#E2E8F0]">
    <BarChart3 className="size-8 text-[#94A3B8]" />
    <p className="text-[12px] font-medium text-slate-600">暂无数据，平台授权后将自动抓取真实数据</p>
  </div>
);

const LoadingBlock: React.FC = () => (
  <Skeleton className="h-[300px] w-full rounded-none" />
);

const SocialAnalytics: React.FC = () => {
  const [rangeStart, setRangeStart] = useState<string>(() =>
    dayjs().subtract(29, 'day').format('YYYY-MM-DD'),
  );
  const [rangeEnd, setRangeEnd] = useState<string>(() =>
    dayjs().format('YYYY-MM-DD'),
  );
  const [platform, setPlatform] = useState<PlatformFilter>('all');
  const [summary, setSummary] = useState<MetricsSummaryResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMetricsSummary(rangeStart, rangeEnd);
      setSummary(data);
    } catch (err) {
      setError(resolveErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [rangeStart, rangeEnd]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const handleStartChange = (value: string) => {
    setRangeStart(value);
    if (value > rangeEnd) setRangeEnd(value);
  };

  const handleEndChange = (value: string) => {
    setRangeEnd(value);
    if (value < rangeStart) setRangeStart(value);
  };

  const kpis = useMemo(() => {
    const totals = { views: 0, likes: 0, comments: 0, followersDelta: 0 };
    if (summary) {
      if (platform === 'all') {
        totals.views = summary.totals.views;
        totals.likes = summary.totals.likes;
        totals.comments = summary.totals.comments;
        totals.followersDelta = summary.totals.followersDelta;
      } else {
        for (const point of summary.byPlatform) {
          if (point.platform === platform) {
            totals.views = point.views;
            totals.likes = point.likes;
            totals.comments = point.comments;
            totals.followersDelta = point.followersDelta;
          }
        }
      }
    }
    return [
      { key: 'views', label: '总播放', value: totals.views, icon: Eye },
      { key: 'likes', label: '点赞', value: totals.likes, icon: ThumbsUp },
      { key: 'comments', label: '评论', value: totals.comments, icon: MessageCircle },
      { key: 'followers', label: '涨粉', value: totals.followersDelta, icon: UserPlus },
    ];
  }, [summary, platform]);

  const ranking = useMemo(() => {
    if (!summary) return [];
    const rows =
      platform === 'all'
        ? summary.byAccount
        : summary.byAccount.filter((item) => item.platform === platform);
    return [...rows].sort((a, b) => b.views - a.views);
  }, [summary, platform]);

  const maxRankViews = ranking.length > 0 ? ranking[0].views : 0;

  const hasData =
    summary !== null &&
    summary.totals.views +
      summary.totals.likes +
      summary.totals.comments +
      summary.totals.shares +
      summary.totals.followersDelta >
      0;

  const pillClass = (active: boolean): string =>
    cn(
      'flex items-center gap-1.5 rounded-none border px-3.5 py-1.5 text-sm font-medium transition-colors',
      active
        ? 'border-transparent bg-[#0033A0] text-white'
        : 'border-[#E2E8F0] bg-white text-[#94A3B8] hover:bg-slate-50',
    );

  const renderTrendBody = () => {
    if (loading) return <LoadingBlock />;
    if (!summary || !hasData) return <EmptyHint />;
    return <TrendChart daily={summary.daily} />;
  };

  const renderPieBody = () => {
    if (loading) return <LoadingBlock />;
    if (!summary || !hasData) return <EmptyHint />;
    return <PlatformPie points={summary.byPlatform} />;
  };

  return (
    <div>
      <div className="max-w-7xl mx-auto px-8 pt-8 pb-20 space-y-8">
        {/* 筛选行 */}
        <div>
          <div className="mb-6">
            <p className="mb-1 text-[12px] font-black uppercase tracking-[0.15em] text-[#0033A0]">
              01. 数据筛选
            </p>
            <p className="text-[10px] font-medium text-[#94A3B8]">
              FILTER &amp; DATE RANGE
            </p>
          </div>
          <section className="rounded-none border-t-[3px] border-t-[#0033A0] bg-white shadow-md p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-end gap-4">
              <DatePickerField
                label="开始日期"
                value={rangeStart}
                onChange={handleStartChange}
              />
              <span className="pb-2.5 text-[12px] font-medium text-[#94A3B8]">至</span>
              <DatePickerField
                label="结束日期"
                value={rangeEnd}
                onChange={handleEndChange}
              />
            </div>
            <div className="flex flex-wrap gap-3" />
          </div>

          <div className="mt-5 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => setPlatform('all')}
              className={pillClass(platform === 'all')}
            >
              全部
            </button>
            {PLATFORMS.map((meta) => (
              <button
                key={meta.value}
                type="button"
                onClick={() => setPlatform(meta.value)}
                className={pillClass(platform === meta.value)}
              >
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: meta.color }}
                />
                {meta.name}
              </button>
            ))}
          </div>

          {platform !== 'all' && (
            <p className="mt-3 text-[12px] font-medium text-slate-600">
              提示：平台筛选当前作用于 KPI 指标与账号排行；趋势图与平台分布展示区间内全部数据。
            </p>
          )}
          </section>
        </div>

        {error !== null && summary === null ? (
          <section className="rounded-none border-t-[3px] border-t-[#0033A0] bg-white shadow-md p-6">
            <div className="flex flex-col items-start gap-3">
              <div className="flex items-center gap-2 text-[#EF4444]">
                <AlertCircle className="size-5" />
                <span className="font-bold tracking-tight">数据加载失败</span>
              </div>
              <p className="text-[12px] font-medium text-slate-600">{error}</p>
              <Button
                type="button"
                variant="outline"
                className="rounded-none"
                onClick={() => void loadSummary()}
              >
                <RotateCcw className="size-4" />
                重试
              </Button>
            </div>
          </section>
        ) : (
          <>
            {/* KPI 指标卡 */}
            <section
              data-ai-section-type="card-stat"
              className="grid grid-cols-2 gap-6 md:grid-cols-4"
            >
              <div className="col-span-full">
                <p className="mb-1 text-[12px] font-black uppercase tracking-[0.15em] text-[#0033A0]">
                  02. 核心指标
                </p>
                <p className="text-[10px] font-medium text-[#94A3B8]">
                  KEY METRICS
                </p>
              </div>
              {kpis.map((kpi) => (
                <div
                  key={kpi.key}
                  className="rounded-none border-t-[3px] border-t-[#0033A0] bg-white shadow-md p-6"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <kpi.icon className="size-4 text-[#0033A0]" />
                    <span className="text-[10px] font-black uppercase tracking-tight text-[#94A3B8]">
                      {kpi.label}
                    </span>
                  </div>
                  <p className="text-2xl font-black text-[rgb(26_26_26)]">
                    {loading ? '—' : formatCount(kpi.value)}
                  </p>
                </div>
              ))}
            </section>

            {/* 趋势折线图 */}
            <section className="rounded-none border-t-[3px] border-t-[#0033A0] bg-white shadow-md p-6">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="mb-6">
                  <p className="mb-1 text-[12px] font-black uppercase tracking-[0.15em] text-[#0033A0]">
                    03. 按日趋势
                  </p>
                  <p className="text-[10px] font-medium text-[#94A3B8]">
                    DAILY TREND
                  </p>
                </div>
                <p className="mt-1 font-mono text-[12px] font-medium text-[#94A3B8]">
                  {rangeStart} 至 {rangeEnd} · 播放 / 点赞 / 涨粉
                </p>
              </div>
              <div>{renderTrendBody()}</div>
            </section>

            {/* 平台分布 + 账号排行 */}
            <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="rounded-none border-t-[3px] border-t-[#0033A0] bg-white shadow-md p-6">
                <div className="mb-6">
                  <p className="mb-1 text-[12px] font-black uppercase tracking-[0.15em] text-[#0033A0]">
                    04. 平台分布
                  </p>
                  <p className="text-[10px] font-medium text-[#94A3B8]">
                    PLATFORM SHARE
                  </p>
                </div>
                <div>{renderPieBody()}</div>
              </div>

              <div className="rounded-none border-t-[3px] border-t-[#0033A0] bg-white shadow-md p-6">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="mb-6">
                    <p className="mb-1 text-[12px] font-black uppercase tracking-[0.15em] text-[#0033A0]">
                      05. 账号排行
                    </p>
                    <p className="text-[10px] font-medium text-[#94A3B8]">
                      ACCOUNT RANKING
                    </p>
                  </div>
                  <p className="mt-1 text-[12px] font-medium text-[#94A3B8]">
                    按播放量降序
                  </p>
                </div>

                <div className="mt-4">
                  {loading ? (
                    <LoadingBlock />
                  ) : ranking.length === 0 ? (
                    <EmptyHint />
                  ) : (
                    <div>
                      {ranking.map((item, index) => {
                        const meta = PLATFORM_MAP[item.platform];
                        const ratio =
                          maxRankViews > 0 ? item.views / maxRankViews : 0;
                        return (
                          <div
                            key={item.accountId}
                            className="flex items-center gap-4 border-b border-[#E2E8F0] py-3.5 transition-colors hover:bg-slate-50 last:border-b-0"
                          >
                            <span
                              className="size-2 shrink-0 rounded-full"
                              style={{ backgroundColor: meta.color }}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold text-[#0033A0]">
                                {item.accountName}
                              </p>
                              <p className="mt-0.5 text-[12px] font-medium text-[#94A3B8]">
                                {meta.name} · {formatCount(item.likes)} 赞
                              </p>
                            </div>
                            <p className="shrink-0 font-mono text-right text-sm font-bold text-[rgb(26_26_26)]">
                              {formatCount(item.views)}
                            </p>
                            <div className="flex h-12 w-3 shrink-0 items-end rounded-none bg-[#E2E8F0]">
                              <div
                                className={cn(
                                  'w-3 max-w-[12px] rounded-none',
                                  index === 0 ? 'bg-[#0033A0]' : 'bg-[#99C2FF]',
                                )}
                                style={{
                                  height: `${
                                    item.views > 0
                                      ? Math.max(ratio * 100, 8)
                                      : 3
                                  }%`,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default SocialAnalytics;
