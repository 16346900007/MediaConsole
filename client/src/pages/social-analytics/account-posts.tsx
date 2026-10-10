import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, RefreshCw } from 'lucide-react';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  DataOverviewResponse,
  SocialPlatform,
  SocialPost,
} from '@shared/api.interface';
import { PLATFORM_MAP } from '@shared/platforms';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const columns = useMemo(() => {
    if (!account) return DEFAULT_COLUMNS;
    return EXTRA_COLUMNS[account.platform] ?? DEFAULT_COLUMNS;
  }, [account]);

  const handleSync = useCallback(async () => {
    if (!accountId) return;
    try {
      await syncData(accountId);
      // 同步完成后刷新
      await new Promise((r) => setTimeout(r, 8000));
      await load();
    } catch {
      /* 后台同步失败由下次加载兜底 */
    }
  }, [accountId, load]);

  if (!accountId) return null;

  return (
    <div className="max-w-7xl mx-auto px-8 pt-8 pb-20 space-y-8">
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
          <Skeleton className="h-[72px] w-full rounded-none" />
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
              <p className="text-base font-semibold text-[#1A1A1A]">
                {account.accountName}
              </p>
              <p className="mt-0.5 text-[12px] font-medium text-[#94A3B8]">
                {PLATFORM_MAP[account.platform].name} ·{' '}
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
            >
              <RefreshCw className="size-4" />
              同步该账号
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
          <Skeleton className="h-[300px] w-full rounded-none" />
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
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-tight text-[#94A3B8]">
                    作品
                  </th>
                  {columns.map((key) => (
                    <th
                      key={key}
                      className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-tight text-[#94A3B8]"
                    >
                      {COLUMN_LABELS[key]}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-tight text-[#94A3B8]">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => (
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
      </section>
    </div>
  );
};

const Metric: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="text-right">
    <p className="mb-1 text-[10px] font-black uppercase tracking-tight text-[#94A3B8]">
      {label}
    </p>
    <p className="font-mono text-lg font-bold text-[#1A1A1A]">
      {formatCount(value)}
    </p>
  </div>
);

export default AccountPosts;
