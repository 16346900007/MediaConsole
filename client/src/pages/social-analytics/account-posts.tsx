import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, RefreshCw } from 'lucide-react';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  DataOverviewResponse,
  SocialPlatform,
  SocialPost,
} from '@shared/api.interface';
import { PLATFORM_MAP } from '@shared/platforms';
import { PLATFORM_LOGOS } from '@/utils/platform-logos';
import { getDataOverview, getDataPosts, syncData } from '@client/src/api/social';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatCount, resolveErrorMessage } from './helpers';

/** 平台特有列：通用 6 指标之上，各平台追加其特有指标（数据来自 post.raw） */
type ColumnKey =
  | 'playRate'
  | 'followersDelta'
  | 'views'
  | 'comments'
  | 'likes'
  | 'favorites'
  | 'shares'
  | 'coins'
  | 'danmaku'
  | 'forwards';

const EXTRA_COLUMNS: Partial<Record<SocialPlatform, ColumnKey[]>> = {
  kuaishou: ['views', 'playRate', 'comments', 'likes', 'favorites', 'followersDelta'],
  douyin: ['views', 'likes', 'comments', 'favorites', 'shares'],
  xiaohongshu: ['views', 'likes', 'comments', 'favorites', 'shares'],
  bilibili: ['views', 'likes', 'comments', 'favorites', 'coins', 'danmaku', 'forwards'],
  shipinhao: ['views', 'likes', 'comments', 'favorites', 'forwards'],
  weibo: ['views', 'likes', 'comments', 'forwards'],
  youtube: ['views', 'likes', 'comments'],
};

const COLUMN_LABELS: Record<ColumnKey, string> = {
  playRate: '完播率',
  followersDelta: '涨粉量',
  views: '播放量',
  comments: '评论量',
  likes: '点赞量',
  favorites: '收藏量',
  shares: '分享量',
  coins: '投币量',
  danmaku: '弹幕量',
  forwards: '转发量',
};

const DEFAULT_COLUMNS: ColumnKey[] = ['views', 'likes', 'comments', 'favorites'];

/** 从平台 raw 中读取特有指标数值 */
function rawCount(post: SocialPost, path: string[]): number {
  let node: unknown = post.raw;
  for (const key of path) {
    if (node === null || node === undefined) return 0;
    node = (node as Record<string, unknown>)[key];
  }
  return typeof node === 'number' ? node : Number(node ?? 0) || 0;
}

function renderCell(key: ColumnKey, post: SocialPost, platform: SocialPlatform): string {
  switch (key) {
    case 'playRate':
      return post.watchRate === null || post.watchRate === undefined
        ? '-'
        : `${post.watchRate.toFixed(2)}%`;
    case 'followersDelta':
      return post.followersDelta > 0 ? `+${formatCount(post.followersDelta)}` : '0';
    case 'views':
      return formatCount(post.views);
    case 'comments':
      return formatCount(post.comments);
    case 'likes':
      return formatCount(post.likes);
    case 'favorites':
      return formatCount(post.favorites);
    case 'shares':
      return formatCount(
        platform === 'douyin'
          ? rawCount(post, ['statistics', 'share_count'])
          : platform === 'xiaohongshu'
            ? rawCount(post, ['shared_count'])
            : 0,
      );
    case 'coins':
      return formatCount(rawCount(post, ['stat', 'coin']));
    case 'danmaku':
      return formatCount(rawCount(post, ['stat', 'danmaku']));
    case 'forwards':
      return formatCount(
        platform === 'bilibili'
          ? rawCount(post, ['stat', 'share'])
          : platform === 'shipinhao'
            ? rawCount(post, ['forwardCount'])
            : platform === 'weibo'
              ? rawCount(post, ['reposts_count'])
              : 0,
      );
    default:
      return '-';
  }
}

function openOriginal(post: SocialPost, accountId: string): void {
  const url = post.postUrl;
  if (!url) return;
  axiosForBackend({
    url: '/api/social/open-external',
    method: 'GET',
    params: { url, accountId },
  })
    .then((r) => {
      if (!r.data?.ok) console.error('[open] rejected', r.data);
    })
    .catch((err: unknown) => console.error('[open] failed', err));
}

const AccountPosts: React.FC = () => {
  const { accountId } = useParams<{ accountId: string }>();
  const navigate = useNavigate();
  const [overview, setOverview] = useState<DataOverviewResponse | null>(null);
  const [posts, setPosts] = useState<SocialPost[] | null>(null);
  /** 作品列表分页 */
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** 同步中（后台抓取可能 30s+，按钮显示进度并等待完成） */
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setError(null);
    try {
      const [ov, postList] = await Promise.all([
        getDataOverview(accountId),
        getDataPosts(accountId),
      ]);
      setOverview(ov);
      setPosts(postList);
    } catch (err) {
      setError(resolveErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  const account = useMemo(
    () => overview?.byAccount.find((a) => a.accountId === accountId) ?? null,
    [overview, accountId],
  );

  const totalPages = useMemo(
    () => (posts ? Math.max(1, Math.ceil(posts.length / PAGE_SIZE)) : 1),
    [posts],
  );
  const pagePosts = useMemo(() => {
    if (!posts) return undefined;
    const start = (page - 1) * PAGE_SIZE;
    return posts.slice(start, start + PAGE_SIZE);
  }, [posts, page]);

  // 数据变化后页码越界自动回退
  useEffect(() => {
    if (posts && page > totalPages) setPage(totalPages);
  }, [posts, page, totalPages]);

  const columns = useMemo(() => {
    if (!account) return DEFAULT_COLUMNS;
    return EXTRA_COLUMNS[account.platform] ?? DEFAULT_COLUMNS;
  }, [account]);

  const handleSync = useCallback(async () => {
    if (!accountId || syncing) return;
    setSyncing(true);
    try {
      await syncData(accountId);
      // 后台抓取是异步任务，轮询等待该账号同步完成（最长 120s）后再刷新列表
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        try {
          const ov = await getDataOverview(accountId);
          if (!ov.syncing) break;
        } catch {
          break;
        }
      }
      await load();
    } catch {
      /* 后台同步失败由下次加载兜底 */
    } finally {
      setSyncing(false);
    }
  }, [accountId, load, syncing]);

  if (!accountId) return null;

  return (
    <div className="px-8 pt-8 pb-20 space-y-8">
      <div>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mb-4 flex items-center gap-1.5 text-[12px] font-medium text-[#94A3B8] transition-colors hover:text-[#0033A0]"
        >
          <ArrowLeft className="size-3.5" />
          返回工作台
        </button>
        <div className="mb-6">
          <p className="mb-1 text-[12px] font-black uppercase tracking-[0.15em] text-[#0033A0]">
            01. 账号作品
          </p>
          <p className="text-[10px] font-medium text-[#94A3B8]">
            ACCOUNT WORKS LIST
          </p>
        </div>
      </div>

      {/* 账号信息卡 */}
      <section className="rounded-none border-t-[3px] border-t-[#0033A0] bg-white shadow-md p-6">
        {loading ? (
          <div className="flex flex-wrap items-center gap-4">
            <Skeleton className="size-12 rounded-none" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-5 w-40 rounded-none" />
              <Skeleton className="h-4 w-64 rounded-none" />
            </div>
            <div className="flex items-center gap-6">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-14 rounded-none" />
              ))}
            </div>
            <Skeleton className="h-9 w-28 rounded-none" />
          </div>
        ) : account ? (
          <div className="flex flex-wrap items-center gap-4">
            {account.avatar ? (
              <img
                src={`/avatar-proxy?url=${encodeURIComponent(account.avatar)}`}
                referrerPolicy="no-referrer"
                alt=""
                className="size-12 rounded-none object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <span className="flex size-12 items-center justify-center rounded-none bg-[#EFF4FF] text-sm font-black text-[#0033A0]">
                {account.accountName.slice(0, 1)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-base font-semibold text-[#1A1A1A]">
                  {account.accountName}
                </p>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-[#EFF4FF] px-2 py-0.5 text-[12px] font-bold text-[#0033A0]">
                  <img
                    src={PLATFORM_LOGOS[account.platform]}
                    alt=""
                    className="size-3.5 rounded-none object-contain"
                  />
                  {PLATFORM_MAP[account.platform].name}
                </span>
              </div>
              <p className="mt-1 text-[12px] font-medium text-[#94A3B8]">
                {formatCount(account.followersCount)} 粉丝 · {account.postCount}{' '}
                作品
              </p>
            </div>
            <div className="flex items-center gap-6">
              <Metric label="总播放" value={account.views} />
              <Metric label="总点赞" value={account.likes} />
              <Metric label="总评论" value={account.comments} />
              <Metric label="总收藏" value={account.favorites} />
            </div>
            <Button
              type="button"
              variant="outline"
              className="rounded-none border-[#0033A0] text-[#0033A0] hover:bg-[#EFF4FF]"
              onClick={() => void handleSync()}
              disabled={syncing}
            >
              <RefreshCw className={`size-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? '同步中…' : '同步该账号'}
            </Button>
          </div>
        ) : (
          <p className="text-[12px] font-medium text-slate-600">账号不存在</p>
        )}
      </section>

      {/* 作品列表 */}
      <section className="rounded-none border-t-[3px] border-t-[#0033A0] bg-white shadow-md p-6">
        <div className="mb-6">
          <p className="mb-1 text-[12px] font-black uppercase tracking-[0.15em] text-[#0033A0]">
            02. 作品列表
          </p>
          <p className="text-[10px] font-medium text-[#94A3B8]">
            WORKS · {columns.length + 1} 列 · 点击「查看原作品」跳转平台
          </p>
        </div>
        {loading ? (
          <div>
            <div className="flex gap-6 border-b border-[#E2E8F0] px-4 pb-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-3 w-14 rounded-none" />
              ))}
            </div>
            <div className="divide-y divide-[#E2E8F0]">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-6 px-4 py-4">
                  <Skeleton className="size-10 shrink-0 rounded-none" />
                  <Skeleton className="h-4 w-1/3 rounded-none" />
                  <Skeleton className="h-4 w-16 rounded-none" />
                  <Skeleton className="h-4 w-16 rounded-none" />
                  <Skeleton className="ml-auto h-4 w-24 rounded-none" />
                </div>
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-[12px] font-medium text-[#EF4444]">{error}</p>
            <Button
              type="button"
              variant="outline"
              className="rounded-none"
              onClick={() => void load()}
            >
              <RefreshCw className="size-4" />
              重试
            </Button>
          </div>
        ) : !posts || posts.length === 0 ? (
          <div className="flex h-[220px] flex-col items-center justify-center gap-2 rounded-none border border-dashed border-[#E2E8F0]">
            <p className="text-[12px] font-medium text-slate-600">
              暂无作品数据，点击「同步该账号」抓取平台真实作品
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[#E2E8F0]">
                  <th className="px-4 py-3 text-[12px] font-black uppercase tracking-tight text-[#64748B]">
                    作品
                  </th>
                  {columns.map((key) => (
                    <th
                      key={key}
                      className="px-4 py-3 text-right text-[12px] font-black uppercase tracking-tight text-[#64748B]"
                    >
                      {COLUMN_LABELS[key]}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-[12px] font-black uppercase tracking-tight text-[#64748B]">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagePosts?.map((post) => (
                  <tr
                    key={post.platformPostId}
                    className="border-b border-[#E2E8F0] transition-colors last:border-b-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {post.coverUrl ? (
                          <img
                            src={`/avatar-proxy?url=${encodeURIComponent(post.coverUrl)}`}
                            referrerPolicy="no-referrer"
                            alt=""
                            className="size-12 shrink-0 rounded-none object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <span className="flex size-12 shrink-0 items-center justify-center rounded-none bg-[#EFF4FF] text-[10px] font-black text-[#0033A0]">
                            无封面
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="max-w-[320px] truncate text-sm font-bold text-[#0033A0]">
                            {post.title || '(无标题)'}
                          </p>
                          <p className="mt-0.5 text-[12px] font-medium text-[#94A3B8]">
                            {post.publishedAt
                              ? new Date(post.publishedAt).toLocaleString('zh-CN')
                              : '发布时间未知'}
                          </p>
                        </div>
                      </div>
                    </td>
                    {columns.map((key) => (
                      <td
                        key={key}
                        className={cn(
                          'px-4 py-3 font-mono text-sm font-medium text-[#1A1A1A]',
                          key === 'views' && 'font-bold',
                        )}
                      >
                        <span
                          className={cn(
                            'block text-right',
                            key === 'views' && 'font-bold',
                          )}
                        >
                          {renderCell(key, post, account.platform)}
                        </span>
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right">
                      {post.postUrl ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 rounded-none px-3 text-[12px] font-medium text-[#0033A0] hover:bg-[#EFF4FF]"
                          onClick={() => openOriginal(post, accountId)}
                        >
                          <ExternalLink className="size-3.5" />
                          查看原作品
                        </Button>
                      ) : (
                        <span className="text-[12px] font-medium text-[#94A3B8]">
                          -
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 作品列表分页（始终显示） */}
        {posts && posts.length > 0 && (
          <div className="mt-4 flex items-center justify-between border-t border-[#E2E8F0] pt-4">
            <span className="text-[12px] font-medium text-[#94A3B8]">
              共 {posts.length} 条 · 第 {page}/{totalPages} 页
            </span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                className="size-8 rounded-none border-[#E2E8F0] p-0 text-[#475569] hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="上一页"
              >
                <ChevronLeft className="size-4" />
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <Button
                  key={n}
                  type="button"
                  variant="outline"
                  className={cn(
                    'size-8 rounded-none border-[#E2E8F0] p-0 text-[12px] font-bold',
                    n === page
                      ? 'bg-[#0033A0] text-white hover:bg-[#00236E]'
                      : 'text-[#475569] hover:bg-slate-100',
                  )}
                  onClick={() => setPage(n)}
                >
                  {n}
                </Button>
              ))}
              <Button
                type="button"
                variant="outline"
                className="size-8 rounded-none border-[#E2E8F0] p-0 text-[#475569] hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                aria-label="下一页"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

const Metric: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="text-right">
    <p className="mb-1 text-[12px] font-black uppercase tracking-tight text-[#64748B]">
      {label}
    </p>
    <p className="font-mono text-lg font-bold text-[#1A1A1A]">
      {formatCount(value)}
    </p>
  </div>
);

export default AccountPosts;
