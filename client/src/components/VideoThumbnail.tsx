import { useEffect, useState } from 'react';
import { FileVideo } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VideoThumbnailProps {
  src: string;
  className?: string;
  /** 抽帧失败/加载中占位图标尺寸 */
  fallbackIconSize?: string;
}

/** 视频缩略图：加载视频后在浏览器内 seek 到 10%（最多 2 秒）处截一帧显示，
 *  避免首帧黑屏；失败时回退播放图标。发布页、素材库共用。 */
export default function VideoThumbnail({
  src,
  className,
  fallbackIconSize = 'size-3.5',
}: VideoThumbnailProps) {
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.crossOrigin = 'anonymous';
    video.src = src;

    const onLoaded = () => {
      try {
        // 取总时长 10%（最多 2 秒）处的一帧，避免首帧黑屏
        const target = Math.min(2, Math.max(0.1, video.duration * 0.1));
        video.currentTime = target;
      } catch {
        /* 忽略 seek 异常 */
      }
    };
    const onSeeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 112;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        if (!cancelled) setThumb(canvas.toDataURL('image/jpeg', 0.72));
      } catch {
        /* 抽帧失败时不显示缩略图 */
      }
    };
    video.addEventListener('loadeddata', onLoaded);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', () => setThumb(null));
    video.load();

    return () => {
      cancelled = true;
      video.removeEventListener('loadeddata', onLoaded);
      video.removeEventListener('seeked', onSeeked);
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
