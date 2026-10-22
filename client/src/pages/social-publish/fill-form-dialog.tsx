import { useEffect, useMemo, useState } from 'react';
import { Wand2 } from 'lucide-react';
import type { FillFormsResult, PublishTarget, PublishTask } from '@shared/api.interface';
import { PLATFORM_MAP } from '@shared/platforms';
import { fillPublishTaskForms, getPublishTask } from '@client/src/api/social';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { PLATFORM_LOGOS } from '@/utils/platform-logos';
import { resolveErrorMessage } from '../social-analytics/helpers';

/**
 * 自动填表弹窗：展示每个平台的发布情况（待填表 / 填表中 / 已填表 / 已发布）。
 * autoRun 为 true 时打开即对全部目标执行填表。
 * 用户人工在浏览器点击发布并关闭窗口后，后端记录该平台已发布，弹窗每 4s 轮询刷新。
 */
export function FillFormDialog({
  task,
  onClose,
  autoRun = false,
}: {
  task: PublishTask;
  onClose: () => void;
  autoRun?: boolean;
}) {
  /** 实时任务（轮询：用户发布关窗后 targets 状态会更新为 success） */
  const [liveTask, setLiveTask] = useState<PublishTask>(task);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<FillFormsResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /** 勾选的平台（默认全部未发布平台；已发布的平台固定勾选且不可取消） */
  const [selected, setSelected] = useState<Set<SocialPlatform>>(
    () =>
      new Set(
        task.targets
          .filter((t) => t.status !== 'success')
          .map((t) => t.platform),
      ),
  );

  /** 平台行固定顺序：按打开弹窗时的任务顺序（后端轮询返回可能乱序，这里做稳定排序） */
  const targetOrder = useMemo(() => {
    const m = new Map<string, number>();
    task.targets.forEach((t, i) => m.set(`${t.platform}-${t.accountId}`, i));
    return m;
  }, [task]);
  const targets = useMemo(() => {
    const arr = [...liveTask.targets];
    arr.sort((a, b) => {
      const ia = targetOrder.get(`${a.platform}-${a.accountId}`) ?? 999;
      const ib = targetOrder.get(`${b.platform}-${b.accountId}`) ?? 999;
      return ia - ib;
    });
    return arr;
  }, [liveTask.targets, targetOrder]);
  const publishedCount = targets.filter((t) => t.status === 'success').length;
  const allPublished = targets.length > 0 && publishedCount === targets.length;

  /* 轮询发布单：用户发布后关闭 Edge 窗口 → 服务端标记 success → 列表实时变绿 */
  useEffect(() => {
    const timer = setInterval(() => {
      void getPublishTask(task.id)
        .then(setLiveTask)
        .catch(() => {});
    }, 4000);
    return () => clearInterval(timer);
  }, [task.id]);

  const run = async () => {
    setRunning(true);
    setErr(null);
    // 清掉上一次填表结果：勾选平台行立即显示「填表中…」（服务端同时清掉旧失败信息）
    setResult(null);
    try {
      const r = await fillPublishTaskForms(task.id, { platforms: [...selected] });
      setResult(r);
      // 填表完成后立即拉一次最新任务（窗口已打开，target 状态可能已变化）
      const latest = await getPublishTask(task.id).catch(() => null);
      if (latest) setLiveTask(latest);
    } catch (e) {
      setErr(resolveErrorMessage(e));
    } finally {
      setRunning(false);
    }
  };

  const toggle = (p: SocialPlatform) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  /* autoRun：打开即对全部目标执行（无需再点开始） */
  useEffect(() => {
    if (autoRun && !running && !result && !err) {
      void run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun]);

  /** 每行状态：已发布 > 填表中(实时失败优先) > 本次填表结果 > 待填表 */
  const rowState = (
    t: PublishTarget,
    isSelected: boolean,
  ): { label: string; color: string; msg: string } => {
    if (t.status === 'success') {
      return { label: '已发布', color: 'green', msg: '已在平台发布，窗口已关闭' };
    }
    if (running && isSelected) {
      // 服务端每处理完一个平台就回写 error → 轮询后立即显示失败，不用等全部完成
      if (t.error) {
        return { label: '填表失败', color: 'red', msg: t.error };
      }
      return { label: '填表中…', color: 'blue', msg: '正在打开浏览器并自动填写表单' };
    }
    const r = result?.opened.find(
      (x) => x.platform === t.platform && x.accountName === t.accountName,
    );
    if (r?.status === 'filled') {
      return { label: '已填表', color: 'blue', msg: r.message };
    }
    if (r?.status === 'failed') {
      return { label: '填表失败', color: 'red', msg: r.message };
    }
    if (r?.status === 'skipped') {
      return { label: '已跳过', color: 'gray', msg: r.message };
    }
    return { label: '待填表', color: 'gray', msg: '点击「开始填表」，在浏览器中自动填写后由你人工发布' };
  };

  /** 长错误消息截断，完整内容放悬浮提示 */
  const truncateMsg = (s: string, n = 26): string =>
    s.length > n ? `${s.slice(0, n)}…` : s;

  const badgeClass = (color: string): string =>
    color === 'green'
      ? 'bg-[#ECFDF5] text-[#10B981]'
      : color === 'red'
        ? 'bg-[#FEF2F2] text-[#EF4444]'
        : color === 'blue'
          ? 'bg-[#EFF4FF] text-[#0033A0]'
          : 'bg-slate-100 text-slate-600';

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !running) onClose(); }}>
      <DialogContent className="w-[560px] rounded-none border-t-[3px] border-t-[#0033A0] p-6 shadow-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-[#1A1A1A]">
            <Wand2 className="size-4 text-[#0033A0]" />
            自动填表
          </DialogTitle>
        </DialogHeader>

        <p className="text-[12px] font-medium text-[#94A3B8]">
          「{task.title || '(无标题)'}」将在浏览器中打开平台发布页并自动填写，<span className="font-bold text-[#0033A0]">最后一步由你人工点击发布</span>；发布后关闭浏览器窗口即可，系统不跟踪发布状态。
        </p>

        {/* 平台发布情况列表（可勾选：只对勾选的平台执行填表） */}
        <div className="mt-4">
          <div className="mb-1.5 flex items-center px-1 text-[12px] font-black uppercase tracking-tight text-[#64748B]">
            <span className="flex-1">目标平台</span>
            <span>状态</span>
          </div>
          <div className="space-y-2">
            {targets.map((t) => {
              const published = t.status === 'success';
              const on = published || selected.has(t.platform);
              const st = rowState(t, on);
              return (
                <label
                  key={`${t.platform}-${t.accountId}`}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-none border p-3 transition-colors',
                    st.color === 'green' && 'border-[#A7F3D0] bg-[#F0FDF4]',
                    st.color === 'blue' && 'border-[#BFDBFE] bg-[#EFF4FF]',
                    st.color === 'red' && 'border-[#FECACA] bg-[#FEF2F2]',
                    st.color === 'gray' && 'border-[#E2E8F0] bg-slate-50',
                    published && 'cursor-default',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={published || running}
                    onChange={() => toggle(t.platform)}
                    className="size-4 shrink-0 accent-[#0033A0]"
                  />
                  <img
                    src={PLATFORM_LOGOS[t.platform as keyof typeof PLATFORM_LOGOS]}
                    alt={PLATFORM_MAP[t.platform]?.name ?? t.platform}
                    className="h-5 w-5 shrink-0 rounded-none object-contain"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-bold text-[#1A1A1A]">
                      {PLATFORM_MAP[t.platform]?.name ?? t.platform}
                      <span className="ml-2 font-medium text-[#94A3B8]">{t.accountName}</span>
                    </p>
                    <p
                      title={st.msg}
                      className={cn(
                        'mt-0.5 truncate text-[11px] font-medium',
                        st.color === 'red' ? 'text-[#EF4444]' : 'text-slate-500',
                      )}
                    >
                      {truncateMsg(st.msg)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-sm px-2 py-1 text-[11px] font-bold',
                      badgeClass(st.color),
                    )}
                  >
                    {st.label}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="rounded-sm bg-slate-100 px-2 py-1 text-[12px] font-bold text-slate-600">
            已勾选 {selected.size} 个平台
          </span>
          {running && (
            <span className="text-[11px] font-medium text-[#0033A0]">正在打开浏览器填表，请稍候…</span>
          )}
        </div>

        {err && (
          <p className="mt-3 rounded-none border border-[#FECACA] bg-[#FEF2F2] p-3 text-[12px] font-medium text-[#EF4444]">
            {err}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          {!allPublished && (
            <Button
              type="button"
              variant="outline"
              className="rounded-none border-[#E2E8F0] text-[#475569] hover:bg-slate-100"
              onClick={onClose}
              disabled={running}
            >
              取消
            </Button>
          )}
          {allPublished ? (
            <Button
              type="button"
              className="rounded-none bg-[#0033A0] text-white hover:bg-[#00236E]"
              onClick={onClose}
            >
              知道了
            </Button>
          ) : (
            <Button
              type="button"
              className="rounded-none bg-[#0033A0] text-white hover:bg-[#00236E]"
              onClick={() => void run()}
              disabled={running || selected.size === 0}
            >
              {running ? '正在填表…' : result ? '重新填表' : '开始填表'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
