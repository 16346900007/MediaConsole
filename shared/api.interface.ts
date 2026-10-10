/* 前后端共享的类型 */

export type SocialPlatform =
  | 'douyin'
  | 'xiaohongshu'
  | 'bilibili'
  | 'shipinhao'
  | 'weibo'
  | 'kuaishou'
  | 'youtube';

export type AccountStatus = 'active' | 'paused';
export type ContentType = 'article' | 'video';
export type ContentStatus = 'draft' | 'ready' | 'archived';

export const SOCIAL_PLATFORMS: SocialPlatform[] = [
  'douyin',
  'xiaohongshu',
  'bilibili',
  'shipinhao',
  'weibo',
  'kuaishou',
  'youtube',
];

export interface SocialAccount {
  id: string;
  platform: SocialPlatform;
  accountName: string;
  homeUrl: string | null;
  followersCount: number;
  groupName: string | null;
  status: AccountStatus;
  note: string | null;
  /** 平台侧唯一标识（如小红书商家编码 sellerId），OAuth 授权后回填 */
  platformUid?: string | null;
  /** 平台头像地址，OAuth 授权后回填 */
  avatar?: string | null;
  /** OAuth 访问令牌（服务端持有，不回显到前端展示逻辑） */
  accessToken?: string | null;
  /** OAuth 刷新令牌 */
  refreshToken?: string | null;
  /** 访问令牌过期时间 */
  tokenExpiresAt?: string | null;
  /** 登录态校验结果：true=在线 false=离线 null=未校验 */
  online?: boolean | null;
  /** 最近一次登录态校验时间 */
  lastVerifiedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 发起平台授权请求 */
export interface AuthStartRequest {
  platform: SocialPlatform;
}

/** 发起平台授权响应：authUrl 为引导用户跳转的授权页地址 */
export interface AuthStartResponse {
  authUrl: string;
  /** 本地授权状态标识（回调时凭 state 核对） */
  state: string;
  /** 是否已配置平台凭证；未配置时 authUrl 为空 */
  configured: boolean;
  /** 未配置时的提示文案 */
  message?: string;
}

export interface CreateAccountRequest {
  platform: SocialPlatform;
  accountName: string;
  homeUrl?: string | null;
  followersCount?: number;
  groupName?: string | null;
  status?: AccountStatus;
  note?: string | null;
}

export interface UpdateAccountRequest {
  accountName?: string;
  homeUrl?: string | null;
  followersCount?: number;
  groupName?: string | null;
  status?: AccountStatus;
  note?: string | null;
}

export interface ContentVariant {
  id: string;
  contentId: string;
  platform: SocialPlatform;
  adaptedTitle: string | null;
  adaptedBody: string | null;
}

export interface SocialContent {
  id: string;
  title: string;
  contentType: ContentType;
  body: string | null;
  tags: string[];
  coverUrl: string | null;
  status: ContentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SocialContentDetail extends SocialContent {
  variants: ContentVariant[];
}

export interface ContentListResponse {
  items: SocialContent[];
  total: number;
}

export interface CreateContentRequest {
  title: string;
  contentType: ContentType;
  body?: string | null;
  tags?: string[];
  coverUrl?: string | null;
  status?: ContentStatus;
}

export interface UpdateContentRequest {
  title?: string;
  contentType?: ContentType;
  body?: string | null;
  tags?: string[];
  coverUrl?: string | null;
  status?: ContentStatus;
}

export interface VariantInput {
  platform: SocialPlatform;
  adaptedTitle?: string | null;
  adaptedBody?: string | null;
}

export interface SaveVariantsRequest {
  variants: VariantInput[];
}

export interface MetricRecord {
  id: string;
  accountId: string;
  platform: SocialPlatform;
  date: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  followersDelta: number;
}

export interface MetricInput {
  accountId: string;
  date: string;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  followersDelta?: number;
}

export interface MetricBatchResponse {
  succeeded: number;
  errors: { row: number; message: string }[];
}

export interface MetricsDailyPoint {
  date: string;
  views: number;
  likes: number;
  comments: number;
  followersDelta: number;
}

export interface MetricsPlatformPoint {
  platform: SocialPlatform;
  views: number;
  likes: number;
  comments: number;
  followersDelta: number;
}

export interface MetricsAccountPoint {
  accountId: string;
  accountName: string;
  platform: SocialPlatform;
  views: number;
  likes: number;
  followersDelta: number;
}

export interface MetricsSummaryResponse {
  start: string;
  end: string;
  totals: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
    followersDelta: number;
  };
  daily: MetricsDailyPoint[];
  byPlatform: MetricsPlatformPoint[];
  byAccount: MetricsAccountPoint[];
}

export type MaterialType = 'image' | 'video';

export interface MaterialItem {
  id: string;
  name: string;
  type: MaterialType;
  filePath: string;
  fileUrl: string;
  fileSize: number;
  groupName: string | null;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export interface MaterialListResponse {
  items: MaterialItem[];
  total: number;
}

export interface CreateMaterialRequest {
  name: string;
  type: MaterialType;
  filePath: string;
  fileUrl: string;
  fileSize: number;
  groupName?: string | null;
  width?: number | null;
  height?: number | null;
}

export interface UpdateMaterialRequest {
  name?: string;
  groupName?: string | null;
}

export interface MaterialBatchDeleteRequest {
  ids: string[];
}

export interface MaterialBatchMoveRequest {
  ids: string[];
  groupName: string | null;
}

export interface MaterialGroup {
  name: string;
  count: number;
}

export interface MaterialUsageResponse {
  usedBytes: number;
  totalBytes: number;
  fileCount: number;
}

/** 平台作品（无头抓取的真实作品数据，来自 social_posts 表） */
export interface SocialPost {
  id: string;
  accountId: string;
  platform: SocialPlatform;
  /** 平台侧作品唯一 ID */
  platformPostId: string;
  title: string;
  coverUrl: string | null;
  /** 原作品详情页链接（"查看原作品"跳转） */
  postUrl: string | null;
  views: number;
  likes: number;
  comments: number;
  favorites: number;
  /** 完播率（%），平台无此指标时为 null */
  watchRate: number | null;
  /** 涨粉量 */
  followersDelta: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 数据页：账号级聚合点 */
export interface DataAccountPoint {
  accountId: string;
  accountName: string;
  platform: SocialPlatform;
  avatar: string | null;
  followersCount: number;
  postCount: number;
  views: number;
  likes: number;
  comments: number;
  favorites: number;
}

/** 数据页：平台级聚合点 */
export interface DataPlatformPoint {
  platform: SocialPlatform;
  postCount: number;
  followersCount: number;
  views: number;
  likes: number;
  comments: number;
  favorites: number;
}

/** 数据页：总览聚合 */
export interface DataOverviewResponse {
  /** 最近一次同步完成时间（无缓存时为 null） */
  updatedAt: string | null;
  /** 缓存超过 10 分钟需后台刷新 */
  stale: boolean;
  /** 正在同步中 */
  syncing: boolean;
  totals: {
    postCount: number;
    followersCount: number;
    views: number;
    likes: number;
    comments: number;
    favorites: number;
  };
  byPlatform: DataPlatformPoint[];
  byAccount: DataAccountPoint[];
}

/** 数据页：触发同步 */
export interface DataSyncResponse {
  started: boolean;
  /** 本次将同步的账号数 */
  accounts: number;
  message?: string;
}
