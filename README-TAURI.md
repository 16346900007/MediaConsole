# SocialManager · Tauri Windows 桌面客户端

将原「自媒体多平台管理工具」（NestJS + React 全栈 Web 应用）以 **Tauri 2** 方案封装为 Windows 桌面客户端。

## 架构

```
┌─────────────────────────────────────────────┐
│ SocialManager.exe (Tauri 2 / Rust / WebView2)│
│  1. 分配空闲端口（127.0.0.1）                 │
│  2. 首次启动解包内置后端 sidecar：            │
│     node.exe + dist/（NestJS 编译产物+裁剪依赖）│
│  3. 幂等执行 init-db.js（建表 + 平台角色）    │
│  4. 轮询就绪后创建主窗口 → http://127.0.0.1:<port>/ │
│  5. 退出时自动终止后端子进程                  │
└──────────────────────┬──────────────────────┘
                       │ 同源（前端与 API 都由 NestJS 提供）
              ┌────────▼────────┐
              │ 内置后端 (NestJS)│
              │  API /api/*     │
              │  静态页 dist/client │
              └────────┬────────┘
                       │ SUDA_DATABASE_URL
              ┌────────▼────────┐
              │ 1Panel PostgreSQL（LAN）│
              │ <内网IP>:5432/social_app │
              └─────────────────┘
```

- **前端零改动**：页面与 API 保持同源，`axiosForBackend` 的相对路径 `/api/*` 无需修改。
- **内置后端**：安装包内携带 Node.js 运行时（node.exe）与裁剪后的 NestJS 产物（单个 `backend.tar`，约 133MB），客户端启动时自动解包拉起、退出时自动清理。首次启动解包约 1-3 分钟（缓存标记 + 关键文件哨兵校验，避免被中断的部分解包被误判为完整）。
- **数据库**：连接 **1Panel 上的 PostgreSQL**（见下方配置），首次启动自动建表 + 创建平台角色（`anon_`/`authenticated_`/`service_role_`，datapaas 中间件要求），全程幂等。

## 环境要求

- Node.js ≥ 22（开发构建）
- Rust 工具链（`rustc` / `cargo`，Tauri 2 编译用）
- Windows 10/11（自带 WebView2 运行时）
- 1Panel 上的 PostgreSQL（客户端数据源，安装包不携带数据库）

## 常用命令

```bash
# 1. 准备打包资源（构建产物 + 裁剪依赖 + 暂存 dist-tauri/ + 下载 node.exe）
npm run tauri:prepare

# 2. 开发模式运行（编译 Rust + 启动客户端窗口）
npm run tauri:dev

# 3. 构建 Windows 安装包（NSIS，输出到 src-tauri/target/release/bundle/nsis/）
npm run tauri:build
```

> 现有 Web 开发/构建流程（`npm run dev` / `npm run build:prod`）不受影响。

## 关键目录

| 路径 | 说明 |
|---|---|
| `src-tauri/` | Tauri 工程（Cargo.toml、tauri.conf.json、Rust 源码、icons、capabilities） |
| `src-tauri/src/lib.rs` | sidecar 启停、端口分配、解包缓存校验（FNV-1a 标记 + 哨兵）、就绪轮询、窗口创建 |
| `scripts/tauri/prepare.ps1` | 打包准备：构建、裁剪、规整布局、打 tar、下载 Node |
| `scripts/tauri/fetch-node.ps1` | 下载 Node 运行时（缓存到 `build-tools/`，失败回退本机 node） |
| `scripts/tauri/init-db.js` | 幂等建表 + 平台角色脚本（随包分发，启动时运行） |
| `db/init.sql` | 建表 SQL（全部幂等；复合类型用 DO 块创建，PG 不支持 `CREATE TYPE IF NOT EXISTS`） |
| `dist-tauri/` | 暂存目录（`backend.tar` + `node/node.exe`），由 tauri.conf.json 打进安装包 |

## 数据库配置（重要）

后端通过环境变量 `SUDA_DATABASE_URL` 连接 PostgreSQL（Postgres 连接串）。
**当前环境（1Panel 部署）**：

```
postgres://<用户名>:<密码>@<内网IP>:5432/social_app
```

注意：

- 明文密码为 `***`，连接串中的 `%` 必须编码为 `%25`，否则 URL 解析失败。
- 用户名/密码来自 1Panel「数据库 → PostgreSQL → 连接信息」（超级用户）；若在面板改密，需同步更新下面的配置文件。
- 安装 1Panel PostgreSQL 应用时需勾选「端口外部访问」并放开 5432，客户端（另一台机器）才能经 LAN 连接。
- `init-db.js` 会以连接用户身份幂等创建平台角色（超级用户可 `SET ROLE` 到任意角色）。

配置方式（优先级从高到低）：

1. **用户级配置文件**：`%APPDATA%\SocialManager\env.local`（客户端启动时读取并注入后端进程，无需重新打包）。示例：

   ```
   # %APPDATA%\SocialManager\env.local
   SUDA_DATABASE_URL=postgres://<用户名>:<密码>@<内网IP>:5432/social_app
   ```

   注意：文件必须是 **UTF-8 无 BOM**（曾出现 BOM 污染键名的坑：`\ufeffSUDA_DATABASE_URL` 导致环境变量读不到）。

2. **打包时内置**：仓库根目录存在 `.env.local` 时不会自动带入安装包（为安全起见未做拷贝）。如需内置，请在 `dist/` 中放置 `.env.local` 后执行 `npm run tauri:prepare`。

3. **开发模式**：直接继承启动 `tauri dev` 的终端环境变量。

> 未配置 `SUDA_DATABASE_URL` 时，客户端窗口仍会打开，但接口将不可用；后端错误日志在
> `%APPDATA%\SocialManager\logs\backend.log`。

## 日志

- 后端与应用日志：`%APPDATA%\SocialManager\logs\backend.log`（追加写，随每次启动轮转重置；`init-db` 输出亦在其中）

## 常见问题

- **窗口打开但接口报错/白屏**：查看 `%APPDATA%\SocialManager\logs\backend.log`，绝大多数是
  `SUDA_DATABASE_URL` 未配置、1Panel PG 未启动或 5432 未开放外部访问。
- **报 `role "anon_" does not exist`**：首次启动的 init-db.js 会自动创建平台角色；若跳过（init.sql 缺失/连接失败），删除 `%APPDATA%\SocialManager\runtime` 后重启客户端即可重新初始化。
- **修改 Node 运行时版本**：设置环境变量 `TAURI_NODE_VERSION=v22.x.x` 后重跑 `npm run tauri:prepare`。
- **前端改动后重新验证**：`npm run build:prod`（或仅 `npm run build:client`）后再 `npm run tauri:prepare`。
- **更换应用名称/图标**：改 `src-tauri/tauri.conf.json` 的 `productName`/`identifier`，
  图标源文件 `src-tauri/app-icon.png`，改动后执行 `npx tauri icon src-tauri/app-icon.png` 重新生成。
