import { useEffect, useMemo, useState } from 'react';
import type { FC } from 'react';
import { Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  addTopicTags,
  createTopicGroup,
  deleteTopicGroup,
  deleteTopicTag,
  listTopicLibrary,
  renameTopicGroup,
} from '@client/src/api/social';
import type { TopicGroup, TopicTag } from '@shared/api.interface';
import { resolveErrorMessage } from '../social-analytics/helpers';

interface TopicLibraryDialogProps {
  open: boolean;
  onClose: () => void;
  /** 当前发布表单已选话题（弹窗预选 + 应用时合并） */
  value: string[];
  onChange: (next: string[]) => void;
}

/**
 * 常用话题弹窗：分组管理 + 分组内标签（可单选/整组全选），
 * 应用时将选中话题合并进发布表单的话题胶囊。
 */
const TopicLibraryDialog: FC<TopicLibraryDialogProps> = ({
  open,
  onClose,
  value,
  onChange,
}) => {
  const [groups, setGroups] = useState<TopicGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  /** 弹窗内选中话题名集合 */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** 分组编辑弹窗状态：null 关闭；'new' 新建；{group} 编辑 */
  const [editing, setEditing] = useState<TopicGroup | 'new' | null>(null);

  const load = async (): Promise<void> => {
    setLoading(true);
    try {
      const lib = await listTopicLibrary();
      setGroups(lib.groups);
    } catch (e) {
      toast.error(`加载话题库失败：${resolveErrorMessage(e)}`);
    } finally {
      setLoading(false);
    }
  };

  // 打开时加载 + 预选当前已用且存在于库中的话题
  useEffect(() => {
    if (!open) return;
    void load();
    setKeyword('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const inLibrary = new Set<string>();
    for (const g of groups) for (const t of g.tags) inLibrary.add(t.name);
    setSelected(new Set(value.filter((t) => inLibrary.has(t))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, groups]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return groups;
    return groups
      .map((g): TopicGroup => ({
        ...g,
        tags: g.tags.filter((t) => t.name.toLowerCase().includes(kw)),
      }))
      .filter((g) => g.name.toLowerCase().includes(kw) || g.tags.length > 0);
  }, [groups, keyword]);

  const toggle = (name: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const allSelectedOf = (tags: TopicTag[]): boolean =>
    tags.length > 0 && tags.every((t) => selected.has(t.name));

  const toggleGroup = (tags: TopicTag[]): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      const all = allSelectedOf(tags);
      for (const t of tags) {
        if (all) next.delete(t.name);
        else next.add(t.name);
      }
      return next;
    });
  };

  const apply = (): void => {
    const merged = [...value];
    for (const t of selected) {
      if (!merged.includes(t)) merged.push(t);
    }
    onChange(merged.slice(0, 15));
    toast.success(`已应用 ${selected.size} 个话题`);
    onClose();
  };

  const removeGroup = async (g: TopicGroup): Promise<void> => {
    try {
      await deleteTopicGroup(g.id);
      setSelected((prev) => {
        const next = new Set(prev);
        for (const t of g.tags) next.delete(t.name);
        return next;
      });
      await load();
      toast.success(`已删除分组「${g.name}」`);
    } catch (e) {
      toast.error(`删除失败：${resolveErrorMessage(e)}`);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent
          className="w-[760px] max-w-[92vw] rounded-none border-t-[3px] border-t-[#0033A0] p-0 shadow-md"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">话题标签管理</DialogTitle>
          <div className="flex items-center justify-between gap-3 border-b border-[#E2E8F0] px-6 py-4">
            <div>
              <p className="text-lg font-bold text-[#1A1A1A]">话题标签管理</p>
              <p className="mt-0.5 text-[12px] font-medium text-[#94A3B8]">
                选择常用话题标签，并按分组快速应用。
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex size-7 items-center justify-center rounded-none text-[#475569] transition-colors hover:bg-slate-100"
              aria-label="关闭"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="px-6 pb-2 pt-4">
            <div className="flex items-center gap-2 rounded-none border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5">
              <Search className="size-4 shrink-0 text-[#94A3B8]" />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索分组或话题关键词..."
                className="w-full border-none bg-transparent text-sm outline-none placeholder:text-[#94A3B8]"
              />
            </div>
          </div>

          <div className="max-h-[380px] space-y-3 overflow-y-auto px-6 py-3">
            {loading ? (
              <p className="py-8 text-center text-sm text-[#94A3B8]">加载中…</p>
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-[#94A3B8]">
                暂无话题分组，点击左下角「新建分组」创建
              </p>
            ) : (
              filtered.map((g, idx) => (
                <div key={g.id} className="rounded-none border border-[#E2E8F0]">
                  <div className="flex items-center justify-between gap-2 border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-[#0033A0] font-mono text-[10px] font-bold text-white">
                        {idx + 1}
                      </span>
                      <span className="truncate text-sm font-bold text-[#1A1A1A]">{g.name}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing(g)}
                        className="flex size-6 items-center justify-center text-[#94A3B8] transition-colors hover:bg-slate-100 hover:text-[#0033A0]"
                        title="编辑分组"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeGroup(g)}
                        className="flex size-6 items-center justify-center text-[#94A3B8] transition-colors hover:bg-slate-100 hover:text-[#EF4444]"
                        title="删除分组"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="px-4 py-3">
                    {g.tags.length === 0 ? (
                      <p className="py-1 text-[12px] text-[#94A3B8]">暂无话题，点右上角编辑添加</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {g.tags.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => toggle(t.name)}
                            className={`rounded-sm px-2.5 py-1 text-[12px] font-bold transition-colors ${
                              selected.has(t.name)
                                ? 'bg-[#0033A0] text-white'
                                : 'bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0]'
                            }`}
                          >
                            #{t.name}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 flex items-center gap-1.5 border-t border-[#E2E8F0] pt-2.5">
                      <button
                        type="button"
                        onClick={() => toggleGroup(g.tags)}
                        disabled={g.tags.length === 0}
                        className="flex items-center gap-1.5 text-[12px] font-bold text-[#0033A0] disabled:opacity-40"
                      >
                        <span
                          className={`flex size-3.5 items-center justify-center rounded-sm border ${
                            allSelectedOf(g.tags)
                              ? 'border-[#0033A0] bg-[#0033A0]'
                              : 'border-[#94A3B8]'
                          }`}
                        >
                          {allSelectedOf(g.tags) && (
                            <span className="text-[8px] text-white">✓</span>
                          )}
                        </span>
                        {allSelectedOf(g.tags) ? '取消全选本组' : '已全选本组'}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-[#E2E8F0] px-6 py-4">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setEditing('new')}
                className="rounded-none border-[#0033A0] text-[#0033A0] hover:bg-[#EFF4FF]"
              >
                <Plus className="size-4" />
                新建分组
              </Button>
              <Button
                variant="outline"
                onClick={onClose}
                className="rounded-none border-[#E2E8F0] text-[#475569] hover:bg-slate-100"
              >
                取消
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[12px] font-bold text-[#0033A0]">
                已选 {selected.size} 个
              </span>
              <Button
                onClick={apply}
                className="rounded-none bg-[#0033A0] px-6 hover:bg-[#00236E]"
                >
                确定应用
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 新建/编辑分组弹窗 */}
      <TopicGroupEditor
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void load();
        }}
      />
    </>
  );
};

/** 编辑弹窗内标签条目：已有标签带 id（可删除）；新输入的无 id（保存时新增） */
interface TagDraft {
  id?: string;
  name: string;
}

/** 新建/编辑分组：分组名称 + 已有标签回显（可删除）+ 添加话题（回车/空格生成胶囊） */
function TopicGroupEditor({
  editing,
  onClose,
  onSaved,
}: {
  editing: TopicGroup | 'new' | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const open = editing !== null;
  const isEdit = editing !== null && editing !== 'new';
  const [name, setName] = useState('');
  const [tags, setTags] = useState<TagDraft[]>([]);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (isEdit && editing !== 'new') {
        setName(editing.name);
        setTags(editing.tags.map((t) => ({ id: t.id, name: t.name })));
      } else {
        setName('');
        setTags([]);
      }
      setDraft('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const addDraft = (raw: string): void => {
    const t = raw.trim().replace(/^#+/, '');
    if (!t) return;
    if (!tags.some((x) => x.name === t)) setTags((prev) => [...prev, { name: t }]);
    setDraft('');
  };

  const removeTag = (tag: TagDraft): void => {
    setTags((prev) => prev.filter((x) => x !== tag));
  };

  const save = async (): Promise<void> => {
    if (!name.trim()) {
      toast.warning('请填写分组名称');
      return;
    }
    setSaving(true);
    try {
      if (isEdit && editing !== 'new') {
        // 重命名
        if (name.trim() !== editing.name) {
          await renameTopicGroup(editing.id, name.trim());
        }
        // 补充新增标签
        const added = tags.filter((t) => !t.id).map((t) => t.name);
        if (added.length > 0) {
          await addTopicTags(editing.id, added);
        }
        // 删除勾掉的已有标签
        const keepIds = new Set(tags.filter((t) => t.id).map((t) => t.id!));
        for (const old of editing.tags) {
          if (!keepIds.has(old.id)) await deleteTopicTag(old.id);
        }
      } else {
        const group = await createTopicGroup(name.trim());
        const added = tags.map((t) => t.name);
        if (added.length > 0) {
          await addTopicTags(group.id, added);
        }
      }
      toast.success(isEdit ? '分组已更新' : '分组已创建');
      onSaved();
    } catch (e) {
      toast.error(`保存失败：${resolveErrorMessage(e)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="w-[460px] rounded-none border-t-[3px] border-t-[#0033A0] p-6 shadow-md">
        <DialogTitle className="text-lg font-bold text-[#1A1A1A]">
          {isEdit ? '编辑分组' : '新建分组'}
        </DialogTitle>
        <p className="mt-0.5 text-[12px] font-medium text-[#94A3B8]">
          {isEdit ? '修改分组名称或补充话题标签' : '创建一个新的话题集合'}
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-[12px] font-bold text-[#475569]">
              分组名称 *
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：热门话题"
              className="w-full rounded-none border border-[#E2E8F0] bg-white px-3 py-2 text-sm outline-none focus:border-[#0033A0]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-bold text-[#475569]">
              添加话题/标签
            </label>
            <div className="flex w-full flex-wrap items-center gap-1.5 rounded-none border border-[#E2E8F0] bg-white px-2 py-1.5 text-sm focus-within:border-[#0033A0]">
              {tags.map((t) => (
                <span
                  key={t.id ?? `new-${t.name}`}
                  className="flex items-center gap-1 rounded-sm bg-[#EFF4FF] px-2 py-0.5 text-[12px] font-bold text-[#0033A0]"
                >
                  #{t.name}
                  <button
                    type="button"
                    onClick={() => removeTag(t)}
                    className="opacity-60 transition-opacity hover:opacity-100"
                    aria-label={`删除话题 ${t.name}`}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    addDraft(draft);
                  }
                }}
                placeholder="输入话题关键词..."
                className="min-w-[120px] flex-1 border-none bg-transparent px-1 py-1 text-sm outline-none placeholder:text-[#94A3B8]"
              />
            </div>
            <p className="mt-1 text-[11px] font-medium text-[#94A3B8]">
              已有话题可直接点 × 删除，输入关键词后按回车或空格添加
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="rounded-none border-[#E2E8F0]">
            取消
          </Button>
          <Button
            onClick={() => void save()}
            disabled={saving}
            className="rounded-none bg-[#0033A0] hover:bg-[#00236E]"
          >
            {saving ? '保存中…' : '保存修改'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default TopicLibraryDialog;
