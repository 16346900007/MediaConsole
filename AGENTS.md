# AGENTS.md

## 应用概览

自媒体多平台管理工具（单人使用）。管理 7 个平台（抖音、小红书、B站、视频号、微博、快手、YouTube）的账号矩阵、内容创作与多平台适配、数据复盘看板。

技术栈：NestJS 10 + React 19 + Drizzle/Postgres + Tailwind + shadcn/ui。

## 技术架构

- 后端：单模块 `server/modules/social/`，Controller/Service 按域拆文件（accounts / contents / metrics），路由前缀 `api/social/*`，写接口加 `@NeedLogin()`
- 前端页面：`client/src/pages/social-dashboard`（工作台 `/`）、`social-accounts`（`/accounts`）、`social-contents`（`/contents`）、`social-analytics`（`/analytics`）
- 数据表：`social_accounts`、`social_contents`、`social_content_variants`、`social_metrics`；另有 `social_publish_plans` 表随发布排期功能下线后已无代码使用，仅存量保留
- 共享契约：`shared/api.interface.ts`（类型）；`shared/platforms.ts`（平台常量：名称、创作后台 URL、适配提示，前后端共用）
- 前端请求统一走 `client/src/api/social.ts`，使用 axiosForBackend

## 设计规范（企业蓝图式评审报告 — 最高优先级，所有页面必须精准还原）

情绪基调：专业、权威、精密、可信赖。浅灰底上白色零圆角卡片，统一顶部 3px 深蓝强调线是核心识别签名。

### 色彩（token）

| 角色 | 值 |
|---|---|
| 页面背景 | `#F4F7F9` 浅灰纯色（禁渐变、禁暖色） |
| surface | `#FFFFFF` 白色报告卡片 |
| muted | `#F8FAFC` 侧栏/辅助面板底色 |
| text | `#1A1A1A` 主要文字 |
| text-muted | `#94A3B8` 次要文字、标签、坐标轴文字 |
| accent | `#0033A0` 唯一强调色：Section 编号标签、卡片顶边线、图表主色、导航活跃态文字、顶部导航图标、表格主列 |
| accent 弱底 | `#EFF4FF` 导航活跃态背景 |
| border | `#E2E8F0` 极细 0.5px 分隔线、网格线、柱体轨道 |
| chart 蓝阶 | `#0033A0` `#0066FF` `#4D94FF` `#99C2FF` `#CCE0FF` 深→浅五级，图表本体唯一色相 |
| success | `#10B981` / 底 `#ECFDF5`（仅徽章/文字） |
| danger | `#EF4444` / 底 `#FEF2F2`（仅徽章/文字） |
| warning | `#F59E0B` / 底 `#FFFBEB`（仅徽章/文字） |

禁用色（一律清除）：黄 `#FACC15`、橙 `#F97316`、绿 `rgb(90,173,112)`、深灰 `#2D2D2D`/`#1A1A1A`、暖调渐变背景、磨砂玻璃标签、blur 光晕装饰。语义色只出现在徽章/标签/文字，禁入图表填充色。

### 排版

- Inter 全局唯一字体族；`index.css` 首行 `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');`
- 顶部导航页面名：`text-base font-semibold text-[#1A1A1A]`，配当前页图标（`h-[18px] text-[#0033A0]`）+ 1px 竖线分隔，由 Layout 统一渲染；页面内不再有独立大标题 Header
- Section 编号标签：`01. SECTION NAME` 格式，`text-[12px] font-black uppercase tracking-[0.15em] text-[#0033A0] mb-1` + 英文副标题 `text-[10px] font-medium text-[#94A3B8]`，整体 mb-6
- KPI 标签 `text-[10px] font-black uppercase tracking-tight text-[#94A3B8] mb-2`；KPI/粉丝数/月计划数等卡内大数值统一 `text-2xl font-bold text-[#1A1A1A]`；数值列 `font-mono` 右对齐
- 表头 `text-[10px] font-black uppercase text-[#94A3B8]`；表格主列 `text-sm font-bold text-[#0033A0]`；正文描述 `text-[12px] font-medium text-slate-600`；中文徽章/状态标签 `text-[12px] font-bold`；正文按钮与表单输入框统一 `text-sm`

### 形状与层次

- **report-card 签名（硬规则）**：所有白色卡片型组件（KPI 卡/明细卡/图表卡/风险卡/弹窗内容卡等）统一 `rounded-none border-t-[3px] border-t-[#0033A0] bg-white shadow-md p-6`，其余三边无边框；禁止省略顶边线、换色或换粗细
- 零圆角硬规则：卡片/Tooltip/图表容器一律 `rounded-none`；例外仅限：状态/风险标签（`rounded-sm` 2px 或 4px）、时间线节点与圆点（`rounded-full`）、柱体顶部 2px 微圆角（`borderRadius: [2,2,0,0]`）
- 分隔线统一 0.5px border 色；阴影统一 shadow-md 轻阴影，无重阴影体系
- 结论反转卡（verdict-card）：`#0033A0` 底白字，标签 `text-[11px] font-black text-white/50 uppercase tracking-[0.15em]`，主结论 `text-3xl font-black text-white`
- Hover 克制：表格行 `hover:bg-slate-50 transition-colors`、边框变色两种模式；无弹性动效、无 active:scale

### 布局

- 侧边栏：白色底 + `border-r border-[#E2E8F0]`，贴边 `sticky top-0 h-screen`；支持折叠（展开 `w-60 px-3` 图标+文字，折叠 `w-16 px-2` 仅图标，顶部 ChevronsLeft/ChevronsRight 按钮切换）；导航项 `rounded-md py-2.5 text-sm`，活跃态 `bg-[#EFF4FF] font-semibold text-[#0033A0]`，非活跃 `text-[#475569]` hover `bg-slate-100`
- 顶部导航条：`h-14 bg-white border-b border-[#E2E8F0] sticky top-0 z-20`，左侧显示当前页面图标+页面名，随路由联动
- 内容容器 `max-w-7xl mx-auto px-8 pt-8 pb-20`；Section 间 `space-y-8`（32px）；网格 `gap-8`；页底 `pb-20`
- 响应式：≥1024px 多栏（4+8 分栏/12 列）；768~1023px 两栏；<768px 单列堆叠

### 图表与数据可视化（ECharts，禁默认样式）

- 序列色仅蓝色阶五级（`#0033A0`→`#CCE0FF`）；默认/弱化序列用 `#99C2FF`/`#CCE0FF` 浅蓝，不用灰色
- x 轴标签 10px `#94A3B8`；y 轴刻度隐藏，仅留 `#E2E8F0` 网格线；grid `containLabel: true, left/right: 0, top: 20, bottom: 16`
- tooltip：白底、1px `#E2E8F0` 边框、零圆角、padding 12、文字 12px font-bold `#1A1A1A`
- legend：10px font-bold `#94A3B8`，icon `rect` 10×6，itemGap 12
- bar：barWidth 30，顶部微圆角 `[2,2,0,0]`；line：smooth false、lineWidth 2、symbol circle size 6、默认无面积填充（需要时 opacity 0.15）；pie：实心 60% 或环形 40%~60% padAngle 2、borderWidth 0
- CSS 可视化：柱图/进度条填充用蓝色阶，轨道 `#E2E8F0`/slate-100，零圆角

### 通用间距取值

内容不贴容器边缘；卡片内边距统一 `p-6`；并列元素间距用 `gap`；Section 间 `space-y-8`；父容器已给内边距时子容器不叠加。
