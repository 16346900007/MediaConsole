import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  AlertCircle,
  ArrowUpRight,
  BarChart3,
} from 'lucide-react';
import type {
  MetricsSummaryResponse,
  SocialAccount,
  SocialPlatform,
} from '@shared/api.interface';
import {
  PLATFORMS,
  PLATFORM_MAP,
  type PlatformMeta,
} from '@shared/platforms';
import { PLATFORM_LOGOS } from '@/utils/platform-logos';
import { Image } from '@client/src/components/ui/image';
import {
  getMetricsSummary,
  listAccounts,
} from '@client/src/api/social';

interface SectionState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

const formatNumber = (value: number): string =>
  new Intl.NumberFormat('zh-CN').format(value);

const LoadingLine: React.FC = () => (
  <p className="py-6 text-center text-[12px] font-medium text-[#94A3B8]">
    加载中...
  </p>
);

const ErrorLine: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex items-center justify-center gap-2 py-6 text-sm text-[#EF4444]">
    <AlertCircle className="h-4 w-4 shrink-0" />
    <span>加载失败：{message}</span>
  </div>
);

const DashboardErrorLine: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex items-center justify-center gap-2 py-12 text-sm text-[#EF4444]">
    <AlertCircle className="h-4 w-4 shrink-0" />
    <span>加载失败：{message}</span>
  </div>
);

const KpiItem: React.FC<{
  label: string;
  value: string;
  valueClass: string;
}> = ({ label, value, valueClass }) => (
  <div>
    <p className="mb-2 text-[10px] font-black uppercase tracking-tight text-[#94A3B8]">
      {label}
    </p>
    <p className={`text-2xl font-black tracking-tight ${valueClass}`}>
      {value}
    </p>
  </div>
);

const AccountBar: React.FC<{
  name: string;
  platform: string;
  count: number;
  percent: number;
  active: boolean;
}> = ({ name, platform, count, percent }) => {
  // 数量条填充色使用平台主题色（设计规范仅图表主色用蓝阶，平台分布按平台色区分）
  const barColor = PLATFORM_MAP[platform as SocialPlatform]?.color ?? '#0033A0';
  return (
    <div className="flex items-center gap-3">
      <Image
        src={PLATFORM_LOGOS[platform]}
        alt={name}
        className="size-4 shrink-0 object-contain"
      />
      <span className="w-16 shrink-0 text-sm font-bold text-[#1E293B]">
        {name}
      </span>
      <span className="w-8 shrink-0 text-right font-mono text-sm font-bold tracking-tight text-[#1E293B]">
        {count}
      </span>
      <div className="h-1.5 min-w-0 flex-1 rounded-none bg-[#E2E8F0]">
        <div
          className="h-1.5 rounded-none"
          style={{ width: `${percent}%`, backgroundColor: barColor }}
        />
      </div>
    </div>
  );
};

const SocialDashboard: React.FC = () => {
  const [summary, setSummary] = useState<SectionState<MetricsSummaryResponse>>({
    data: null,
    loading: true,
    error: null,
  });
  const [accounts, setAccounts] = useState<SectionState<SocialAccount[]>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const start = dayjs().subtract(6, 'day').format('YYYY-MM-DD');
    const end = dayjs().format('YYYY-MM-DD');
    getMetricsSummary(start, end)
      .then((data: MetricsSummaryResponse) => {
        setSummary({ data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setSummary({ data: null, loading: false, error: message });
      });
  }, []);

  useEffect(() => {
    listAccounts()
      .then((data: SocialAccount[]) => {
        setAccounts({ data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setAccounts({ data: null, loading: false, error: message });
      });
  }, []);

  const accountList = accounts.data ?? [];
  const platformCounts = new Map<SocialPlatform, number>();
  accountList.forEach((account: SocialAccount) => {
    const current = platformCounts.get(account.platform) ?? 0;
    platformCounts.set(account.platform, current + 1);
  });
  interface DistributionRow {
    name: string;
    platform: string;
    count: number;
  }
  const distributionRows: DistributionRow[] = PLATFORMS.filter(
    (meta: PlatformMeta) => (platformCounts.get(meta.value) ?? 0) > 0,
  ).map((meta: PlatformMeta) => ({
    name: meta.name,
    platform: meta.value,
    count: platformCounts.get(meta.value) ?? 0,
  }));
  const maxCount: number = distributionRows.reduce(
    (max: number, row: DistributionRow) => Math.max(max, row.count),
    0,
  );

  return (
    <div>
      <div className="mx-auto max-w-7xl space-y-8 px-8 py-8 pb-20">
        <section>
          <div className="mb-6">
            <h2 className="mb-1 text-[12px] font-black uppercase tracking-[0.15em] text-[#0033A0]">
              01. 数据总览
            </h2>
            <p className="text-[10px] font-medium text-[#94A3B8]">DASHBOARD</p>
          </div>
          <div className="rounded-none border-t-[3px] border-t-[#0033A0] bg-white p-6 shadow-md">
            {summary.loading ? (
              <LoadingLine />
            ) : summary.error !== null ? (
              <DashboardErrorLine message={summary.error} />
            ) : (
              <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
                <KpiItem
                  label="总播放"
                  value={formatNumber(summary.data?.totals.views ?? 0)}
                  valueClass="text-[#1E293B]"
                />
                <KpiItem
                  label="总点赞"
                  value={formatNumber(summary.data?.totals.likes ?? 0)}
                  valueClass="text-[#0033A0]"
                />
                <KpiItem
                  label="总评论"
                  value={formatNumber(summary.data?.totals.comments ?? 0)}
                  valueClass="text-[#1E293B]"
                />
                <KpiItem
                  label="涨粉"
                  value={formatNumber(summary.data?.totals.followersDelta ?? 0)}
                  valueClass="text-[#10B981]"
                />
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="mb-6 flex items-end justify-between">
            <div>
              <h2 className="mb-1 text-[12px] font-black uppercase tracking-[0.15em] text-[#0033A0]">
                02. 账号分布
              </h2>
              <p className="text-[10px] font-medium text-[#94A3B8]">ACCOUNTS</p>
            </div>
            <p className="text-[12px] font-medium text-[#94A3B8]">
              共 <span className="font-mono font-bold text-[#0033A0]">{accountList.length}</span> 个账号
            </p>
          </div>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            <div className="rounded-none border-t-[3px] border-t-[#0033A0] bg-white p-6 shadow-md lg:col-span-7">
              {accounts.loading ? (
                <LoadingLine />
              ) : accounts.error !== null ? (
                <ErrorLine message={accounts.error} />
              ) : distributionRows.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-[12px] font-medium text-slate-600">
                    还没有添加任何账号
                  </p>
                  <Link
                    to="/accounts"
                    className="mt-2 inline-block text-[12px] font-bold text-[#0033A0] underline underline-offset-4"
                  >
                    前往账号矩阵添加第一个账号
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {distributionRows.map((row) => (
                    <AccountBar
                      key={row.name}
                      name={row.name}
                      platform={row.platform}
                      count={row.count}
                      percent={
                        maxCount > 0
                          ? Math.round((row.count / maxCount) * 100)
                          : 0
                      }
                      active={row.count === maxCount}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-none bg-[#0033A0] p-6 shadow-md lg:col-span-5">
              <p className="text-[12px] font-black uppercase tracking-[0.15em] text-white/50">
                Quick Access
              </p>
              <h2 className="mt-2 text-2xl font-black text-white">快捷入口</h2>
              <div className="mt-6 flex flex-col gap-3">
                <Link
                  to="/analytics"
                  className="group flex items-center justify-between rounded-none border border-dashed border-white/30 px-4 py-3 transition-colors hover:border-white/60"
                >
                  <span className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-none border border-white/30">
                      <BarChart3 className="h-4 w-4 text-white" />
                    </span>
                    <span className="text-sm font-bold text-white">
                      去数据复盘
                    </span>
                  </span>
                  <ArrowUpRight className="h-4 w-4 text-white/50 transition-colors group-hover:text-white" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default SocialDashboard;
