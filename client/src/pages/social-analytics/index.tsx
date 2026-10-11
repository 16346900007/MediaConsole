import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  BarChart3,
  Eye,
  FilePlus2,
  Heart,
  MessageCircle,
  RefreshCw,
  Star,
  Users,
} from 'lucide-react';
import type {
  DataAccountPoint,
  DataOverviewResponse,
} from '@shared/api.interface';
import { PLATFORM_MAP, PLATFORMS } from '@shared/platforms';
import { getDataOverview, syncData } from '@client/src/api/social';
import { PLATFORM_LOGOS } from '@/utils/platform-logos';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatCount, resolveErrorMessage } from './helpers';

const LoadingBlock: React.FC = () => (
  <Skeleton className="h-[260px] w-full rounded-none" />
);

const EmptyHint: React.FC<{ text?: string }> = ({ text }) => (
  <div className="flex h-[220px] flex-col items-center justify-center gap-2 rounded-none border border-dashed border-[#E2E8F0]">
    <BarChart3 className="size-8 text-[#94A3B8]" />
    <p className="text-[12px] font-medium text-slate-600">
      {text ?? '暂无数据，点击右上角「同步数据」抓取各平台真实数据'}
    </p>
  </div>
);

interface KpiCardProps {
  label: string;
  value: number;
  icon: typeof Eye;
}

const KpiCard: React.FC<KpiCardProps> = ({ label, value, icon: Icon }) => (
  <div className="rounded-none border-t-[3px] border-t-[#0033A0] bg-white shadow-md p-6">
    <div className="mb-2 flex items-center gap-2">
      <Icon className="size-4 text-[#0033A0]" />
      <span className="text-[10px] font-black uppercase tracking-tight text-[#94A3B8]">
        {label}
      </span>
    </div>
    <p className="font-mono text-2xl font-bold text-[#1A1A1A]">
      {formatCount(value)}
    </p>
  </div>
);

const SocialAnalytics: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<DataOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  /** 当前筛选平台（null=全部） */
  const [filterPlatform, setFilterPlatform] = useState<keyof typeof PLATFORM_MAP | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const loadOverview = useCallback(async (): Promise<DataOverviewResponse | null> => {
    try {
      const res = await getDataOverview();
      setData(res);
      setError(null);
      return res;
    } catch (err) {
      setError(resolveErrorMessage(err));
      return null;
    }
  }, []);

  /** 后台刷新循环：stale 时触发同步，轮询 overview 直到同步完成 */
  const refreshIfStale = useCallback(
    async (res: DataOverviewResponse) => {
      if (!res.stale || res.syncing || pollingRef.current) return;
      stopPolling();
      try {
        const syncRes = await syncData();
        if (!syncRes.started) return;
        setSyncing(true);
      } catch {
        setSyncing(false);
        return;
      }
      pollingRef.current = setInterval(async () => {
        try {
          const next = await getDataOverview();
          setData(next);
          if (!next.stale && !next.syncing) {
            stopPolling();
            setSyncing(false);
          }
        } catch {
          stopPolling();
          setSyncing(false);
        }
      }, 4000);
    },
    [],
  );

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const res = await loadOverview();
      if (res) await refreshIfStale(res);
      setLoading(false);
    })();
    return stopPolling;
  }, [loadOverview, refreshIfStale]);

  /** 手动同步（全部账号） */
  const handleManualSync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      await syncData();
      pollingRef.current = setInterval(async () => {
        try {
          const next = await getDataOverview();
          setData(next);
          if (!next.stale && !next.syncing) {
            stopPolling();
            setSyncing(false);
          }
        } catch {
          stopPolling();
          setSyncing(false);
        }
      }, 4000);
    } catch (err) {
      setError(resolveErrorMessage(err));
      setSyncing(false);
    }
  }, []);

  /** 前端筛选：按平台重算 totals / byPlatform / byAccount */
  const view = useMemo(() => {
    if (!data) return null;
    const accounts: DataAccountPoint[] = filterPlatform
      ? data.byAccount.filter((a) => a.platform === filterPlatform)
      : data.byAccount;
    const totals = accounts.reduce(
      (acc, a) => ({
        postCount: acc.postCount + a.postCount,
        followersCount: acc.followersCount + a.followersCount,
        views: acc.views + a.views,
        likes: acc.likes + a.likes,
        comments: acc.comments + a.comments,
        favorites: acc.favorites + a.favorites,
      }),
      { postCount: 0, followersCount: 0, views: 0, likes: 0, comments: 0, favorites: 0 },
    );
    const platformMap = new Map<string, (typeof accounts)[number][]>();
    for (const a of accounts) {
      const arr = platformMap.get(a.platform) ?? [];
      arr.push(a);
      platformMap.set(a.platform, arr);
    }
    const byPlatform = Array.from(platformMap.entries())
      .map(([platform, list]) => ({
        platform,
        postCount: list.reduce((s, a) => s + a.postCount, 0),
        followersCount: list.reduce((s, a) => s + a.followersCount, 0),
        views: list.reduce((s, a) => s + a.views, 0),
        likes: list.reduce((s, a) => s + a.likes, 0),
        comments: list.reduce((s, a) => s + a.comments, 0),
        favorites: list.reduce((s, a) => s + a.favorites, 0),
      }))
      .sort((a, b) => b.views - a.views);
    return { totals, byPlatform, accounts };
  }, [data, filterPlatform]);

  const kpis = [
    { key: 'postCount', label: '总发布数', value: view?.totals.postCount ?? 0, icon: FilePlus2 },
    { key: 'followers', label: '总粉丝', value: view?.totals.followersCount ?? 0, icon: Users },
    { key: 'views', label: '总播放', value: view?.totals.views ?? 0, icon: Eye },
    { key: 'comments', label: '总评论', value: view?.totals.comments ?? 0, icon: MessageCircle },
    { key: 'likes', label: '总点赞', value: view?.totals.likes ?? 0, icon: Heart },
    { key: 'favorites', label: '总收藏', value: view?.totals.favorites ?? 0, icon: Star },
  ];

  const pillClass = (active: boolean): string =>
    cn(
      'flex items-center gap-1.5 rounded-none border px-3 py-1.5 text-sm font-medium transition-colors',
      active
        ? 'border-transparent bg-[#0033A0] text-white'
        : 'border-[#E2E8F0] bg-white text-[#475569] hover:bg-slate-50',
    );

  return (
    <div className="px-8 pt-8 pb-20 space-y-8">
      {/* 01 筛选与同步 */}
      <div>
        <div className="mb-6">
          <p className="mb-1 text-[12px] font-black uppercase tracking-[0.15em] text-[#0033A0]">
            01. 数据筛选
          </p>
          <p className="text-[10px] font-medium text-[#94A3B8]">
            FILTER &amp; SYNC
          </p>
        </div>
        <section className="rounded-none border-t-[3px] border-t-[#0033A0] bg-white shadow-md p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => setFilterPlatform(null)}
                className={pillClass(filterPlatform === null)}
              >
                全部平台
              </button>
              {PLATFORMS.map((meta) => (
                <button
                  key={meta.value}
                  type="button"
                  onClick={() =>
                    setFilterPlatform(
                      filterPlatform === meta.value ? null : meta.value,
                    )
                  }
                  className={pillClass(filterPlatform === meta.value)}
                >
                  <img
                    src={PLATFORM_LOGOS[meta.value]}
                    alt=""
                    className="size-4 rounded-none"
                  />
                  {meta.name}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              {syncing && (
                <span className="flex items-center gap-1.5 text-[12px] font-medium text-[#94A3B8]">
                  <RefreshCw className="size-3.5 animate-spin" />
                  后台同步中，界面保持可用
                </span>
              )}
              {data?.updatedAt && !syncing && (
                <span className="text-[12px] font-medium text-[#94A3B8]">
                  上次同步：{new Date(data.updatedAt).toLocaleString('zh-CN')}
                </span>
              )}
              <Button
                type="button"
                variant="outline"
                className="rounded-none border-[#0033A0] text-[#0033A0] hover:bg-[#EFF4FF]"
                onClick={() => void handleManualSync()}
                disabled={syncing}
              >
                <RefreshCw className={cn('size-4', syncing && 'animate-spin')} />
                同步数据
              </Button>
            </div>
          </div>
          {data?.stale && !syncing && (
            <p className="mt-3 text-[12px] font-medium text-[#F59E0B]">
              缓存已超过 10 分钟，将在后台自动拉取最新数据
            </p>
          )}
        </section>
      </div>

      {error !== null && data === null ? (
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
              onClick={() => void loadOverview()}
            >
              <RefreshCw className="size-4" />
              重试
            </Button>
          </div>
        </section>
      ) : (
        <>
          {/* 02 核心指标 */}
          <section className="space-y-6">
            <div>
              <p className="mb-1 text-[12px] font-black uppercase tracking-[0.15em] text-[#0033A0]">
                02. 核心指标
              </p>
              <p className="text-[10px] font-medium text-[#94A3B8]">
                KEY METRICS
              </p>
            </div>
            {loading ? (
              <div className="grid grid-cols-2 gap-6 md:grid-cols-3 xl:grid-cols-6">
                {kpis.map((kpi) => (
                  <Skeleton
                    key={kpi.key}
                    className="h-[118px] rounded-none"
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-6 md:grid-cols-3 xl:grid-cols-6">
                {kpis.map((kpi) => (
                  <KpiCard
                    key={kpi.key}
                    label={kpi.label}
                    value={kpi.value}
                    icon={kpi.icon}
                  />
                ))}
              </div>
            )}
          </section>

          {/* 03 账号分布 */}
          <section className="rounded-none border-t-[3px] border-t-[#0033A0] bg-white shadow-md p-6">
            <div className="mb-6">
              <p className="mb-1 text-[12px] font-black uppercase tracking-[0.15em] text-[#0033A0]">
                03. 账号分布
              </p>
              <p className="text-[10px] font-medium text-[#94A3B8]">
                ACCOUNT DISTRIBUTION · 点击账号进入作品列表
              </p>
            </div>
            {loading ? (
              <LoadingBlock />
            ) : !view || view.accounts.length === 0 ? (
              <EmptyHint />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[#E2E8F0]">
                      {[
                        '账号',
                        '发布数',
                        '粉丝数',
                        '播放量',
                        '评论',
                        '点赞',
                        '收藏',
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-[10px] font-black uppercase tracking-tight text-[#94A3B8]"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {view.accounts.map((acct) => {
                      const meta = PLATFORM_MAP[acct.platform];
                      return (
                        <tr
                          key={acct.accountId}
                          onClick={() => navigate(`/analytics/${acct.accountId}`)}
                          className="cursor-pointer border-b border-[#E2E8F0] transition-colors last:border-b-0 hover:bg-slate-50"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <img
                                src={PLATFORM_LOGOS[acct.platform]}
                                alt=""
                                className="size-5 shrink-0 rounded-none"
                              />
                              <span className="text-sm font-bold text-[#0033A0]">
                                {acct.accountName}
                              </span>
                              <span className="text-[12px] font-medium text-[#94A3B8]">
                                {meta.name}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-left text-sm font-medium text-[#1A1A1A]">
                            {formatCount(acct.postCount)}
                          </td>
                          <td className="px-4 py-3 font-mono text-left text-sm font-medium text-[#1A1A1A]">
                            {formatCount(acct.followersCount)}
                          </td>
                          <td className="px-4 py-3 font-mono text-left text-sm font-bold text-[#1A1A1A]">
                            {formatCount(acct.views)}
                          </td>
                          <td className="px-4 py-3 font-mono text-left text-sm font-medium text-[#1A1A1A]">
                            {formatCount(acct.comments)}
                          </td>
                          <td className="px-4 py-3 font-mono text-left text-sm font-medium text-[#1A1A1A]">
                            {formatCount(acct.likes)}
                          </td>
                          <td className="px-4 py-3 font-mono text-left text-sm font-medium text-[#1A1A1A]">
                            {formatCount(acct.favorites)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default SocialAnalytics;
