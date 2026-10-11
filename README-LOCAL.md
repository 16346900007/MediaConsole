# 本地初始化指南

自媒体多平台管理工具（单人使用）：管理抖音、小红书、B站、视频号、微博、快手、YouTube 7 个平台的账号矩阵、内容创作与多平台适配、素材库、数据复盘看板。

技术栈：NestJS 10 + React 19 + Drizzle ORM / PostgreSQL + Tailwind CSS 4 + shadcn/ui。

---

## 1. 环境要求

| 依赖 | 版本 |
|---|---|
| Node.js | >= 22.0.0 |
| npm | >= 10.0.0 |
| PostgreSQL（仅自建库时需要） | >= 14 |

## 2. 目录结构

```
├── client/               # React 前端
│   └── src/
│       ├── pages/        # social-dashboard(工作台) / social-accounts(账号)
│       │                 # social-contents(内容) / social-analytics(数据)
│       │                 # social-materials(素材库)
│       ├── api/          # 前端请求出口（axiosForBackend）
│       └── components/   # ui(shadcn) / business-ui(平台组件，勿改)
├── server/               # NestJS 后端
│   ├── modules/social/   # 单模块，Controller/Service 按域拆分
│   │                     # (accounts / contents / metrics / materials)
│   └── database/
│       └── schema.ts     # Drizzle 表定义（生成产物，禁止手改）
├── shared/               # 前后端共享契约
│   ├── api.interface.ts  # 接口类型定义（改接口先改这里）
│   └── platforms.ts      # 平台常量（名称、后台 URL、适配提示）
├── db/
│   └── init.sql          # 本地 Postgres 建表脚本（7 张表）
└── scripts/              # dev / build 脚本
```

## 3. 初始化步骤

```bash
# 1. 安装依赖
npm install

# 2. 启动开发环境（前后端同时起）
npm run dev
```

`npm run dev` 在本地会先执行 `miaoda app sync` 同步平台脚本（依赖妙搭账号登录态），然后以本地模式启动：后端 NestJS watch + 前端 Vite dev server。

> 数据库连接由平台 SDK（`@lark-apaas/fullstack-nestjs-core` 注入的 `DRIZZLE_DATABASE`）提供，默认连接妙搭托管 Postgres，无需手写连接串。用户身份来自 `req.userContext`，同样由平台中间件注入。

## 4. 数据库

### 4.1 使用平台托管库（默认，零配置）

不做任何事即可用，`db/init.sql` 仅作参考。

### 4.2 自建本地 Postgres（可选）

```bash
createdb social
psql -d social -f db/init.sql
```

`init.sql` 建出与线上同构的 7 张表：

| 表 | 用途 |
|---|---|
| `social_accounts` | 平台账号矩阵 |
| `social_contents` | 内容主表 |
| `social_content_variants` | 内容多平台适配 |
| `social_metrics` | 账号按日数据指标 |
| `social_material_groups` | 素材分组 |
| `social_materials` | 素材库 |
| `social_publish_plans` | 发布排期（存量表，当前代码未使用） |

注意：切换到自建库需在 NestJS 侧替换 `DRIZZLE_DATABASE` provider 的注入实现（平台默认注入逻辑在 `@lark-apaas/fullstack-nestjs-core` 内），本项目代码未包含该替换逻辑。

### 4.3 审计列约定

所有表带 4 个系统审计列，业务代码不写它们：

- `_created_at` / `_updated_at`：timestamptz，默认 `CURRENT_TIMESTAMP`
- `_created_by` / `_updated_by`：`user_profile` 复合类型，本地定义等价于 `(user_id text)`
  - 读取用 `(col).user_id` 解引用
  - 写入用 `ROW('<user_id>')::user_profile`

Drizzle 映射见 `server/database/schema.ts`（`customTimestamptz` / `userProfile` customType）。

## 5. 改库结构流程

1. 写 DDL（参考 `db/init.sql` 的表结构），在线上用妙搭的 SQL 执行通道执行
2. 重新生成 schema：
   ```bash
   npm run gen:db-schema
   ```
3. 再编写引用新表/新列的 TS 代码（`schema.ts` 是生成产物，禁止手改）

## 6. 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 本地开发（前后端同时） |
| `npm run type:check` | 前后端 TS 类型检查 |
| `npm run lint` | ESLint 检查 |
| `npm run build` | 构建产物 |
| `npm run gen:db-schema` | 由数据库重新生成 `server/database/schema.ts` |

## 7. 开发约定速记

- 接口契约集中在 `shared/api.interface.ts`：**先定义类型，再写后端实现**，属性用 camelCase
- 后端路由前缀 `api/social/*`，写接口加 `@NeedLogin()`
- 前端请求必须用 `axiosForBackend`（`client/src/api/social.ts`），禁止裸 `fetch`
- 前端禁止改 `client/src/components/business-ui/*`、`client/src/app.tsx` 的平台 Provider、`server/modules/view/`
- 设计规范（深蓝 `#0033A0` 强调色、零圆角、卡片顶部 3px 强调线等）见 `AGENTS.md`，改页面先读它

## 8. 文件存储（磁盘 / S3 双模式）

统一文件服务（`server/modules/social/files.service.ts`）支持两种模式，通过环境变量切换，接口不变：

- **磁盘模式（默认，本地开发）**：不设置 S3 变量时启用，文件落在 `%APPDATA%\SocialManager\uploads\{bucket}`
- **S3 模式（服务器部署）**：设置以下环境变量后启用，文件存到 SILO/MinIO（S3 兼容）对象存储，本地不占用系统存储

| 环境变量 | 说明 | 示例 |
|---|---|---|
| `S3_ENDPOINT` | 对象存储 S3 API 地址（不含路径） | `http://<内网IP>:19000` |
| `S3_ACCESS_KEY` | 访问密钥 AK | - |
| `S3_SECRET_KEY` | 访问密钥 SK | - |
| `S3_REGION` | 区域（可选，默认 us-east-1） | `us-east-1` |
| `S3_BUCKET_PREFIX` | 桶名前缀（可选，默认 media-console） | `media-console` |

桶约定（自动带前缀）：

| 桶 | 用途 | 生命周期 |
|---|---|---|
| `{prefix}-publish-tmp` | 发布流程临时文件（视频/图片/封面） | 发布完成后自动删除，不占用存储 |
| `{prefix}-materials` | 素材库文件 | 持久保留 |

> S3 模式下发布执行器通过 `FilesService.toLocalFile()` 把远端文件下载到系统临时目录再喂给 playwright（`setInputFiles` 需要本地文件），发布成功后临时文件随桶内对象一并删除。

示例（服务器部署环境变量）：

```env
S3_ENDPOINT=http://<内网IP>:19000
S3_ACCESS_KEY=<AK>
S3_SECRET_KEY=<SK>
S3_REGION=us-east-1
S3_BUCKET_PREFIX=media-console
```
