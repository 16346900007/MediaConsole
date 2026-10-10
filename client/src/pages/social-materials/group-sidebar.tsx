import { useState } from 'react';
import type { FC } from 'react';
import {
  FolderPlus,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { showConfirm } from '@lark-apaas/client-toolkit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { MaterialGroup } from '@shared/api.interface';

interface GroupSidebarProps {
  groups: MaterialGroup[];
  activeGroup: string;
  onSelectGroup: (group: string) => void;
  onCreateGroup: (name: string) => Promise<void>;
  onRenameGroup: (oldName: string, newName: string) => Promise<void>;
  onDeleteGroup: (name: string) => Promise<void>;
}

const GroupSidebar: FC<GroupSidebarProps> = ({
  groups,
  activeGroup,
  onSelectGroup,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
}) => {
  const [searchKeyword, setSearchKeyword] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [creating, setCreating] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<string>('');
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);

  const filteredGroups = groups.filter((g: MaterialGroup): boolean =>
    g.name.toLowerCase().includes(searchKeyword.toLowerCase()),
  );

  const handleCreate = async (): Promise<void> => {
    if (!newGroupName.trim()) {
      toast.warning('请输入分组名称');
      return;
    }
    setCreating(true);
    try {
      await onCreateGroup(newGroupName.trim());
      toast.success('分组创建成功');
      setNewGroupName('');
      setCreateOpen(false);
    } catch (error: unknown) {
      toast.error(
        `创建失败：${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setCreating(false);
    }
  };

  const openRename = (name: string): void => {
    setRenameTarget(name);
    setRenameValue(name);
    setRenameOpen(true);
  };

  const handleRename = async (): Promise<void> => {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      toast.warning('请输入分组名称');
      return;
    }
    if (trimmed === renameTarget) {
      setRenameOpen(false);
      return;
    }
    setRenaming(true);
    try {
      await onRenameGroup(renameTarget, trimmed);
      toast.success('分组已重命名');
      setRenameOpen(false);
    } catch (error: unknown) {
      toast.error(
        `重命名失败：${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setRenaming(false);
    }
  };

  const handleDelete = async (name: string): Promise<void> => {
    if (!await showConfirm(`确定删除分组「${name}」？分组下的素材将移至未分组。`)) return;
    try {
      await onDeleteGroup(name);
      toast.success('分组已删除');
    } catch (error: unknown) {
      toast.error(
        `删除失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  return (
    <>
      <aside className="sticky top-14 flex h-[calc(100vh-3.5rem)] w-56 shrink-0 flex-col border-r border-[#E2E8F0] bg-white py-4">
        <div className="flex items-center justify-between px-4">
          <span className="text-sm font-bold text-[#1A1A1A]">分组</span>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="text-[#0033A0] transition-colors hover:text-[#002680]"
            aria-label="新建分组"
          >
            <Plus className="size-4" />
          </button>
        </div>
        <div className="mt-3 px-4">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-[#94A3B8]" />
            <Input
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="搜索分组名称"
              className="h-8 rounded-none border-[#E2E8F0] pl-7 pr-2 text-sm"
            />
          </div>
        </div>
        <nav className="mt-2 flex flex-1 flex-col gap-0.5 overflow-y-auto px-2">
          <button
            type="button"
            onClick={() => onSelectGroup('')}
            className={`flex items-center justify-between rounded-sm px-2 py-1.5 text-sm transition-colors ${
              activeGroup === ''
                ? 'bg-[#EFF4FF] font-semibold text-[#0033A0]'
                : 'font-medium text-[#475569] hover:bg-slate-100'
            }`}
          >
            <span className="truncate">全部分组</span>
          </button>
          {filteredGroups.map((group: MaterialGroup) => (
            <div
              key={group.name}
              className="group/item relative"
            >
              <button
                type="button"
                onClick={() => onSelectGroup(group.name)}
                className={`flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm transition-colors ${
                  activeGroup === group.name
                    ? 'bg-[#EFF4FF] font-semibold text-[#0033A0]'
                    : 'font-medium text-[#475569] hover:bg-slate-100'
                }`}
              >
              <span className="min-w-0 flex-1 truncate text-left">
                {group.name}
              </span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    onClick={(e): void => e.stopPropagation()}
                    className="absolute right-1 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center text-[#94A3B8] opacity-0 transition-opacity hover:text-[#0033A0] group-hover/item:opacity-100"
                    aria-label="更多操作"
                  >
                    <svg className="size-3" viewBox="0 0 12 12" fill="currentColor">
                      <circle cx="2" cy="6" r="1.2" />
                      <circle cx="6" cy="6" r="1.2" />
                      <circle cx="10" cy="6" r="1.2" />
                    </svg>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-32 rounded-none border border-[#E2E8F0] p-1 shadow-md"
                  onClick={(e): void => e.stopPropagation()}
                >
                  <DropdownMenuItem
                    onClick={() => openRename(group.name)}
                    className="flex cursor-pointer items-center gap-2 rounded-none px-2 py-1.5 text-sm font-medium text-[#1A1A1A] hover:bg-[#EFF4FF] hover:text-[#0033A0]"
                  >
                    <Pencil className="size-3.5" />
                    重命名
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => void handleDelete(group.name)}
                    className="flex cursor-pointer items-center gap-2 rounded-none px-2 py-1.5 text-sm font-medium text-[#EF4444] hover:bg-[#FEF2F2]"
                  >
                    <Trash2 className="size-3.5" />
                    删除分组
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
          {filteredGroups.length === 0 && searchKeyword && (
            <p className="px-2 py-3 text-center text-[12px] font-medium text-[#94A3B8]">
              未找到匹配分组
            </p>
          )}
        </nav>
      </aside>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="w-[380px] rounded-none border-t-[3px] border-t-[#0033A0] p-6 shadow-md">
          <DialogHeader className="pb-4">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-[#1A1A1A]">
              <FolderPlus className="size-5 text-[#0033A0]" />
              新建分组
            </DialogTitle>
          </DialogHeader>
          <Input
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="请输入分组名称"
            className="h-9 rounded-none border-[#E2E8F0] text-sm"
            onKeyDown={(e): void => {
              if (e.key === 'Enter') void handleCreate();
            }}
          />
          <div className="mt-5 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              className="rounded-none border-[#E2E8F0]"
            >
              取消
            </Button>
            <Button
              onClick={() => void handleCreate()}
              disabled={creating || !newGroupName.trim()}
              className="rounded-none bg-[#0033A0] hover:bg-[#002680]"
            >
              {creating ? '创建中...' : '创建'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="w-[380px] rounded-none border-t-[3px] border-t-[#0033A0] p-6 shadow-md">
          <DialogHeader className="pb-4">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-[#1A1A1A]">
              <Pencil className="size-5 text-[#0033A0]" />
              重命名分组
            </DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="请输入新名称"
            className="h-9 rounded-none border-[#E2E8F0] text-sm"
            onKeyDown={(e): void => {
              if (e.key === 'Enter') void handleRename();
            }}
          />
          <div className="mt-5 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setRenameOpen(false)}
              className="rounded-none border-[#E2E8F0]"
            >
              取消
            </Button>
            <Button
              onClick={() => void handleRename()}
              disabled={renaming || !renameValue.trim()}
              className="rounded-none bg-[#0033A0] hover:bg-[#002680]"
            >
              {renaming ? '保存中...' : '保存'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default GroupSidebar;
