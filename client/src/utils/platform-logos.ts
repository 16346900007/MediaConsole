import type { SocialPlatform } from '@shared/api.interface';
import douyinLogo from '@/assets/platform-logos/douyin.png';
import xiaohongshuLogo from '@/assets/platform-logos/xiaohongshu.png';
import bilibiliLogo from '@/assets/platform-logos/bilibili.png';
import shipinhaoLogo from '@/assets/platform-logos/shipinhao.png';
import weiboLogo from '@/assets/platform-logos/weibo.png';
import kuaishouLogo from '@/assets/platform-logos/kuaishou.png';
import youtubeLogo from '@/assets/platform-logos/youtube.png';

export const PLATFORM_LOGOS: Record<SocialPlatform, string> = {
  douyin: douyinLogo,
  xiaohongshu: xiaohongshuLogo,
  bilibili: bilibiliLogo,
  shipinhao: shipinhaoLogo,
  weibo: weiboLogo,
  kuaishou: kuaishouLogo,
  youtube: youtubeLogo,
};
