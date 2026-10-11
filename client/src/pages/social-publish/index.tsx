import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Send, Trash2, Pencil, Clock, Eye, X } from 'lucide-react';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type { PublishTask, PublishTarget } from '@shared/api.interface';
import { PLATFORM_MAP, PUBLISH_TYPE_LABELS, type PublishType } from '@shared/platforms';
import {
  deletePublishTask,
  listPublishTasks,
} from '@client/src/api/social';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { PLATFORM_LOGOS } from '@/utils/platform-logos';
import { resolveErrorMessage } from '../social-analytics/helpers';
import PublishTypeDialog from './publish-type-dialog';

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  scheduled: '已排期',
  publishing: '发布中',
  published: '已发布',
  partial_failed: '部分失败',
  failed: '失败',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  scheduled: 'bg-[#FFFBEB] text-[#F59E0B]',
  publishing: 'bg-[#EFF4FF] text-[#0033A0]',
  published: 'bg-[#ECFDF5] text-[#10B981]',
  partial_failed: 'bg-[#FFFBEB] text-[#F59E0B]',
  failed: 'bg-[#FEF2F2] text-[#EF4444]',
};

/** 目标平台发布状态徽章 */
const TARGET_STATUS_LABELS: Record<string, string> = {
  pending: '待发布',
  publishing: '发布中',
  success: '发布成功',
  failed: '推送失败',
};
const TARGET_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600',
  publishing: 'bg-[#EFF4FF] text-[#0033A0]',
  success: 'bg-[#ECFDF5] text-[#10B981]',
  failed: 'bg-[#FEF2F2] text-[#EF4444]',
};

/** 可编辑状态：草稿/已排期；发布中及以后不允许编辑，只能查看进度 */
const EDITABLE_STATUS = new Set(['draft', 'scheduled']);

/** 各平台发布进度详情弹窗（点击已发布任务打开） */
function PublishProgressDialog({
  task,
  onClose,
}: {
  task: PublishTask;
  onClose: () => void;
}) {
  const [kw, setKw] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const platforms = useMemo(
    () => [...new Set(task.targets.map((t) => t.platform))],
    [task.targets],
  );

  const filtered = useMemo(() => {
    let rows = task.targets;
    if (kw.trim()) {
      const q = kw.trim().toLowerCase();
      rows = rows.filter(
        (t) =>
          (t.accountName ?? '').toLowerCase().includes(q) ||
          (PLATFORM_MAP[t.platform]?.name ?? t.platform).toLowerCase().includes(q),
      );
    }
    if (platformFilter) rows = rows.filter((t) => t.platform === platformFilter);
    if (statusFilter) rows = rows.filter((t) => t.status === statusFilter);
    return rows;
  }, [task.targets, kw, platformFilter, statusFilter]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
      <div className="flex max-h-[80vh] w-full max-w-[720px] flex-col rounded-none border-t-[3px] border-t-[#0033A0] bg-white shadow-md">
        {/* 头部：标题 + 状态 + 关闭 */}
        <div className="flex items-start justify-between gap-4 border-b border-[#E2E8F0] p-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-bold text-[#1A1A1A]">
                {task.title || '(无标题)'}
              </h2>
              <span className={cn('shrink-0 rounded-sm px-2 py-1 text-[12px] font-bold', STATUS_COLORS[task.status] ?? 'bg-slate-100 text-slate-600')}>
                {STATUS_LABELS[task.status] ?? task.status}
              </span>
            </div>
            <p className="mt-1 text-[10px] font-medium text-[#94A3B8]">
              本机发布 · {PUBLISH_TYPE_LABELS[task.publishType]} · 共 {task.targets.length} 个发布任务
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-none p-2 text-[#94A3B8] transition-colors hover:bg-slate-50 hover:text-[#1A1A1A]"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* 筛选栏 */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[#E2E8F0] px-6 py-3">
          <input
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            placeholder="搜索账号名称"
            className="w-[220px] rounded-none border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm outline-none focus:border-[#0033A0]"
          />
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="rounded-none border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm outline-none focus:border-[#0033A0]"
          >
            <option value="">全部平台</option>
            {platforms.map((p) => (
              <option key={p} value={p}>
                {PLATFORM_MAP[p]?.name ?? p}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-none border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm outline-none focus:border-[#0033A0]"
          >
            <option value="">全部状态</option>
            {Object.entries(TARGET_STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>

        {/* 平台进度列表 */}
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {filtered.length === 0 ? (
            <div className="flex h-[160px] flex-col items-center justify-center gap-2 rounded-none border border-dashed border-[#E2E8F0]">
              <Send className="size-6 text-[#94A3B8]" />
              <p className="text-[12px] font-medium text-[#94A3B8]">没有匹配的发布任务</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((t) => (
                <TargetRow key={t.id} target={t} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** 单个目标平台发布状态行 */
function TargetRow({ target }: { target: PublishTarget }) {
  return (
    <div
      className={cn(
        'rounded-none border border-[#E2E8F0] p-4',
        target.status === 'failed' && 'border-[#FECACA] bg-[#FEF2F2]',
        target.status === 'success' && 'bg-white',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src={PLATFORM_LOGOS[target.platform as keyof typeof PLATFORM_LOGOS]}
            alt={PLATFORM_MAP[target.platform]?.name ?? target.platform}
            title={PLATFORM_MAP[target.platform]?.name ?? target.platform}
            className="shrink-0 rounded-none object-contain"
            style={{ width: 'calc(var(--spacing) * 7)', height: 'calc(var(--spacing) * 7)' }}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[#1A1A1A]">
              {PLATFORM_MAP[target.platform]?.name ?? target.platform}
              <span className="ml-1 font-medium text-[#94A3B8]">/ {target.accountName || '未知账号'}</span>
            </p>
            {target.postUrl && (
              <a
                href={target.postUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-0.5 inline-block max-w-full truncate text-[12px] font-medium text-[#0033A0] hover:underline"
              >
                {target.postUrl}
              </a>
            )}
          </div>
        </div>
        <span className={cn('shrink-0 rounded-sm px-2 py-1 text-[12px] font-bold', TARGET_STATUS_COLORS[target.status] ?? 'bg-slate-100 text-slate-600')}>
          {TARGET_STATUS_LABELS[target.status] ?? target.status}
        </span>
        {target.status === 'publishing' && typeof target.progress === 'number' && target.progress > 0 && (
          <span className="shrink-0 rounded-sm bg-[#EFF4FF] px-2 py-1 text-[12px] font-bold text-[#0033A0]">
            上传中 {target.progress}%
          </span>
        )}
      </div>
      {target.status === 'failed' && target.error && (
        <p className="mt-2 border-t border-[#FECACA] pt-2 text-[12px] font-medium text-[#EF4444]">
          发布失败：{target.error}
        </p>
      )}
    </div>
  );
}

export default function SocialPublish() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<PublishTask[] | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showTypeDialog, setShowTypeDialog] = useState(false);
  /** 待确认删除的发布单 */
  const [confirmDelete, setConfirmDelete] = useState<PublishTask | null>(null);
  const [deleting, setDeleting] = useState(false);
  /** 查看各平台发布进度弹窗 */
  const [progressTask, setProgressTask] = useState<PublishTask | null>(null);

  const load = async () => {
    setError(null);
    try {
      setTasks(await listPublishTasks(statusFilter ? { status: statusFilter } : undefined));
    } catch (e) {
      setError(resolveErrorMessage(e));
    }
  };

  useEffect(() => {
    void load();
  }, [statusFilter]);

  // 存在发布中任务时轮询，实时刷新各平台上传进度
  useEffect(() => {
    const hasPublishing = tasks?.some((t) => t.status === 'publishing') ?? false;
    if (!hasPublishing) return;
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, statusFilter]);

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      await deletePublishTask(id);
      setConfirmDelete(null);
      void load();
    } catch (e) {
      setError(resolveErrorMessage(e));
    } finally {
      setDeleting(false);
    }
  };

  /** 行主操作：可编辑 → 进入编辑页；已发布/发布中/失败 → 打开各平台进度弹窗 */
  const openTask = (task: PublishTask) => {
    if (EDITABLE_STATUS.has(task.status)) {
      navigate(`/publish/${task.id}`);
    } else {
      setProgressTask(task);
    }
  };

  return (
    <div className="px-8 pt-8 pb-20 space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-[12px] font-black uppercase tracking-[0.15em] text-[#0033A0]">
            01. 发布单列表
          </p>
          <p className="text-[10px] font-medium text-[#94A3B8]">
            PUBLISH TASKS · 草稿 / 定时 / 批量多平台发布
          </p>
        </div>
        <Button
          type="button"
          className="rounded-none bg-[#0033A0] text-white hover:bg-[#00236E]"
          onClick={() => setShowTypeDialog(true)}
        >
          <Plus className="size-4" />
          新建发布
        </Button>
      </div>

      {/* 新建发布 → 先选择发布类型 */}
      {showTypeDialog && (
        <PublishTypeDialog
          onSelect={(type) => {
            setShowTypeDialog(false);
            navigate(`/publish/new?type=${type}`);
          }}
          onClose={() => setShowTypeDialog(false)}
        />
      )}

      {/* 状态筛选（账号页同款筛选样式：实心蓝底、可再次点击取消） */}
      <div className="flex flex-wrap gap-2">
        {['', 'draft', 'scheduled', 'publishing', 'published', 'partial_failed', 'failed'].map(
          (s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
              className={cn(
                'flex items-center gap-1.5 rounded-none border px-3 py-1.5 text-sm font-medium transition-colors',
                statusFilter === s
                  ? 'border-transparent bg-[#0033A0] text-white'
                  : 'border-[#E2E8F0] bg-white text-[#475569] hover:bg-slate-50',
              )}
            >
              {s === '' ? '全部' : STATUS_LABELS[s]}
            </button>
          ),
        )}
      </div>

      {/* 列表 */}
      <section className="rounded-none border-t-[3px] border-t-[#0033A0] bg-white shadow-md p-6">
        {error ? (
          <p className="text-[12px] font-medium text-[#EF4444]">{error}</p>
        ) : !tasks ? (
          <Skeleton className="h-[280px] w-full rounded-none" />
        ) : tasks.length === 0 ? (
          <div className="flex h-[240px] flex-col items-center justify-center gap-3 rounded-none border border-dashed border-[#E2E8F0]">
            <Send className="size-8 text-[#94A3B8]" />
            <p className="text-[12px] font-medium text-slate-600">
              暂无发布单，点击右上角「新建发布」创建
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[#E2E8F0]">
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-tight text-[#94A3B8]">类型</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-tight text-[#94A3B8]">标题</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-tight text-[#94A3B8]">目标平台</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-tight text-[#94A3B8]">状态</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-tight text-[#94A3B8]">发布时间</th>
                  <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-tight text-[#94A3B8]">操作</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr
                    key={task.id}
                    className="border-b border-[#E2E8F0] transition-colors last:border-b-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">
                      <span className="rounded-sm bg-[#EFF4FF] px-2 py-1 text-[12px] font-bold text-[#0033A0]">
                        {PUBLISH_TYPE_LABELS[task.publishType]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        className="max-w-[280px] truncate text-sm font-bold text-[#0033A0] hover:underline"
                        onClick={() => openTask(task)}
                      >
                        {task.title || '(无标题)'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {task.targets.slice(0, 6).map((t) => (
                          <img
                            key={t.id}
                            src={PLATFORM_LOGOS[t.platform as keyof typeof PLATFORM_LOGOS]}
                            alt={PLATFORM_MAP[t.platform]?.name ?? t.platform}
                            title={PLATFORM_MAP[t.platform]?.name ?? t.platform}
                            className="rounded-none object-contain"
                            style={{ width: 'calc(var(--spacing) * 6)', height: 'calc(var(--spacing) * 6)' }}
                          />
                        ))}
                        {task.targets.length > 6 && (
                          <span className="text-[10px] font-bold text-[#94A3B8]">
                            +{task.targets.length - 6}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('rounded-sm px-2 py-1 text-[12px] font-bold', STATUS_COLORS[task.status] ?? 'bg-slate-100 text-slate-600')}>
                        {STATUS_LABELS[task.status] ?? task.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {task.scheduledAt ? (
                        <span className="flex items-center gap-1 text-[12px] font-medium text-[#475569]">
                          <Clock className="size-3.5 text-[#F59E0B]" />
                          {new Date(task.scheduledAt).toLocaleString('zh-CN')}
                        </span>
                      ) : task.publishedAt ? (
                        <span className="text-[12px] font-medium text-[#475569]">
                          {new Date(task.publishedAt).toLocaleString('zh-CN')}
                        </span>
                      ) : (
                        <span className="text-[12px] font-medium text-[#94A3B8]">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 rounded-none px-3 text-[12px] font-medium text-[#0033A0] hover:bg-[#EFF4FF]"
                          onClick={() => openTask(task)}
                        >
                          {EDITABLE_STATUS.has(task.status) ? (
                            <>
                              <Pencil className="size-3.5" />
                              编辑
                            </>
                          ) : (
                            <>
                              <Eye className="size-3.5" />
                              进度
                            </>
                          )}
                        </Button>
                        {task.status !== 'publishing' && (
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 rounded-none px-3 text-[12px] font-medium text-[#EF4444] hover:bg-[#FEF2F2]"
                            onClick={() => setConfirmDelete(task)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 删除确认 */}
      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}
      >
        <AlertDialogContent className="w-[420px] rounded-none border-t-[3px] border-t-[#0033A0] p-6 shadow-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold text-[#1A1A1A]">
              确认删除发布单？
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[12px] font-medium text-[#94A3B8]">
              「{confirmDelete?.title || '(无标题)'}」删除后不可恢复；若已发布到平台，平台侧内容不受影响。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6 gap-2">
            <AlertDialogCancel className="rounded-none border-[#E2E8F0] text-[#475569] hover:bg-slate-100">
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={() => confirmDelete && void handleDelete(confirmDelete.id)}
              className="rounded-none bg-[#EF4444] px-6 text-white hover:bg-[#DC2626]"
            >
              {deleting ? '删除中…' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 各平台发布进度弹窗（已发布/发布中/失败任务点击查看） */}
      {progressTask && (
        <PublishProgressDialog
          task={progressTask}
          onClose={() => setProgressTask(null)}
        />
      )}
    </div>
  );
}
