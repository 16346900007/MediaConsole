/**
 * 平台映射：MediaConsole 平台常量 → multipost-core 填表注入函数（Apache-2.0）。
 * 只覆盖现有 7 平台；video 用 VIDEO_* 注入函数，image（图文）用 DYNAMIC_* 注入函数。
 */
import type { SocialPlatform } from '@shared/api.interface';
import type { SyncData } from './fill-types';
import { VideoBilibili } from './handlers/video/bilibili';
import { VideoDouyin } from './handlers/video/douyin';
import { VideoKuaishou } from './handlers/video/kuaishou';
import { VideoRednote } from './handlers/video/rednote';
import { VideoWeibo } from './handlers/video/weibo';
import { VideoWeiXinChannel } from './handlers/video/weixinchannel';
import { VideoYoutube } from './handlers/video/youtube';
import { DynamicBilibili } from './handlers/dynamic/bilibili';
import { DynamicDouyin } from './handlers/dynamic/douyin';
import { DynamicKuaishou } from './handlers/dynamic/kuaishou';
import { DynamicRednote } from './handlers/dynamic/rednote';
import { DynamicWeibo } from './handlers/dynamic/weibo';
import { DynamicWeiXinChannel } from './handlers/dynamic/weixinchannel';

export type FillContentType = 'video' | 'image';

export interface FillPlatformSpec {
  /** 平台发布页地址（填表时打开） */
  injectUrl: string;
  /** 注入函数：页面上下文执行，自包含 */
  injectFunction: (data: SyncData) => Promise<void>;
}

const SPECS: Record<SocialPlatform, Partial<Record<FillContentType, FillPlatformSpec>>> = {
  douyin: {
    video: {
      injectUrl: 'https://creator.douyin.com/creator-micro/content/upload',
      injectFunction: VideoDouyin,
    },
    image: {
      injectUrl: 'https://creator.douyin.com/creator-micro/content/upload',
      injectFunction: DynamicDouyin,
    },
  },
  xiaohongshu: {
    video: {
      injectUrl: 'https://creator.xiaohongshu.com/publish/publish?target=video',
      injectFunction: VideoRednote,
    },
    image: {
      injectUrl: 'https://creator.xiaohongshu.com/publish/publish?target=note',
      injectFunction: DynamicRednote,
    },
  },
  bilibili: {
    video: {
      injectUrl: 'https://member.bilibili.com/platform/upload/video/frame',
      injectFunction: VideoBilibili,
    },
    image: {
      injectUrl: 'https://member.bilibili.com/platform/upload/text/edit',
      injectFunction: DynamicBilibili,
    },
  },
  shipinhao: {
    video: {
      injectUrl: 'https://channels.weixin.qq.com/platform/post/create',
      injectFunction: VideoWeiXinChannel,
    },
    image: {
      injectUrl: 'https://channels.weixin.qq.com/platform/post/create',
      injectFunction: DynamicWeiXinChannel,
    },
  },
  weibo: {
    video: {
      injectUrl: 'https://weibo.com/upload/channel',
      injectFunction: VideoWeibo,
    },
    image: {
      injectUrl: 'https://weibo.com/',
      injectFunction: DynamicWeibo,
    },
  },
  kuaishou: {
    video: {
      injectUrl: 'https://cp.kuaishou.com/article/publish/video',
      injectFunction: VideoKuaishou,
    },
    image: {
      injectUrl: 'https://cp.kuaishou.com/article/publish/upload',
      injectFunction: DynamicKuaishou,
    },
  },
  youtube: {
    video: {
      injectUrl: 'https://studio.youtube.com/',
      injectFunction: VideoYoutube,
    },
    // YouTube 无图文（dynamic）发布页，image 类型留空
  },
};

/** 取某平台某内容类型的填表规格；不支持时返回 null */
export function getFillSpec(
  platform: SocialPlatform,
  type: FillContentType,
): FillPlatformSpec | null {
  return SPECS[platform]?.[type] ?? null;
}

/** 平台中文名（错误提示用） */
export const PLATFORM_CN: Record<SocialPlatform, string> = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  bilibili: 'B站',
  shipinhao: '视频号',
  weibo: '微博',
  kuaishou: '快手',
  youtube: 'YouTube',
};
