/**
 * 自动填表数据模型（源自 multipost-core / MultiPost-Extension，Apache-2.0）。
 * 纯类型声明，供填表注入函数使用；注入函数在目标平台页面上下文执行时
 * 只接收 SyncData（纯 JSON，可结构化克隆），因此这里只需类型。
 */

export interface SyncDataPlatform {
  name: string;
  injectUrl?: string;
  extraConfig?: unknown;
}

export interface SyncData {
  platforms: SyncDataPlatform[];
  isAutoPublish: boolean;
  data: DynamicData | VideoData;
  origin?: DynamicData | VideoData;
}

export interface DynamicData {
  title: string;
  content: string;
  images: FileData[];
  videos: FileData[];
  tags?: string[];
  scheduledPublishTime?: number;
}

export interface VideoData {
  title: string;
  content: string;
  video: FileData;
  tags?: string[];
  cover?: FileData;
  verticalCover?: FileData;
  horizontalCover?: FileData;
  scheduledPublishTime?: number;
  category?: string | number;
  original?: boolean;
  description?: string;
}

export interface FileData {
  name: string;
  url: string;
  type?: string;
  size?: number;
}
