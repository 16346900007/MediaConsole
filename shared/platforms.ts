import type { SocialPlatform } from './api.interface';

export interface PlatformMeta {
  value: SocialPlatform;
  name: string;
  color: string;
  creatorUrl: string;
  /** 创作中心（登录后可直达的后台）地址；未配置时回退 creatorUrl */
  homeUrl?: string;
  titleLimit: number;
  adaptTip: string;
}

export const PLATFORMS: PlatformMeta[] = [
  {
    value: 'douyin',
    name: '抖音',
    color: '#1E293B',
    creatorUrl: 'https://creator.douyin.com/',
    titleLimit: 55,
    adaptTip: '标题 55 字内，前 3 个字放钩子；话题用 # 包裹；强调节奏感与悬念',
  },
  {
    value: 'xiaohongshu',
    name: '小红书',
    color: '#EF4444',
    creatorUrl: 'https://creator.xiaohongshu.com/',
    titleLimit: 20,
    adaptTip: '标题 20 字内、可带 emoji；正文口语化短句分段；关键词标签前置',
  },
  {
    value: 'bilibili',
    name: 'B站',
    color: '#FACC15',
    creatorUrl: 'https://member.bilibili.com/platform',
    titleLimit: 80,
    adaptTip: '标题可长（80 字内）带分区关键词；说明区写详尽信息与时间轴',
  },
  {
    value: 'shipinhao',
    name: '视频号',
    color: 'rgb(90,173,112)',
    creatorUrl: 'https://channels.weixin.qq.com/platform',
    titleLimit: 30,
    adaptTip: '偏微信生态语感，标题简洁可信；内容以转发与熟人传播为导向',
  },
  {
    value: 'weibo',
    name: '微博',
    color: '#F97316',
    // 授权入口：微博登录页（weibo.com 创作中心已下线，登录后才能进入创作平台）
    creatorUrl:
      'https://passport.weibo.com/sso/signin?entry=weibo&url=https%3A%2F%2Fweibo.com%2F',
    // 创作中心：微博无独立创作平台域名（weibo.com 已下线、creator.weibo.com 不存在），
    // 登录后可直达的管理后台即 weibo.com（发博器/数据中心入口）
    homeUrl: 'https://weibo.com/',
    titleLimit: 140,
    adaptTip: '正文 140 字内（或用头条文章）；话题用 #xx# 格式；语气轻快互动',
  },
  {
    value: 'kuaishou',
    name: '快手',
    color: '#EF4444',
    creatorUrl: 'https://cp.kuaishou.com/',
    titleLimit: 50,
    adaptTip: '接地气、口语化，标题短平快突出真实感与共鸣',
  },
  {
    value: 'youtube',
    name: 'YouTube',
    color: '#EF4444',
    creatorUrl: 'https://studio.youtube.com/',
    titleLimit: 100,
    adaptTip: '英文标题（100 字符内）前置关键词；描述区做 SEO；首行放核心信息',
  },
];

export const PLATFORM_MAP: Record<SocialPlatform, PlatformMeta> = PLATFORMS.reduce(
  (map, platform) => {
    map[platform.value] = platform;
    return map;
  },
  {} as Record<SocialPlatform, PlatformMeta>,
);
