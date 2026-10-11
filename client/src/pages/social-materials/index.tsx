import { useEffect, useMemo, useState } from 'react';
import type { FC } from 'react';
import {
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Download,
  FolderDown,
  Image as ImageIcon,
  ImagePlus,
  PlaySquare,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  batchDeleteMaterials,
  batchMoveMaterials,
  createMaterialGroup,
  deleteMaterialGroup,
  listMaterialGroups,
  listMaterials,
  renameMaterialGroup,
} from '@client/src/api/social';
import type {
  MaterialGroup,
  MaterialItem,
  MaterialType,
} from '@shared/api.interface';
import GroupSidebar from './group-sidebar';
import UploadMaterialDialog from './upload-dialog';
import MaterialCardMenu from './material-card-menu';
import { showConfirm } from '@lark-apaas/client-toolkit';
import { Image } from '@client/src/components/ui/image';
import VideoThumbnail from '@/components/VideoThumbnail';

const TYPE_FILTERS: { value: 'all' | MaterialType; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'image', label: '图片' },
  { value: 'video', label: '视频' },
];

const SocialMaterials: FC = () => {
  const [groups, setGroups] = useState<MaterialGroup[]>([]);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'all' | MaterialType>('all');
  const [activeGroup, setActiveGroup] = useState('');
  const [keyword, setKeyword] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [uploadOpen, setUploadOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [total, setTotal] = useState(0);
  const [batchMode, setBatchMode] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [targetGroup, setTargetGroup] = useState('');
  const [moving, setMoving] = useState(false);
  const [preview, setPreview] = useState<MaterialItem | null>(null);
  const [previewList, setPreviewList] = useState<MaterialItem[]>([]);

  const openPreview = (item: MaterialItem): void => {
    // 同类型素材组成预览列表，便于左右切换
    const list = materials.filter((m: MaterialItem): boolean => m.type === item.type);
    setPreviewList(list);
    setPreview(item);
  };

  const movePreview = (dir: 1 | -1): void => {
    if (!preview) return;
    const idx = previewList.findIndex((m: MaterialItem): boolean => m.id === preview.id);
    if (idx < 0) return;
    const next = previewList[(idx + dir + previewList.length) % previewList.length];
    setPreview(next);
  };

  const loadData = async (): Promise<void> => {
    setLoading(true);
    try {
      const [groupResult, materialResult] = await Promise.all([
        listMaterialGroups(),
        listMaterials({
          type: typeFilter === 'all' ? undefined : typeFilter,
          group: activeGroup || undefined,
          keyword: keyword || undefined,
          page,
          pageSize,
        }),
      ]);
      setGroups(groupResult);
      setMaterials(materialResult.items);
      setTotal(materialResult.total);
    } catch (error: unknown) {
      toast.error(
        `加载失败：${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [typeFilter, activeGroup, keyword]);

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, activeGroup, keyword, page, pageSize]);

  const handleSelectGroup = (group: string): void => {
    setActiveGroup(group);
    setSelectedIds(new Set());
  };

  const handleCreateGroup = async (name: string): Promise<void> => {
    await createMaterialGroup(name);
    const result = await listMaterialGroups();
    setGroups(result);
  };

  const handleRenameGroup = async (
    oldName: string,
    newName: string,
  ): Promise<void> => {
    await renameMaterialGroup(oldName, newName);
    const result = await listMaterialGroups();
    setGroups(result);
    if (activeGroup === oldName) {
      setActiveGroup(newName);
    }
  };

  const handleDeleteGroup = async (name: string): Promise<void> => {
    await deleteMaterialGroup(name);
    const result = await listMaterialGroups();
    setGroups(result);
    if (activeGroup === name) {
      setActiveGroup('');
    }
  };

  const handleToggleSelect = (id: string): void => {
    setSelectedIds((prev: Set<string>): Set<string> => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleBatchDelete = async (): Promise<void> => {
    if (selectedIds.size === 0) return;
    if (!await showConfirm(`确定删除选中的 ${selectedIds.size} 个素材？`)) return;
    try {
      await batchDeleteMaterials({ ids: Array.from(selectedIds) });
      toast.success(`已删除 ${selectedIds.size} 个素材`);
      setSelectedIds(new Set());
      await loadData();
    } catch (error: unknown) {
      toast.error(
        `删除失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const handleBatchDownload = (): void => {
    const targets = materials.filter((m: MaterialItem) =>
      selectedIds.has(m.id),
    );
    if (targets.length === 0) return;
    targets.forEach((item: MaterialItem, index: number): void => {
      setTimeout((): void => {
        const a = document.createElement('a');
        a.href = item.fileUrl;
        a.download = item.name;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }, index * 200);
    });
    toast.success(`已开始下载 ${targets.length} 个素材`);
  };

  const handleBatchMove = async (): Promise<void> => {
    if (!targetGroup) {
      toast.warning('请选择目标分组');
      return;
    }
    setMoving(true);
    try {
      await batchMoveMaterials({
        ids: Array.from(selectedIds),
        groupName: targetGroup === '__none__' ? null : targetGroup,
      });
      toast.success(`已移动 ${selectedIds.size} 个素材`);
      setTargetGroup('');
      setMoveOpen(false);
      setSelectedIds(new Set());
      await loadData();
    } catch (error: unknown) {
      toast.error(
        `移动失败：${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setMoving(false);
    }
  };

  const handleToggleBatchMode = (): void => {
    setBatchMode((prev: boolean): boolean => {
      if (prev) setSelectedIds(new Set());
      return !prev;
    });
  };

  const selectedCount = selectedIds.size;

  return (
    <div className="flex min-h-0">
      <GroupSidebar
        groups={groups}
        activeGroup={activeGroup}
        onSelectGroup={handleSelectGroup}
        onCreateGroup={handleCreateGroup}
        onRenameGroup={handleRenameGroup}
        onDeleteGroup={handleDeleteGroup}
      />
      <div className="min-w-0 flex-1">
        <div className="sticky top-14 z-10 border-b border-[#E2E8F0] bg-white px-8 py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2" />
              <div className="flex items-center gap-2">
                {batchMode && selectedCount > 0 && (
                  <>
                    <Button
                      variant="outline"
                      onClick={handleBatchDownload}
                      className="rounded-none border-[#E2E8F0] text-[#475569] hover:bg-slate-50 hover:text-[#0033A0]"
                    >
                      <Download className="mr-1 size-3.5" />
                      下载
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setTargetGroup('__none__');
                        setMoveOpen(true);
                      }}
                      className="rounded-none border-[#E2E8F0] text-[#475569] hover:bg-slate-50 hover:text-[#0033A0]"
                    >
                      <FolderDown className="mr-1 size-3.5" />
                      移动至分组
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => void handleBatchDelete()}
                      className="rounded-none border-[#E2E8F0] text-[#EF4444] hover:bg-[#FEF2F2] hover:text-[#EF4444]"
                    >
                      <Trash2 className="mr-1 size-3.5" />
                      删除 {selectedCount}
                    </Button>
                  </>
                )}
                <Button
                  variant={batchMode ? 'default' : 'outline'}
                  onClick={handleToggleBatchMode}
                  className={
                    batchMode
                      ? 'rounded-none bg-[#0033A0] hover:bg-[#002680]'
                      : 'rounded-none border-[#E2E8F0] text-[#475569] hover:bg-slate-50 hover:text-[#0033A0]'
                  }
                >
                  <CheckSquare className="mr-1 size-3.5" />
                  {batchMode ? '退出批量' : '批量操作'}
                </Button>
                <Button
                  onClick={() => setUploadOpen(true)}
                  className="rounded-none bg-[#0033A0] hover:bg-[#002680]"
                >
                  <Upload className="mr-1.5 size-4" />
                  上传素材
                </Button>
              </div>
            </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="flex rounded-none border border-[#E2E8F0]">
              {TYPE_FILTERS.map(
                (item: { value: 'all' | MaterialType; label: string }) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setTypeFilter(item.value)}
                    className={`px-3 py-1.5 text-sm transition-colors ${
                      typeFilter === item.value
                        ? 'bg-[#EFF4FF] font-semibold text-[#0033A0]'
                        : 'font-medium text-[#475569] hover:bg-slate-100'
                    }`}
                  >
                    {item.label}
                  </button>
                ),
              )}
            </div>
            <div className="relative ml-auto w-64">
              <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-[#94A3B8]" />
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索素材名称"
                className="h-8 rounded-none border-[#E2E8F0] pl-7 pr-2 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="px-8 pb-20 pt-6">
          {materials.length === 0 && !loading ? (
            <div className="rounded-none border-t-[3px] border-t-[#0033A0] bg-white p-6 shadow-md">
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <ImagePlus className="h-10 w-10 text-[#94A3B8]" />
                <p className="text-sm font-bold text-[#1A1A1A]">暂无素材</p>
                <p className="text-[12px] font-medium text-slate-600">
                  上传图片或视频素材，在创作内容时可直接引用
                </p>
                <Button
                  onClick={() => setUploadOpen(true)}
                  className="mt-2 rounded-none bg-[#0033A0] hover:bg-[#002680]"
                >
                  <Upload className="mr-1.5 size-4" />
                  上传素材
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {materials.map((item: MaterialItem) => (
                <div
                  key={item.id}
                  onClick={
                    batchMode
                      ? (): void => handleToggleSelect(item.id)
                      : (): void => openPreview(item)
                  }
                  className={`group relative overflow-hidden rounded-none border border-[#E2E8F0] bg-white transition-colors hover:border-[#0033A0] ${
                    selectedIds.has(item.id) ? 'border-[#0033A0]' : ''
                  } ${batchMode ? 'cursor-pointer' : 'cursor-pointer'}`}
                >
                  {batchMode && (
                    <span
                      className={`absolute left-2 top-2 z-10 flex size-5 items-center justify-center rounded-none border transition-colors ${
                        selectedIds.has(item.id)
                          ? 'border-[#0033A0] bg-[#0033A0] text-white'
                          : 'border-[#94A3B8] bg-white/80 text-transparent'
                      }`}
                    >
                      <Check className="size-3.5" />
                    </span>
                  )}
                  {!batchMode && (
                    <MaterialCardMenu
                      item={item}
                      groups={groups}
                      onChanged={() => {
                        void loadData();
                      }}
                    />
                  )}
                  <div className="flex aspect-square items-center justify-center bg-[#F8FAFC]">
                    {item.type === 'image' ? (
                      <Image
                        src={item.fileUrl}
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <VideoThumbnail
                        src={item.fileUrl}
                        fallbackIconSize="size-12"
                        className="h-full w-full rounded-none border-0 bg-[#F8FAFC]"
                      />
                    )}
                  </div>
                  <div className="border-t border-[#E2E8F0] p-2">
                    <div className="flex items-center gap-1.5">
                      {item.type === 'image' ? (
                        <ImageIcon className="size-3.5 shrink-0 text-[#0033A0]" />
                      ) : (
                        <PlaySquare className="size-3.5 shrink-0 text-[#0033A0]" />
                      )}
                      <p className="min-w-0 flex-1 truncate text-xs font-medium text-[#1A1A1A]">
                        {item.name}
                      </p>
                    </div>
                    <p className="mt-1 text-[10px] font-medium text-[#94A3B8]">
                      {item.groupName || '未分组'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {total > 0 && (
            <div className="mt-6 flex items-center justify-between rounded-none border border-[#E2E8F0] bg-white px-4 py-3">
              <span className="text-sm font-medium text-[#475569]">
                共 <span className="font-bold text-[#1A1A1A]">{total}</span> 条素材
              </span>
              <div className="flex items-center gap-2">
                <select
                  value={pageSize}
                  onChange={(e): void => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="h-8 cursor-pointer rounded-none border border-[#E2E8F0] px-2 text-sm font-medium text-[#475569] focus:outline-none"
                >
                  {[12, 24, 36, 60].map((size: number) => (
                    <option key={size} value={size}>
                      {size} 条/页
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setPage((p: number): number => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="flex h-8 items-center gap-1 rounded-none border border-[#E2E8F0] px-2 text-sm font-medium text-[#475569] transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft className="size-3.5" />
                  上一页
                </button>
                <span className="min-w-[48px] text-center text-sm font-medium text-[#475569]">
                  {page} / {Math.max(1, Math.ceil(total / pageSize))}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPage((p: number): number =>
                      Math.min(Math.ceil(total / pageSize), p + 1),
                    )
                  }
                  disabled={page >= Math.ceil(total / pageSize)}
                  className="flex h-8 items-center gap-1 rounded-none border border-[#E2E8F0] px-2 text-sm font-medium text-[#475569] transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  下一页
                  <ChevronRight className="size-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <UploadMaterialDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        groups={groups}
        onUploaded={() => {
          void loadData();
        }}
      />

      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent className="w-[380px] rounded-none border-t-[3px] border-t-[#0033A0] p-6 shadow-md">
          <DialogHeader className="pb-4">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-[#1A1A1A]">
              <FolderDown className="size-5 text-[#0033A0]" />
              移动 {selectedCount} 个素材至分组
            </DialogTitle>
          </DialogHeader>
          <Select value={targetGroup} onValueChange={setTargetGroup}>
            <SelectTrigger className="h-9 w-full rounded-none border-[#E2E8F0] text-sm">
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
              onClick={() => void handleBatchMove()}
              disabled={moving || !targetGroup}
              className="rounded-none bg-[#0033A0] hover:bg-[#002680]"
            >
              {moving ? '移动中...' : '确定'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 素材预览弹窗：图片放大 / 视频内嵌播放，同类型素材支持左右切换 */}
      <Dialog open={preview !== null} onOpenChange={(o) => { if (!o) setPreview(null); }}>
        <DialogContent
          className="w-[860px] max-w-[92vw] overflow-hidden rounded-none border-t-[3px] border-t-[#0033A0] p-0 shadow-md"
          showCloseButton={false}
        >
          <div className="relative flex min-h-[420px] items-center justify-center bg-[#0F172A] p-6">
            {preview?.type === 'image' ? (
              <img
                src={preview.fileUrl}
                alt={preview.name}
                className="max-h-[65vh] max-w-full object-contain"
              />
            ) : (
              <video
                key={preview?.id}
                src={preview?.fileUrl}
                controls
                autoPlay
                className="max-h-[65vh] max-w-full"
              />
            )}

            {previewList.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => movePreview(-1)}
                  className="absolute left-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white transition-colors hover:bg-black/60"
                  aria-label="上一个"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={() => movePreview(1)}
                  className="absolute right-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white transition-colors hover:bg-black/60"
                  aria-label="下一个"
                >
                  <ChevronRight className="size-5" />
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => setPreview(null)}
              className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/60"
              aria-label="关闭预览"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-[#E2E8F0] px-6 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-[#1A1A1A]">
                {preview?.name}
              </p>
              <p className="mt-0.5 text-[12px] font-medium text-[#94A3B8]">
                {preview?.groupName || '未分组'}
              </p>
            </div>
            {previewList.length > 1 && (
              <span className="shrink-0 text-[12px] font-bold text-[#94A3B8]">
                {previewList.findIndex((m) => m.id === preview?.id) + 1} /{' '}
                {previewList.length}
              </span>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SocialMaterials;
