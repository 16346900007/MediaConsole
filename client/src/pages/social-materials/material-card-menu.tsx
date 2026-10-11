import { useState } from 'react';
import type { FC } from 'react';
import {
  Download,
  FolderDown,
  MoreVertical,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { batchMoveMaterials, deleteMaterial } from '@client/src/api/social';
import type { MaterialGroup, MaterialItem } from '@shared/api.interface';
import { showConfirm } from '@lark-apaas/client-toolkit';
import { downloadFileByBlob } from '@client/src/utils/download-file';

interface MaterialCardMenuProps {
  item: MaterialItem;
  groups: MaterialGroup[];
  onChanged: () => void;
  onDownloadProgress?: (pct: number) => void;
}

const MaterialCardMenu: FC<MaterialCardMenuProps> = ({
  item,
  groups,
  onChanged,
  onDownloadProgress,
}) => {
  const [moveOpen, setMoveOpen] = useState(false);
  const [targetGroup, setTargetGroup] = useState<string>('');
  const [moving, setMoving] = useState(false);

  const handleDownload = async (): Promise<void> => {
    try {
      await downloadFileByBlob(item.fileUrl, item.name, onDownloadProgress);
    } catch (error: unknown) {
      toast.error(
        `下载失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!await showConfirm(`确定删除素材「${item.name}」？`)) return;
    try {
      await deleteMaterial(item.id);
      toast.success('删除成功');
      onChanged();
    } catch (error: unknown) {
      toast.error(
        `删除失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const handleMove = async (): Promise<void> => {
    if (!targetGroup) {
      toast.warning('请选择目标分组');
      return;
    }
    setMoving(true);
    try {
      await batchMoveMaterials({
        ids: [item.id],
        groupName: targetGroup === '__none__' ? null : targetGroup,
      });
      toast.success('移动成功');
      setTargetGroup('');
      setMoveOpen(false);
      onChanged();
    } catch (error: unknown) {
      toast.error(
        `移动失败：${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setMoving(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={(e): void => {
              e.stopPropagation();
            }}
            className="absolute right-2 top-2 z-10 flex size-6 items-center justify-center rounded-none border border-white/50 bg-white/80 text-[#475569] opacity-0 transition-opacity hover:bg-white hover:text-[#0033A0] group-hover:opacity-100"
            aria-label="更多操作"
          >
            <MoreVertical className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-36 rounded-none border border-[#E2E8F0] p-1 shadow-md"
          onClick={(e): void => e.stopPropagation()}
        >
          <DropdownMenuItem
            onClick={() => handleDownload()}
            className="flex cursor-pointer items-center gap-2 rounded-none px-2 py-1.5 text-sm font-medium text-[#1A1A1A] hover:bg-[#EFF4FF] hover:text-[#0033A0]"
          >
            <Download className="size-3.5" />
            下载
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setTargetGroup(item.groupName ?? '__none__');
              setMoveOpen(true);
            }}
            className="flex cursor-pointer items-center gap-2 rounded-none px-2 py-1.5 text-sm font-medium text-[#1A1A1A] hover:bg-[#EFF4FF] hover:text-[#0033A0]"
          >
            <FolderDown className="size-3.5" />
            移动至分组
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => void handleDelete()}
            className="flex cursor-pointer items-center gap-2 rounded-none px-2 py-1.5 text-sm font-medium text-[#EF4444] hover:bg-[#FEF2F2]"
          >
            <Trash2 className="size-3.5" />
            删除素材
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent className="w-[380px] rounded-none border-t-[3px] border-t-[#0033A0] p-6 shadow-md">
          <DialogHeader className="pb-4">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-[#1A1A1A]">
              <FolderDown className="size-5 text-[#0033A0]" />
              移动至分组
            </DialogTitle>
          </DialogHeader>
          <Select value={targetGroup} onValueChange={setTargetGroup}>
            <SelectTrigger className="h-9 rounded-none border-[#E2E8F0] text-sm">
              <SelectValue placeholder="选择目标分组" />
            </SelectTrigger>
            <SelectContent className="rounded-none">
              <SelectItem value="__none__" className="text-sm">
                未分组
              </SelectItem>
              {groups.map((g: MaterialGroup) => (
                <SelectItem key={g.name} value={g.name} className="text-sm">
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="mt-5 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setMoveOpen(false)}
              className="rounded-none border-[#E2E8F0]"
            >
              取消
            </Button>
            <Button
              onClick={() => void handleMove()}
              disabled={moving || !targetGroup}
              className="rounded-none bg-[#0033A0] hover:bg-[#002680]"
            >
              {moving ? '移动中...' : '确定'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default MaterialCardMenu;
