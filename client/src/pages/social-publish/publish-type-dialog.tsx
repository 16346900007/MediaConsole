import { Video, Image as ImageIcon, FileText } from 'lucide-react';
import { PLATFORM_MAP, PUBLISH_TYPE_LABELS, PUBLISH_TYPE_PLATFORMS, type PublishType } from '@shared/platforms';
import { PLATFORM_LOGOS } from '@/utils/platform-logos';
import { cn } from '@/lib/utils';

interface Props {
  onSelect: (type: PublishType) => void;
  onClose: () => void;
}

const TYPE_ICONS: Record<PublishType, typeof Video> = {
  video: Video,
  image: ImageIcon,
  article: FileText,
};

/** 新建发布 → 选择发布类型弹窗（按支持矩阵过滤平台，不支持的平台不展示） */
export default function PublishTypeDialog({ onSelect, onClose }: Props) {
  const types = Object.keys(PUBLISH_TYPE_PLATFORMS) as PublishType[];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-[640px] rounded-none border-t-[3px] border-t-[#0033A0] bg-white shadow-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="mb-1 text-[12px] font-black uppercase tracking-[0.15em] text-[#0033A0]">
              选择发布类型
            </p>
            <p className="text-[10px] font-medium text-[#94A3B8]">
              CHOOSE PUBLISH TYPE · 仅展示该类型支持的平台
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#94A3B8] transition-colors hover:text-[#1A1A1A]"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {types.map((type) => {
            const Icon = TYPE_ICONS[type];
            const platforms = PUBLISH_TYPE_PLATFORMS[type];
            return (
              <button
                key={type}
                type="button"
                onClick={() => onSelect(type)}
                className="group flex flex-col items-start gap-3 rounded-none border border-[#E2E8F0] p-5 text-left transition-colors hover:border-[#0033A0] hover:bg-[#EFF4FF]"
              >
                <span className="flex size-10 items-center justify-center rounded-none bg-[#EFF4FF] text-[#0033A0]">
                  <Icon className="size-5" />
                </span>
                <span className="text-sm font-bold text-[#1A1A1A]">
                  {PUBLISH_TYPE_LABELS[type]}
                </span>
                <span className="text-[10px] font-medium text-[#94A3B8]">
                  支持平台（{platforms.length}）
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {platforms.map((p) => (
                    <img
                      key={p}
                      src={PLATFORM_LOGOS[p as keyof typeof PLATFORM_LOGOS]}
                      alt={PLATFORM_MAP[p]?.name}
                      title={PLATFORM_MAP[p]?.name}
                      className={cn(
                        'size-7 rounded-none object-contain',
                        'bg-[#F1F5F9] p-0.5',
                      )}
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
