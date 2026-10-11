/**
 * 视频本地截帧：用 video 元素加载本地文件，seek 到中段取一帧转 JPEG。
 * 用于素材上传时生成独立缩略图（避免列表每次拉取视频流截帧）。
 */
export async function captureVideoThumbnail(
  videoFile: File,
  maxWidth = 640,
): Promise<File | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(videoFile);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';

    let settled = false;
    const cleanup = (): void => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
    };
    const fail = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(null);
    };

    video.onerror = () => fail();
    video.onloadedmetadata = () => {
      try {
        // 取 10% 位置（首帧黑屏常见，靠中段更稳）
        const target = Math.min(
          Math.max((video.duration || 1) * 0.1, 0.1),
          Math.max((video.duration || 1) - 0.5, 0.1),
        );
        video.currentTime = target;
      } catch {
        fail();
        return;
      }
    };
    video.onseeked = () => {
      try {
        if (settled) return;
        const w = Math.min(video.videoWidth || 640, maxWidth);
        const h = Math.round((w * (video.videoHeight || 360)) / (video.videoWidth || 640));
        if (w <= 0 || h <= 0) {
          fail();
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          fail();
          return;
        }
        ctx.drawImage(video, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            if (settled) return;
            settled = true;
            cleanup();
            if (!blob) {
              resolve(null);
              return;
            }
            const base = videoFile.name.replace(/\.[^.]+$/, '') || 'video';
            resolve(
              new File([blob], `${base}_thumb.jpg`, {
                type: 'image/jpeg',
              }),
            );
          },
          'image/jpeg',
          0.82,
        );
      } catch {
        fail();
      }
    };

    video.src = url;
  });
}
