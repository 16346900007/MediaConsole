import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Send, Trash2, Pencil, Wand2, ChevronLeft, ChevronRight } from 'lucide-react';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  FillFormsResult,
  PublishTask,
  SocialPlatform,
} from '@shared/api.interface';
import { PLATFORM_MAP, PUBLISH_TYPE_LABELS, type PublishType } from '@shared/platforms';
import {
  deletePublishTask,
  listPublishTasks,
} from '@client/src/api/social';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { FillFormDialog } from './fill-form-dialog';

export default function SocialPublish() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<PublishTask[] | null>(null);
  /** 列表加载错误 */
  const [error, setError] = useState<string | null>(null);
  const [showTypeDialog, setShowTypeDialog] = useState(false);
  /** 待确认删除的发布单 */
  const [confirmDelete, setConfirmDelete] = useState<PublishTask | null>(null);
  const [deleting, setDeleting] = useState(false);
  /** 自动填表弹窗（选中待填表任务） */
  const [fillTask, setFillTask] = useState<PublishTask | null>(null);
  /** 分页 */
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  /** 目标账号列展开（默认显示 2 个，点击 +N 展开全部） */
  const [expandedTargets, setExpandedTargets] = useState<ReadonlySet<string>>(
    new Set(),
  );

  const totalPages = useMemo(
    () => (tasks ? Math.max(1, Math.ceil(tasks.length / PAGE_SIZE)) : 1),
    [tasks],
  );
  const pageTasks = useMemo(() => {
    if (!tasks) return undefined;
    const start = (page - 1) * PAGE_SIZE;
    return tasks.slice(start, start + PAGE_SIZE);
  }, [tasks, page]);

  const load = async () => {
    setError(null);
    try {
      setTasks(await listPublishTasks());
    } catch (e) {
      setError(resolveErrorMessage(e));
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 存在发布中任务时轮询，实时刷新各平台上传进度
  useEffect(() => {
    const hasPublishing = tasks?.some((t) => t.status === 'publishing') ?? false;
    if (!hasPublishing) return;
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  
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

  /** 行主操作：进入编辑页 */
  const openTask = (task: PublishTask) => {
    navigate(`/publish/${task.id}`);
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
                  <th className="px-4 py-3 text-[12px] font-black uppercase tracking-tight text-[#64748B]">类型</th>
                  <th className="px-4 py-3 text-[12px] font-black uppercase tracking-tight text-[#64748B]">标题</th>
                  <th className="px-4 py-3 text-[12px] font-black uppercase tracking-tight text-[#64748B]">目标账号</th>
                  <th className="px-4 py-3 text-right text-[12px] font-black uppercase tracking-tight text-[#64748B]">操作</th>
                </tr>
              </thead>
              <tbody>
                {pageTasks?.map((task) => (
                  <tr
                    key={task.id}
                    className="border-b border-[#E2E8F0] transition-colors last:border-b-0 hover:bg-slate-50"
                  >
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="inline-flex whitespace-nowrap rounded-sm bg-[#EFF4FF] px-2 py-1 text-[12px] font-bold text-[#0033A0]">
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
                    <td className="max-w-[520px] px-4 py-3">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        {(expandedTargets.has(task.id)
                          ? task.targets
                          : task.targets.slice(0, 2)
                        ).map((t) => (
                          <span
                            key={t.id}
                            className="flex items-center gap-1.5"
                            title={`${PLATFORM_MAP[t.platform]?.name ?? t.platform} · ${t.accountName ?? '未知账号'}`}
                          >
                            <img
                              src={PLATFORM_LOGOS[t.platform as keyof typeof PLATFORM_LOGOS]}
                              alt={PLATFORM_MAP[t.platform]?.name ?? t.platform}
                              className="h-4 w-4 shrink-0 rounded-none object-contain"
                            />
                            <span className="max-w-[140px] truncate text-[12px] font-medium text-[#475569]">
                              {t.accountName ?? '未知账号'}
                            </span>
                          </span>
                        ))}
                        {!expandedTargets.has(task.id) && task.targets.length > 2 && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedTargets((prev) => {
                                const next = new Set(prev);
                                next.add(task.id);
                                return next;
                              })
                            }
                            className="text-[12px] font-bold text-[#0033A0] hover:underline"
                          >
                            +{task.targets.length - 2} 更多
                          </button>
                        )}
                        {expandedTargets.has(task.id) && task.targets.length > 2 && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedTargets((prev) => {
                                const next = new Set(prev);
                                next.delete(task.id);
                                return next;
                              })
                            }
                            className="text-[12px] font-bold text-[#94A3B8] hover:underline"
                          >
                            收起
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 rounded-none px-3 text-[12px] font-medium text-[#0033A0] hover:bg-[#EFF4FF]"
                          onClick={() => openTask(task)}
                        >
                          <Pencil className="size-3.5" />
                          编辑
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 rounded-none px-3 text-[12px] font-medium text-[#0033A0] hover:bg-[#EFF4FF]"
                          onClick={() => setFillTask(task)}
                        >
                          <Wand2 className="size-3.5" />
                          填表
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 rounded-none px-3 text-[12px] font-medium text-[#EF4444] hover:bg-[#FEF2F2]"
                          onClick={() => setConfirmDelete(task)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 分页（始终显示） */}
        {tasks && tasks.length > 0 && (
          <div className="mt-4 flex items-center justify-between border-t border-[#E2E8F0] pt-4">
            <span className="text-[12px] font-medium text-[#94A3B8]">
              共 {tasks.length} 条 · 第 {page}/{totalPages} 页
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

      {/* 自动填表弹窗（草稿/排期/失败任务） */}
      {fillTask && (
        <FillFormDialog
          task={fillTask}
          onClose={() => setFillTask(null)}
        />
      )}
    </div>
  );
}
