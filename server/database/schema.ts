/* eslint-disable */
/** auto generated, do not edit */
import { sql } from 'drizzle-orm';
import { bigint, boolean, date, foreignKey, index, integer, jsonb, numeric, pgTable, text, uniqueIndex, uuid, varchar, customType } from "drizzle-orm/pg-core"

export const customTimestamptz = customType<{
  data: Date;
  driverData: string;
  config: { precision?: number };
}>({
  dataType(config) {
    const precision = typeof config?.precision !== 'undefined'
      ? ` (${config.precision})`
      : '';
    return `timestamptz${precision}`;
  },
  toDriver(value: Date | string | number) {
    if (value == null) return value as any;
    if (typeof value === 'number') return new Date(value).toISOString();
    if (typeof value === 'string') return value;
    if (value instanceof Date) return value.toISOString();
    throw new Error('Invalid timestamp value');
  },
  fromDriver(value: string | Date): Date {
    if (value instanceof Date) return value;
    return new Date(value);
  },
});

export const userProfile = customType<{
  data: string;
  driverData: string;
}>({
  dataType() {
    return 'user_profile';
  },
  toDriver(value: string) {
    return sql`ROW(${value})::user_profile`;
  },
  fromDriver(value: string) {
    const [userId] = value.slice(1, -1).split(',');
    return userId.trim();
  },
});

export type FileAttachment = {
  bucket_id: string;
  file_path: string;
};

export const fileAttachment = customType<{
  data: FileAttachment;
  driverData: string;
}>({
  dataType() {
    return 'file_attachment';
  },
  toDriver(value: FileAttachment) {
    return sql`ROW(${value.bucket_id},${value.file_path})::file_attachment`;
  },
  fromDriver(value: string): FileAttachment {
    const [bucketId, filePath] = value.slice(1, -1).split(',');
    return { bucket_id: bucketId.trim(), file_path: filePath.trim() };
  },
});

export function escapeLiteral(str: string): string {
  return "'" + str.replace(/'/g, "''") + "'";
}

export const userProfileArray = customType<{
  data: string[];
  driverData: string;
}>({
  dataType() {
    return 'user_profile[]';
  },
  toDriver(value: string[]) {
    if (!value || value.length === 0) {
      return sql`'{}'::user_profile[]`;
    }
    const elements = value.map(id => `ROW(${escapeLiteral(id)})::user_profile`).join(',');
    return sql.raw(`ARRAY[${elements}]::user_profile[]`);
  },
  fromDriver(value: string): string[] {
    if (!value || value === '{}') return [];
    const inner = value.slice(1, -1);
    const matches = inner.match(/\([^)]*\)/g) || [];
    return matches.map(m => m.slice(1, -1).split(',')[0].trim());
  },
});

export const fileAttachmentArray = customType<{
  data: FileAttachment[];
  driverData: string;
}>({
  dataType() {
    return 'file_attachment[]';
  },
  toDriver(value: FileAttachment[]) {
    if (!value || value.length === 0) {
      return sql`'{}'::file_attachment[]`;
    }
    const elements = value.map(f =>
      `ROW(${escapeLiteral(f.bucket_id)},${escapeLiteral(f.file_path)})::file_attachment`
    ).join(',');
    return sql.raw(`ARRAY[${elements}]::file_attachment[]`);
  },
  fromDriver(value: string): FileAttachment[] {
    if (!value || value === '{}') return [];
    const inner = value.slice(1, -1);
    const matches = inner.match(/\([^)]*\)/g) || [];
    return matches.map(m => {
      const [bucketId, filePath] = m.slice(1, -1).split(',');
      return { bucket_id: bucketId.trim(), file_path: filePath.trim() };
    });
  },
});

export const socialMaterialGroups = pgTable("social_material_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  uniqueIndex("idx_material_groups_name").on(table.name),
]);

export const socialAccountGroups = pgTable("social_account_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  uniqueIndex("idx_account_groups_name").on(table.name),
]);

/** 常用话题分组（发布页话题库） */
export const socialTopicGroups = pgTable("social_topic_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  uniqueIndex("idx_topic_groups_name").on(table.name),
]);

/** 常用话题标签（归属某个分组） */
export const socialTopicTags = pgTable("social_topic_tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id")
    .notNull()
    .references(() => socialTopicGroups.id, { onDelete: 'cascade' }),
  name: varchar("name", { length: 100 }).notNull(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  uniqueIndex("idx_topic_tags_group_name").on(table.groupId, table.name),
]);

export const socialMaterials = pgTable("social_materials", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  type: varchar("type", { length: 16 }).notNull(),
  filePath: text("file_path").notNull(),
  fileUrl: text("file_url").notNull(),
  fileSize: bigint("file_size", { mode: 'number' }).notNull().default(0),
  groupName: varchar("group_name", { length: 100 }),
  width: integer("width"),
  height: integer("height"),
  thumbnailUrl: text("thumbnail_url"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  index("idx_materials_type").on(table.type),
  index("idx_materials_group").on(table.groupName),
  index("idx_materials_created_at").on(table.createdAt),
]);

export const socialMetrics = pgTable("social_metrics", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull(),
  platform: varchar("platform", { length: 32 }).notNull(),
  date: date("date").notNull(),
  views: integer("views").notNull().default(0),
  likes: integer("likes").notNull().default(0),
  comments: integer("comments").notNull().default(0),
  shares: integer("shares").notNull().default(0),
  followersDelta: integer("followers_delta").notNull().default(0),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  uniqueIndex("idx_metrics_account_date").on(table.accountId, table.date),
  index("idx_metrics_date").on(table.date),
  foreignKey({
    columns: [table.accountId],
    foreignColumns: [socialAccounts.id],
    name: "social_metrics_account_id_fkey",
  }).onDelete("cascade"),
]);

export const socialPublishPlans = pgTable("social_publish_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  contentId: uuid("content_id").notNull(),
  platform: varchar("platform", { length: 32 }).notNull(),
  accountId: uuid("account_id"),
  plannedDate: date("planned_date").notNull(),
  status: varchar("status", { length: 32 }).notNull().default('pending'),
  publishedAt: customTimestamptz("published_at", { precision: 3 }),
  actualUrl: text("actual_url"),
  note: text("note"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  index("idx_plans_planned_date").on(table.plannedDate),
  foreignKey({
    columns: [table.contentId],
    foreignColumns: [socialContents.id],
    name: "social_publish_plans_content_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.accountId],
    foreignColumns: [socialAccounts.id],
    name: "social_publish_plans_account_id_fkey",
  }).onDelete("set null"),
]);

export const socialContentVariants = pgTable("social_content_variants", {
  id: uuid("id").primaryKey().defaultRandom(),
  contentId: uuid("content_id").notNull(),
  platform: varchar("platform", { length: 32 }).notNull(),
  adaptedTitle: varchar("adapted_title", { length: 200 }),
  adaptedBody: text("adapted_body"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  uniqueIndex("idx_variants_content_platform").on(table.contentId, table.platform),
  foreignKey({
    columns: [table.contentId],
    foreignColumns: [socialContents.id],
    name: "social_content_variants_content_id_fkey",
  }).onDelete("cascade"),
]);

export const socialContents = pgTable("social_contents", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 200 }).notNull(),
  contentType: varchar("content_type", { length: 32 }).notNull(),
  body: text("body"),
  tags: text("tags").array().default([]),
  coverUrl: text("cover_url"),
  status: varchar("status", { length: 32 }).notNull().default('draft'),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
});

export const socialAccounts = pgTable("social_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  platform: varchar("platform", { length: 32 }).notNull(),
  accountName: varchar("account_name", { length: 100 }).notNull(),
  homeUrl: text("home_url"),
  followersCount: integer("followers_count").notNull().default(0),
  groupName: varchar("group_name", { length: 100 }),
  status: varchar("status", { length: 32 }).notNull().default('active'),
  note: text("note"),
  // OAuth 授权字段（平台授权账号时回填）
  platformUid: varchar("platform_uid", { length: 100 }),
  avatar: text("avatar"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: customTimestamptz("token_expires_at", { precision: 3 }),
  // 登录态校验字段（刷新校验后回填）
  online: boolean("online"),
  lastVerifiedAt: customTimestamptz("last_verified_at", { precision: 3 }),
  // 数据页作品同步时间（10 分钟缓存刷新判据）
  lastDataSyncedAt: customTimestamptz("last_data_synced_at", { precision: 3 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
});

/**
 * 平台作品明细表（无头抓取各平台创作中心的真实作品数据）
 * account_id + platform_post_id 唯一：重抓时按此去重 upsert
 */
export const socialPosts = pgTable("social_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull(),
  platform: varchar("platform", { length: 32 }).notNull(),
  /** 平台侧作品唯一 ID（如快手 photoId / 抖音 awemeId / B站 BV号） */
  platformPostId: varchar("platform_post_id", { length: 200 }).notNull(),
  title: varchar("title", { length: 300 }).notNull().default(''),
  coverUrl: text("cover_url"),
  /** 原作品详情页链接（"查看原作品"跳转用） */
  postUrl: text("post_url"),
  views: integer("views").notNull().default(0),
  likes: integer("likes").notNull().default(0),
  comments: integer("comments").notNull().default(0),
  /** 收藏量（B站/快手后台均为收藏） */
  favorites: integer("favorites").notNull().default(0),
  /** 完播率（%），平台无此指标时为 null */
  watchRate: numeric("watch_rate", { precision: 6, scale: 2 }),
  /** 涨粉量（作品维度），平台无此指标时为 0 */
  followersDelta: integer("followers_delta").notNull().default(0),
  publishedAt: customTimestamptz("published_at", { precision: 3 }),
  /** 平台原始抓取数据备份（便于平台特有列扩展展示） */
  raw: jsonb("raw"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  uniqueIndex("idx_posts_account_post").on(table.accountId, table.platformPostId),
  index("idx_posts_published_at").on(table.publishedAt),
  foreignKey({
    columns: [table.accountId],
    foreignColumns: [socialAccounts.id],
    name: "social_posts_account_id_fkey",
  }).onDelete("cascade"),
]);

/* ------------------------------------------------------------------ */
/* 发布：social_publish_tasks（发布单）+ social_publish_targets（目标） */
/* ------------------------------------------------------------------ */
export const socialPublishTasks = pgTable("social_publish_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** 发布类型：video / image / article */
  publishType: varchar("publish_type", { length: 16 }).notNull(),
  title: varchar("title", { length: 300 }).notNull().default(''),
  /** 正文/描述（文章类型为全文） */
  body: text("body"),
  /** 话题（#话题1 #话题2 或逗号分隔） */
  topic: varchar("topic", { length: 500 }),
  /** 位置文本 */
  location: varchar("location", { length: 200 }),
  /** 封面文件 key（files 服务） */
  coverFileKey: text("cover_file_key"),
  /** 主体文件 key 列表（视频 1 个 / 图文多张 / 文章空） */
  mediaFileKeys: jsonb("media_file_keys").notNull().default(sql`'[]'::jsonb`),
  /** 平台特有字段（jsonb：{ bilibili: { tid, tag, copyright } }） */
  platformFields: jsonb("platform_fields").notNull().default(sql`'{}'::jsonb`),
  /** 通用可见性：public / private */
  visibility: varchar("visibility", { length: 16 }).notNull().default('public'),
  /** 任务状态：draft/scheduled/publishing/published/partial_failed/failed */
  status: varchar("status", { length: 16 }).notNull().default('draft'),
  /** 本地定时发布时间（status=scheduled 时有效，到点由调度触发执行） */
  scheduledAt: customTimestamptz("scheduled_at", { precision: 3 }),
  publishedAt: customTimestamptz("published_at", { precision: 3 }),
  /** 汇总失败原因 */
  error: text("error"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  index("idx_publish_tasks_status").on(table.status),
  index("idx_publish_tasks_scheduled").on(table.scheduledAt),
  index("idx_publish_tasks_created").on(table.createdAt),
]);

export const socialPublishTargets = pgTable("social_publish_targets", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").notNull(),
  platform: varchar("platform", { length: 32 }).notNull(),
  accountId: uuid("account_id").notNull(),
  /** 目标状态：pending/publishing/success/failed */
  status: varchar("status", { length: 16 }).notNull().default('pending'),
  error: text("error"),
  /** 平台侧作品 ID（发布成功后） */
  platformPostId: varchar("platform_post_id", { length: 200 }),
  postUrl: text("post_url"),
  publishedAt: customTimestamptz("published_at", { precision: 3 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  index("idx_publish_targets_task").on(table.taskId),
  index("idx_publish_targets_status").on(table.status),
  foreignKey({
    columns: [table.taskId],
    foreignColumns: [socialPublishTasks.id],
    name: "social_publish_targets_task_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.accountId],
    foreignColumns: [socialAccounts.id],
    name: "social_publish_targets_account_id_fkey",
  }).onDelete("cascade"),
]);

// table aliases
export const socialAccountsTable = socialAccounts;
export const socialContentVariantsTable = socialContentVariants;
export const socialContentsTable = socialContents;
export const socialMaterialGroupsTable = socialMaterialGroups;
export const socialAccountGroupsTable = socialAccountGroups;
export const socialMaterialsTable = socialMaterials;
export const socialMetricsTable = socialMetrics;
export const socialPublishPlansTable = socialPublishPlans;
export const socialPostsTable = socialPosts;
export const socialPublishTasksTable = socialPublishTasks;
export const socialPublishTargetsTable = socialPublishTargets;
