/**
 * 通过 fetch 获取文件内容并以 Blob 方式触发浏览器下载。
 * 用于 Tauri 客户端环境：避免 <a target="_blank"> 触发 opener 权限拦截。
 */
export async function downloadFileByBlob(
  url: string,
  name: string,
): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`下载失败（HTTP ${res.status}）`);
  }
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
}
