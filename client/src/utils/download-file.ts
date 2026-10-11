import JSZip from 'jszip';

interface SaveFilePickerHandle {
  createWritable: () => Promise<{
    write: (b: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
}

interface SaveFilePickerOptions {
  suggestedName: string;
  types?: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
}

type WindowWithPicker = Window & {
  showSaveFilePicker?: (options: SaveFilePickerOptions) => Promise<SaveFilePickerHandle>;
};

/**
 * 优先使用浏览器「另存为」对话框让用户选择保存位置（showSaveFilePicker），
 * 失败（非安全上下文 / 环境不支持）时回退到普通 Blob 下载。
 */
async function saveBlobWithPicker(
  blob: Blob,
  suggestedName: string,
): Promise<boolean> {
  const picker = (window as WindowWithPicker).showSaveFilePicker;

  if (typeof picker === 'function') {
    try {
      const handle = await picker({
        suggestedName,
        types: [
          {
            description: '文件',
            accept: {
              'application/octet-stream': ['.zip', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp4', '.webm', '.mov', '.pdf', '.txt'],
            },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (error: unknown) {
      // 用户取消对话框或环境不支持：回退普通下载
      if (
        error instanceof DOMException &&
        error.name === 'AbortError'
      ) {
        // 用户主动取消，不再回退
        return false;
      }
    }
  }

  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
  return true;
}

/** 下载单个文件：优先选保存位置 */
export async function downloadFileByBlob(
  url: string,
  name: string,
): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`下载失败（HTTP ${res.status}）`);
  }
  const blob = await res.blob();
  await saveBlobWithPicker(blob, name);
}

export interface ZipEntry {
  url: string;
  name: string;
}

/** 批量下载：全部打包为 zip（优先选保存位置） */
export async function downloadFilesAsZip(
  entries: ZipEntry[],
  zipName: string,
): Promise<{ okCount: number; failCount: number }> {
  const zip = new JSZip();
  const usedNames = new Set<string>();
  let failCount = 0;

  await Promise.all(
    entries.map(async (entry): Promise<void> => {
      try {
        const res = await fetch(entry.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        let name = entry.name;
        if (usedNames.has(name)) {
          const dot = name.lastIndexOf('.');
          const base = dot > 0 ? name.slice(0, dot) : name;
          const ext = dot > 0 ? name.slice(dot) : '';
          let i = 1;
          while (usedNames.has(`${base}(${i})${ext}`)) i += 1;
          name = `${base}(${i})${ext}`;
        }
        usedNames.add(name);
        zip.file(name, blob);
      } catch {
        failCount += 1;
      }
    }),
  );

  const okCount = entries.length - failCount;
  if (okCount === 0) {
    throw new Error('全部文件下载失败');
  }

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  await saveBlobWithPicker(zipBlob, zipName);
  return { okCount, failCount };
}
