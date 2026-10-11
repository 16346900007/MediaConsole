import { useEffect, useState } from 'react';
import { FileVideo } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VideoThumbnailProps {
  src: string;
  className?: string;
  /** 抽帧失败/加载中占位图标尺寸 */
  fallbackIconSize?: string;
}

/** 模块级抽帧缓存：同一视频只抽一次帧，切换/刷新直接复用 */
const thumbCache = new Map<string, string>();
/** 抽帧超时（秒）：远程大视频元数据加载慢，超时直接回退占位图标 */
const SEEK_TIMEOUT_MS = 25000;

/** 视频缩略图：加载视频后在浏览器内 seek 到 10%（最多 2 秒）处截一帧显示，
 *  避免首帧黑屏；失败/超时回退播放图标。发布页、素材库共用。 */
export default function VideoThumbnail({
  src,
  className,
  fallbackIconSize = 'size-3.5',
}: VideoThumbnailProps) {
  const [thumb, setThumb] = useState<string | null>(() => thumbCache.get(src) ?? null);

  useEffect(() => {
    if (thumbCache.has(src)) {
      setThumb(thumbCache.get(src)!);
      return;
    }
    let cancelled = false;
    let settled = false;
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.crossOrigin = 'anonymous';
    video.playsInline = true;
    video.src = src;

    const finish = (dataUrl: string | null) => {
      if (cancelled || settled) return;
      settled = true;
      if (dataUrl) {
        thumbCache.set(src, dataUrl);
        setThumb(dataUrl);
      } else {
        setThumb(null);
      }
    };

    const onLoaded = () => {
      try {
        // 取总时长 10%（最多 2 秒）处的一帧，避免首帧黑屏
        const target = Math.min(2, Math.max(0.1, video.duration * 0.1));
        video.currentTime = target;
      } catch {
        finish(null);
      }
    };
    const onSeeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 112;
        const ctx = canvas.getContext('2d');
        if (!ctx) return finish(null);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL('image/jpeg', 0.72));
      } catch {
        finish(null);
      }
    };
    const onError = () => finish(null);
    video.addEventListener('loadeddata', onLoaded);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.load();

    const timer = setTimeout(() => finish(null), SEEK_TIMEOUT_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      video.removeEventListener('loadeddata', onLoaded);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
  }, [src]);

  return thumb ? (
    <img
      src={thumb}
      alt=""
      className={cn(
        'shrink-0 rounded-none border border-[#E2E8F0] bg-slate-200 object-cover',
        className,
      )}
    />
  ) : (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-none border border-[#E2E8F0] bg-slate-100 text-[#94A3B8]',
        className,
      )}
    >
      <FileVideo className={fallbackIconSize} />
    </div>
  );
}
