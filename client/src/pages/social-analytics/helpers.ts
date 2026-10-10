import { isAxiosError } from 'axios';

/** 数值展示：≥1万 用「万」，≥1亿 用「亿」 */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 100000000) {
    return `${(value / 100000000).toFixed(1)}亿`;
  }
  if (Math.abs(value) >= 10000) {
    return `${(value / 10000).toFixed(1)}万`;
  }
  return value.toLocaleString('zh-CN');
}

function extractNestMessage(error: unknown): string | null {
  if (!isAxiosError(error)) return null;
  const data: unknown = error.response?.data;
  if (typeof data !== 'object' || data === null || !('message' in data)) {
    return null;
  }
  const message: unknown = data.message;
  if (typeof message === 'string' && message.length > 0) return message;
  if (Array.isArray(message)) {
    const parts = message.filter((item): item is string => typeof item === 'string');
    if (parts.length > 0) return parts.join('；');
  }
  return null;
}

/** 从请求错误中提取可读信息，禁止静默 */
export function resolveErrorMessage(error: unknown): string {
  const nestMessage = extractNestMessage(error);
  if (nestMessage !== null) return nestMessage;
  if (error instanceof Error && error.message) return error.message;
  return '请求失败，请稍后重试';
}
