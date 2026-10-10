import { useState } from 'react';
import type { FC } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PLATFORMS } from '@shared/platforms';
import type { PlatformMeta } from '@shared/platforms';
import { PLATFORM_LOGOS } from '@/utils/platform-logos';
import { startBrowserAuth } from '@client/src/api/social';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Image } from '@client/src/components/ui/image';

interface PlatformAuthDialogProps {
  open: boolean;
  onClose: () => void;
  onAuthorize: (platform: PlatformMeta) => Promise<void>;
}

/** 全部平台走浏览器授权（个人号免资质）：后端拉起本机 Edge 打开授权页登录 */
const OAUTH_PLATFORMS = new Set<string>(
  PLATFORMS.map((p) => p.value),
);

const PlatformAuthDialog: FC<PlatformAuthDialogProps> = ({
  open,
  onClose,
  onAuthorize,
}) => {
  const [authorizing, setAuthorizing] = useState<PlatformMeta | null>(null);

  const handlePlatformClick = async (
    platform: PlatformMeta,
  ): Promise<void> => {
    setAuthorizing(platform);
    try {
      if (OAUTH_PLATFORMS.has(platform.value)) {
        // 浏览器授权（个人号）：后端拉起本机 Edge 登录窗口 → 父级轮询等待登录态落库
        const result = await startBrowserAuth({ platform: platform.value });
        if (!result.ok) {
          toast.error(result.message ?? `「${platform.name}」授权启动失败`);
          return;
        }
        toast.info(result.message ?? '已打开登录窗口，请在弹出的窗口中完成登录');
        void onAuthorize(platform);
        return;
      }

      // 占位授权：打开创作后台 + 添加占位账号
      window.open(platform.creatorUrl, '_blank');
      await onAuthorize(platform);
      onClose();
    } catch (e) {
      // 后端 400/500 等异常：把后端返回的错误信息展示给用户，避免“点击没反应”
      const err = e as {
        response?: { data?: { message?: string | string[] } };
        message?: string;
      };
      const raw = err?.response?.data?.message ?? err?.message;
      const msg = Array.isArray(raw) ? raw[0] : raw;
      toast.error(msg ?? `「${platform.name}」授权启动失败`);
    } finally {
      setAuthorizing(null);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen: boolean) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <DialogContent className="rounded-none border border-[#E2E8F0] border-t-[3px] border-t-[#0033A0] p-6 sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-base font-bold tracking-tight text-[#1E293B]">
            授权账号
          </DialogTitle>
          <DialogDescription className="text-[12px] font-medium text-slate-600">
            选择要授权的平台，将在新窗口打开该平台授权页
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 grid grid-cols-4 gap-3">
          {PLATFORMS.map((platform: PlatformMeta) => (
            <button
              key={platform.value}
              type="button"
              disabled={authorizing !== null}
              onClick={() => void handlePlatformClick(platform)}
              className="flex flex-col items-center gap-2 rounded-none border border-[#E2E8F0] bg-white p-4 transition-colors hover:border-[#0033A0] hover:bg-[#EFF4FF] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="relative flex h-10 w-10 items-center justify-center">
                <Image
                  src={PLATFORM_LOGOS[platform.value]}
                  alt={platform.name}
                  className="h-10 w-10 object-contain"
                />
                {authorizing === platform && (
                  <span className="absolute inset-0 flex items-center justify-center bg-white/60">
                    <Loader2 className="size-4 animate-spin text-[#0033A0]" />
                  </span>
                )}
              </span>
              <span className="flex items-center gap-1 text-sm font-bold text-[#1A1A1A]">
                {platform.name}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-4 flex items-center gap-1.5 text-[12px] font-medium text-[#94A3B8]">
          <ExternalLink className="size-3.5 shrink-0" />
          选择平台后将打开对应授权页，登录并确认后账号自动写入列表
        </p>
      </DialogContent>
    </Dialog>
  );
};

export default PlatformAuthDialog;
