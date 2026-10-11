import { useRef, useState } from 'react';
import type { FC } from 'react';
import {
  Image as ImageIcon,
  PlaySquare,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { toast } from 'sonner';
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
import { createMaterial, uploadPublishFile } from '@client/src/api/social';
import type { MaterialGroup, MaterialType } from '@shared/api.interface';
import { captureVideoThumbnail } from '@client/src/utils/video-thumbnail';

interface UploadFileItem {
  id: string;
  file: File;
  type: MaterialType;
}

interface UploadMaterialDialogProps {
  open: boolean;
  onClose: () => void;
  groups: MaterialGroup[];
  onUploaded: () => void;
}

function detectType(file: File): MaterialType {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  return 'image';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const UploadMaterialDialog: FC<UploadMaterialDialogProps> = ({
  open,
  onClose,
  groups,
  onUploaded,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<UploadFileItem[]>([]);
  const [groupName, setGroupName] = useState<string>('');
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;
    const items: UploadFileItem[] = Array.from(selected).map(
      (file: File): UploadFileItem => ({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        type: detectType(file),
      }),
    );
    setFiles((prev: UploadFileItem[]): UploadFileItem[] => [...prev, ...items]);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleRemove = (id: string): void => {
    setFiles((prev: UploadFileItem[]): UploadFileItem[] =>
      prev.filter((item: UploadFileItem): boolean => item.id !== id),
    );
  };

  const handleUpload = async (): Promise<void> => {
    if (files.length === 0) {
      toast.warning('请先选择要上传的文件');
      return;
    }
    setUploading(true);
    try {
      for (const item of files) {
        // 视频上传时本地截帧，作为独立缩略图一并上传
        let thumb: File | null = null;
        if (item.type === 'video') {
          thumb = await captureVideoThumbnail(item.file);
        }
        const uploaded = await uploadPublishFile(
          item.file,
          'materials',
          undefined,
          thumb,
        );
        await createMaterial({
          name: item.file.name,
          type: item.type,
          filePath: uploaded.fileKey,
          fileUrl: uploaded.url,
          fileSize: item.file.size,
          groupName: groupName || null,
          width: null,
          height: null,
          thumbnailUrl: uploaded.thumbUrl ?? null,
        });
      }
      toast.success(`成功上传 ${files.length} 个文件`);
      onUploaded();
      setFiles([]);
      setGroupName('');
      onClose();
    } catch (error: unknown) {
      toast.error(`上传失败：${extractErrorMessage(error)}`);
    } finally {
      setUploading(false);
    }
  };

  const handleClose = (): void => {
    if (uploading) return;
    setFiles([]);
    setGroupName('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[560px] rounded-none border-t-[3px] border-t-[#0033A0] p-6 shadow-md">
        <DialogHeader className="pb-4">
          <DialogTitle className="text-lg font-bold text-[#1A1A1A]">
            上传素材
          </DialogTitle>
          <p className="text-[12px] font-medium text-slate-600">
            图片最大支持 20M，视频最大支持 200M
          </p>
        </DialogHeader>

        <div className="flex items-center justify-between gap-4">
          <Select value={groupName || ''} onValueChange={setGroupName}>
            <SelectTrigger className="w-[200px] rounded-none border-[#E2E8F0] text-sm">
              <SelectValue placeholder="全部分组" />
            </SelectTrigger>
            <SelectContent className="rounded-none">
              <SelectItem value="" className="text-sm">
                全部分组
              </SelectItem>
              {groups.map((g: MaterialGroup) => (
                <SelectItem key={g.name} value={g.name} className="text-sm">
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="rounded-sm bg-[#E8EEF9] px-1.5 py-0.5 text-[12px] font-bold text-[#0033A0]">
            文章素材
          </span>
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="mt-4 flex flex-col items-center justify-center gap-2 rounded-none border border-dashed border-[#E2E8F0] bg-[#F8FAFC] py-10 transition-colors hover:border-[#0033A0] hover:bg-[#EFF4FF] disabled:cursor-not-allowed"
        >
          <UploadCloud className="size-8 text-[#94A3B8]" />
          <span className="text-sm font-medium text-[#94A3B8]">
            点击上传素材
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          onChange={handleFileChange}
          className="hidden"
        />

        {files.length > 0 && (
          <div className="mt-4 max-h-[240px] space-y-2 overflow-y-auto">
            {files.map((item: UploadFileItem) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-none border border-[#E2E8F0] px-3 py-2"
              >
                {item.type === 'image' ? (
                  <ImageIcon className="size-5 shrink-0 text-[#3B82F6]" />
                ) : (
                  <PlaySquare className="size-5 shrink-0 text-[#F97316]" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#1A1A1A]">
                  {item.file.name}
                </span>
                <span className="shrink-0 text-[12px] font-medium text-[#94A3B8]">
                  {formatSize(item.file.size)}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemove(item.id)}
                  className="shrink-0 text-[#94A3B8] transition-colors hover:text-[#EF4444]"
                  aria-label="移除"
                  disabled={uploading}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={uploading}
            className="rounded-none border-[#E2E8F0]"
          >
            取消
          </Button>
          <Button
            onClick={() => void handleUpload()}
            disabled={uploading || files.length === 0}
            className="rounded-none bg-[#0033A0] hover:bg-[#002680]"
          >
            {uploading ? '上传中...' : '上传'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export default UploadMaterialDialog;
