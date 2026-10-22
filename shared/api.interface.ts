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
  /** 视频截帧缩略图读取地址（仅视频有） */
  thumbnailUrl?: string | null;
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
  thumbnailUrl?: string | null;
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

/** 账号分组（账号页分组管理，结构与素材分组一致） */
export interface AccountGroup {
  name: string;
  count: number;
}

/** 常用话题标签（列表返回 id 以便编辑弹窗删除） */
export interface TopicTag {
  id: string;
  name: string;
}

/** 常用话题分组（发布页话题库） */
export interface TopicGroup {
  id: string;
  name: string;
  tags: TopicTag[];
}

export interface TopicLibrary {
  groups: TopicGroup[];
}

/** 高德位置联想结果（发布页「位置」字段） */
export interface GeoPlace {
  name: string;
  address: string;
  adcode: string;
  location: string;
  typecode: string;
}

/** B站投稿分区（无头模式获取，一级+二级） */
export interface BiliPartitionChild {
  tid: number;
  name: string;
}
export interface BiliPartition {
  tid: number;
  name: string;
  children: BiliPartitionChild[];
}

/** 批量移动账号到分组 */
export interface AccountBatchMoveRequest {
  ids: string[];
  groupName: string | null;
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
  /** 平台原始数据（平台特有列展示用） */
  raw?: Record<string, unknown> | null;
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

/* ------------------------------------------------------------------ */
/* 发布（发布单 + 目标 + 文件服务）                                     */
/* ------------------------------------------------------------------ */

export type PublishType = 'video' | 'image' | 'article';
export type PublishTaskStatus =
  | 'draft' // 草稿（本地保存，未发布）
  | 'scheduled' // 已排期（本地定时，等待到点触发）
  | 'publishing' // 发布中
  | 'published' // 全部目标已发布
  | 'partial' // 部分目标已发布（人工填表流程）
  | 'partial_failed' // 部分目标失败（自动发布历史兼容）
  | 'failed'; // 全部失败
export type PublishTargetStatus = 'pending' | 'publishing' | 'success' | 'failed';

/** 发布单（一份内容 + 批量发布目标） */
export interface PublishTask {
  id: string;
  publishType: PublishType;
  title: string;
  /** 正文/描述（文章类型为全文） */
  body: string;
  /** 话题（#话题1 #话题2 或逗号分隔） */
  topic: string;
  /** 位置文本 */
  location: string;
  /** 封面文件 key（files 服务） */
  coverFileKey: string | null;
  /** 主体文件 key 列表（视频 1 个 / 图文多张 / 文章无） */
  mediaFileKeys: string[];
  /** 平台特有字段（按平台存 jsonb，如 { bilibili: { tid, tag, copyright } }） */
  platformFields: Record<string, Record<string, unknown>>;
  /** 通用字段可见性：public / private */
  visibility: 'public' | 'private';
  status: PublishTaskStatus;
  /** 本地定时发布时间（status=scheduled 时有效） */
  scheduledAt: string | null;
  publishedAt: string | null;
  error: string | null;
  targets: PublishTarget[];
  createdAt: string;
  updatedAt: string;
}

/** 自动填表结果（每个目标平台一条） */
export interface FillFormTargetResult {
  platform: SocialPlatform;
  platformName: string;
  accountName: string;
  status: 'filled' | 'skipped' | 'failed';
  message: string;
  url: string;
}

export interface FillFormsResult {
  baseUrl: string;
  opened: FillFormTargetResult[];
}

/** 发布目标（一个平台的一个账号） */
export interface PublishTarget {
  id: string;
  taskId: string;
  platform: SocialPlatform;
  accountId: string;
  accountName?: string;
  status: PublishTargetStatus;
  error: string | null;
  /** 上传/发布进度（0-100；发布中实时更新） */
  progress?: number;
  /** 平台侧作品 ID（发布成功后） */
  platformPostId: string | null;
  postUrl: string | null;
  publishedAt: string | null;
}

/** 创建/更新发布单请求 */
export interface PublishTaskInput {
  publishType: PublishType;
  title?: string;
  body?: string;
  topic?: string;
  location?: string;
  coverFileKey?: string | null;
  mediaFileKeys?: string[];
  platformFields?: Record<string, Record<string, unknown>>;
  visibility?: 'public' | 'private';
  /** 目标：platform + accountId 列表 */
  targets?: { platform: SocialPlatform; accountId: string }[];
  /** 保存为草稿 */
  asDraft?: boolean;
  /** 本地定时发布时间（ISO）；不传=立即 */
  scheduledAt?: string | null;
}

/** 文件上传响应 */
export interface FileUploadResponse {
  fileKey: string;
  /** 读取地址（GET /api/social/files/:bucket/:key） */
  url: string;
  size: number;
  mime: string;
  /** 视频截帧缩略图读取地址（随 thumb 字段一起上传时返回） */
  thumbUrl?: string | null;
  /** S3 模式：异步上传任务 id（存在时需轮询 /api/social/files/upload-progress/:taskId） */
  taskId?: string;
  phase?: 'uploading' | 'done' | 'error';
}
