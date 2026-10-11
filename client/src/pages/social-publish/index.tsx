import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Send, Trash2, Pencil, Clock } from 'lucide-react';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type { PublishTask } from '@shared/api.interface';
import { PLATFORM_MAP, PUBLISH_TYPE_LABELS, type PublishType } from '@shared/platforms';
import {
  deletePublishTask,
  listPublishTasks,
} from '@client/src/api/social';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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

export default function SocialPublish() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<PublishTask[] | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showTypeDialog, setShowTypeDialog] = useState(false);

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

  const handleDelete = async (id: string) => {
    try {
      await deletePublishTask(id);
      void load();
    } catch (e) {
      setError(resolveErrorMessage(e));
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-8 pt-8 pb-20 space-y-8">
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

      {/* 状态筛选 */}
      <div className="flex flex-wrap gap-2">
        {['', 'draft', 'scheduled', 'publishing', 'published', 'partial_failed', 'failed'].map(
          (s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={cn(
                'rounded-none px-3 py-1.5 text-[12px] font-bold transition-colors',
                statusFilter === s
                  ? 'bg-[#0033A0] text-white'
                  : 'bg-white text-[#475569] hover:bg-slate-100 border border-[#E2E8F0]',
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
                        onClick={() => navigate(`/publish/${task.id}`)}
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
                          onClick={() => navigate(`/publish/${task.id}`)}
                        >
                          <Pencil className="size-3.5" />
                          {task.status === 'published' ? '查看' : '编辑'}
                        </Button>
                        {task.status !== 'publishing' && (
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 rounded-none px-3 text-[12px] font-medium text-[#EF4444] hover:bg-[#FEF2F2]"
                            onClick={() => void handleDelete(task.id)}
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
    </div>
  );
}
