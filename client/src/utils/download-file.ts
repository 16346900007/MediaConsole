import JSZip from 'jszip';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';

const isTauriEnv = (): boolean =>
  typeof window !== 'undefined' &&
  '__TAURI_INTERNALS__' in window;

interface SavePickerHandle {
  createWritable: () => Promise<{
    write: (b: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
}

interface SavePickerOptions {
  suggestedName: string;
  types?: Array<{ description: string; accept: Record<string, string[]> }>;
}

type WindowWithPicker = Window & {
  showSaveFilePicker?: (options: SavePickerOptions) => Promise<SavePickerHandle>;
};

const FILE_FILTERS = [
  {
    name: '文件',
    extensions: ['zip', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm', 'mov', 'pdf', 'txt'],
  },
];

/** 拉取文件（Tauri 走 axios 支持进度；Web 走 fetch） */
async function fetchBlobWithProgress(
  url: string,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  if (isTauriEnv()) {
    const { default: axios } = await import('axios');
    const resp = await axios.get(url, {
      responseType: 'blob',
      onDownloadProgress: (e) => {
        if (e.total) onProgress?.(Math.round((e.loaded / e.total) * 100));
      },
    });
    return resp.data as Blob;
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`下载失败（HTTP ${res.status}）`);
  }
  return res.blob();
}

/**
 * 保存文件：
 * - Tauri：弹系统「另存为」对话框让用户选位置，再写盘
 * - Web：showSaveFilePicker 选位置；不支持则回退普通浏览器下载
 * 返回 true=已保存/已触发，false=用户取消
 */
async function saveFile(
  blob: Blob,
  suggestedName: string,
): Promise<boolean> {
  if (isTauriEnv()) {
    const path = await save({
      defaultPath: suggestedName,
      filters: FILE_FILTERS,
    });
    if (!path) return false;
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    return true;
  }

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
      if (error instanceof DOMException && error.name === 'AbortError') {
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

/** 下载单个文件（可带进度回调 0-100） */
export async function downloadFileByBlob(
  url: string,
  name: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const blob = await fetchBlobWithProgress(url, onProgress);
  await saveFile(blob, name);
}

export interface ZipEntry {
  url: string;
  name: string;
}

/**
 * 批量下载：全部打包为 zip。
 * 整体进度（拉取+压缩）通过 onProgress 回报 0-100。
 */
export async function downloadFilesAsZip(
  entries: ZipEntry[],
  zipName: string,
  onProgress?: (pct: number) => void,
): Promise<{ okCount: number; failCount: number; cancelled: boolean }> {
  const zip = new JSZip();
  const usedNames = new Set<string>();
  let failCount = 0;
  const totalFiles = entries.length;
  let doneFiles = 0;

  // 拉取阶段：按文件数 + 当前文件内进度回报（占整体 90%）
  await Promise.all(
    entries.map(async (entry): Promise<void> => {
      try {
        const blob = await fetchBlobWithProgress(entry.url, (pct) => {
          onProgress?.(
            Math.round(((doneFiles + pct / 100) / totalFiles) * 90),
          );
        });
        if (!blob) throw new Error('empty');
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
      } finally {
        doneFiles += 1;
      }
    }),
  );

  const okCount = entries.length - failCount;
  if (okCount === 0) {
    throw new Error('全部文件下载失败');
  }

  // 压缩阶段：占整体 90-100%
  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    onUpdate: (meta) =>
      onProgress?.(Math.round(90 + meta.percent * 0.1)),
  });
  const saved = await saveFile(zipBlob, zipName);
  return { okCount, failCount, cancelled: !saved };
}
