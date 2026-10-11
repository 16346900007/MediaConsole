-- ============================================================
-- 自媒体多平台管理工具 · 数据库初始化脚本（本地 Postgres）
-- 生成时间：2026-10-09
-- 说明：
--   1. 本脚本在本地 PostgreSQL 中重建与妙搭线上库同构的 7 张业务表。
--   2. 妙搭平台使用复合类型 user_profile 存储人员信息；本地用
--      CREATE TYPE user_profile AS (user_id text) 等价模拟，
--      (字段).user_id 解引用与 ROW('id')::user_profile 写法均可用。
--   3. 幂等：表与索引均带 IF NOT EXISTS，可重复执行；复合类型用
--      DO 块 + duplicate_object 异常兜底（PG 不支持 CREATE TYPE IF NOT EXISTS）。
-- ============================================================

-- 平台复合类型的本地等价定义
DO $$
BEGIN
  CREATE TYPE user_profile AS (user_id text);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ------------------------------------------------------------
-- 1. 账号表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform varchar(32) NOT NULL,
  account_name varchar(100) NOT NULL,
  home_url text NULL,
  followers_count integer NOT NULL DEFAULT 0,
  group_name varchar(100) NULL,
  status varchar(32) NOT NULL DEFAULT 'active',
  note text NULL,
  platform_uid varchar(100) NULL,
  avatar text NULL,
  access_token text NULL,
  refresh_token text NULL,
  token_expires_at timestamptz(3) NULL,
  online boolean NULL,
  last_verified_at timestamptz(3) NULL,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile NULL DEFAULT (
    CASE
      WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile
      ELSE (concat('(', current_setting('app.user_id'::text, true), ')'))::user_profile
    END
  ),
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile NULL DEFAULT (
    CASE
      WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile
      ELSE (concat('(', current_setting('app.user_id'::text, true), ')'))::user_profile
    END
  )
);

-- ------------------------------------------------------------
-- 2. 内容表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS social_contents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title varchar(200) NOT NULL,
  content_type varchar(32) NOT NULL,
  body text NULL,
  tags text[] NULL DEFAULT '{}'::text[],
  cover_url text NULL,
  status varchar(32) NOT NULL DEFAULT 'draft',
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile NULL DEFAULT (
    CASE
      WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile
      ELSE (concat('(', current_setting('app.user_id'::text, true), ')'))::user_profile
    END
  ),
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile NULL DEFAULT (
    CASE
      WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile
      ELSE (concat('(', current_setting('app.user_id'::text, true), ')'))::user_profile
    END
  )
);

-- ------------------------------------------------------------
-- 3. 内容多平台适配表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS social_content_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid NOT NULL,
  platform varchar(32) NOT NULL,
  adapted_title varchar(200) NULL,
  adapted_body text NULL,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile NULL DEFAULT (
    CASE
      WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile
      ELSE (concat('(', current_setting('app.user_id'::text, true), ')'))::user_profile
    END
  ),
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile NULL DEFAULT (
    CASE
      WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile
      ELSE (concat('(', current_setting('app.user_id'::text, true), ')'))::user_profile
    END
  ),
  CONSTRAINT social_content_variants_content_id_fkey
    FOREIGN KEY (content_id) REFERENCES social_contents(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_variants_content_platform
  ON social_content_variants (content_id, platform);

-- ------------------------------------------------------------
-- 4. 数据指标表（按账号按日）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS social_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  platform varchar(32) NOT NULL,
  date date NOT NULL,
  views integer NOT NULL DEFAULT 0,
  likes integer NOT NULL DEFAULT 0,
  comments integer NOT NULL DEFAULT 0,
  shares integer NOT NULL DEFAULT 0,
  followers_delta integer NOT NULL DEFAULT 0,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile NULL DEFAULT (
    CASE
      WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile
      ELSE (concat('(', current_setting('app.user_id'::text, true), ')'))::user_profile
    END
  ),
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile NULL DEFAULT (
    CASE
      WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile
      ELSE (concat('(', current_setting('app.user_id'::text, true), ')'))::user_profile
    END
  ),
  CONSTRAINT social_metrics_account_id_fkey
    FOREIGN KEY (account_id) REFERENCES social_accounts(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_metrics_account_date
  ON social_metrics (account_id, date);
CREATE INDEX IF NOT EXISTS idx_metrics_date ON social_metrics (date);

-- ------------------------------------------------------------
-- 5. 素材分组表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS social_material_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile NULL DEFAULT (
    CASE
      WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile
      ELSE (concat('(', current_setting('app.user_id'::text, true), ')'))::user_profile
    END
  ),
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile NULL DEFAULT (
    CASE
      WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile
      ELSE (concat('(', current_setting('app.user_id'::text, true), ')'))::user_profile
    END
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_material_groups_name
  ON social_material_groups (name);

-- ------------------------------------------------------------
-- 6. 素材表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS social_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(200) NOT NULL,
  type varchar(16) NOT NULL,
  file_path text NOT NULL,
  file_url text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  group_name varchar(100) NULL,
  width integer NULL,
  height integer NULL,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile NULL DEFAULT (
    CASE
      WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile
      ELSE (concat('(', current_setting('app.user_id'::text, true), ')'))::user_profile
    END
  ),
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile NULL DEFAULT (
    CASE
      WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile
      ELSE (concat('(', current_setting('app.user_id'::text, true), ')'))::user_profile
    END
  )
);

CREATE INDEX IF NOT EXISTS idx_materials_type ON social_materials (type);
CREATE INDEX IF NOT EXISTS idx_materials_group ON social_materials (group_name);
CREATE INDEX IF NOT EXISTS idx_materials_created_at ON social_materials (_created_at DESC);

-- ------------------------------------------------------------
-- 7. 发布排期表（存量表，当前代码未使用，仅保留结构）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS social_publish_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid NOT NULL,
  platform varchar(32) NOT NULL,
  account_id uuid NULL,
  planned_date date NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'pending',
  published_at timestamptz(3) NULL,
  actual_url text NULL,
  note text NULL,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile NULL DEFAULT (
    CASE
      WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile
      ELSE (concat('(', current_setting('app.user_id'::text, true), ')'))::user_profile
    END
  ),
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile NULL DEFAULT (
    CASE
      WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile
      ELSE (concat('(', current_setting('app.user_id'::text, true), ')'))::user_profile
    END
  ),
  CONSTRAINT social_publish_plans_content_id_fkey
    FOREIGN KEY (content_id) REFERENCES social_contents(id) ON DELETE CASCADE,
  CONSTRAINT social_publish_plans_account_id_fkey
    FOREIGN KEY (account_id) REFERENCES social_accounts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_plans_planned_date
  ON social_publish_plans (planned_date);

-- ============================================================
-- 8. 平台作品明细表（无头抓取各平台创作中心的真实作品数据）
-- ============================================================
CREATE TABLE IF NOT EXISTS social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  platform varchar(32) NOT NULL,
  platform_post_id varchar(200) NOT NULL,
  title varchar(300) NOT NULL DEFAULT '',
  cover_url text NULL,
  post_url text NULL,
  views integer NOT NULL DEFAULT 0,
  likes integer NOT NULL DEFAULT 0,
  comments integer NOT NULL DEFAULT 0,
  favorites integer NOT NULL DEFAULT 0,
  watch_rate numeric(6,2) NULL,
  followers_delta integer NOT NULL DEFAULT 0,
  published_at timestamptz(3) NULL,
  raw jsonb NULL,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile NULL DEFAULT (
    CASE
      WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile
      ELSE (concat('(', current_setting('app.user_id'::text, true), ')'))::user_profile
    END
  ),
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile NULL DEFAULT (
    CASE
      WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile
      ELSE (concat('(', current_setting('app.user_id'::text, true), ')'))::user_profile
    END
  ),
  CONSTRAINT social_posts_account_id_fkey
    FOREIGN KEY (account_id) REFERENCES social_accounts(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_account_post
  ON social_posts (account_id, platform_post_id);
CREATE INDEX IF NOT EXISTS idx_posts_published_at ON social_posts (published_at);

-- ============================================================
-- 幂等迁移：为已存在的 social_accounts 补 OAuth 授权字段
-- （新建库由上方 CREATE TABLE 直接包含；旧库通过 ADD COLUMN IF NOT EXISTS 补齐）
-- ============================================================
ALTER TABLE social_accounts
  ADD COLUMN IF NOT EXISTS platform_uid varchar(100),
  ADD COLUMN IF NOT EXISTS avatar text,
  ADD COLUMN IF NOT EXISTS access_token text,
  ADD COLUMN IF NOT EXISTS refresh_token text,
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz(3),
  ADD COLUMN IF NOT EXISTS online boolean,
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz(3);

-- 幂等迁移：数据页作品同步时间（10 分钟缓存刷新判据）
ALTER TABLE social_accounts
  ADD COLUMN IF NOT EXISTS last_data_synced_at timestamptz(3);

-- ============================================================
-- 幂等迁移：发布单 + 发布目标（发布子系统）
-- ============================================================
CREATE TABLE IF NOT EXISTS social_publish_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publish_type varchar(16) NOT NULL,
  title varchar(300) NOT NULL DEFAULT '',
  body text NULL,
  topic varchar(500) NULL,
  location varchar(200) NULL,
  cover_file_key text NULL,
  media_file_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  platform_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  visibility varchar(16) NOT NULL DEFAULT 'public',
  status varchar(16) NOT NULL DEFAULT 'draft',
  scheduled_at timestamptz(3) NULL,
  published_at timestamptz(3) NULL,
  error text NULL,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile NULL,
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile NULL
);
CREATE INDEX IF NOT EXISTS idx_publish_tasks_status ON social_publish_tasks (status);
CREATE INDEX IF NOT EXISTS idx_publish_tasks_scheduled ON social_publish_tasks (scheduled_at);
CREATE INDEX IF NOT EXISTS idx_publish_tasks_created ON social_publish_tasks (_created_at);

CREATE TABLE IF NOT EXISTS social_publish_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES social_publish_tasks(id) ON DELETE CASCADE,
  platform varchar(32) NOT NULL,
  account_id uuid NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  status varchar(16) NOT NULL DEFAULT 'pending',
  error text NULL,
  platform_post_id varchar(200) NULL,
  post_url text NULL,
  published_at timestamptz(3) NULL,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile NULL,
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile NULL
);
CREATE INDEX IF NOT EXISTS idx_publish_targets_task ON social_publish_targets (task_id);
CREATE INDEX IF NOT EXISTS idx_publish_targets_status ON social_publish_targets (status);
