# 子骥的小站 · 架构与规范文档

## 一、基础设施
- **前端托管**：Cloudflare Pages（hybrid 模式，静态页预渲染 + SSR 处理动态路由）
- **数据库 / 鉴权 / 实时**：Supabase（Postgres + RLS + Auth + Realtime）
- **图床**：Tigris（S3 兼容，二期接入）

## 二、路由
| 路径 | 类型 | 说明 |
|---|---|---|
| `/` | 静态 | 大厅（Hero + 动态流） |
| `/login` | 静态 | 邀请码登录 |
| `/dashboard` | 静态 | 内容管理（写文章） |
| `/editor` | 静态壳 + React 岛 | 区块流编辑器 |
| `/arcade` | 静态 | 游戏厅 |
| `/[username]` | **SSR** | 用户公开主页 |
| `/post/[id]` | **SSR** | 文章阅读页 |

## 三、用户名规范
- 格式：`^[a-z0-9_]{3,20}$`
- 保留字：admin、api、arcade、circle、login、editor、dashboard、post、_astro

## 四、主页数据模型

`pages.draft_data` 与 `pages.published_data` 均为 `{ blocks: Block[] }`。

`Block` 类型：
- `profile`：头像卡片（avatar、name、bio、status）
- `markdown`：富文本（Markdown）
- `links`：社交链接组
- `articles`：文章列表（拉该用户文章）
- `moments`：碎碎念列表（拉该用户动态）
- `gallery`：相册

每个 Block 有 `id`、`type`、`visible`、`props`。

## 五、编辑器交互
- 左侧：添加区块（点击即追加到末尾）
- 中间：区块列表实时预览，每个区块可上移/下移/隐藏/删除
- 右侧：选中区块的属性面板
- 自动保存：停止操作 1.2s 后写入 `draft_data`
- 发布：把 `draft_data` 复制到 `published_data` 并设 `is_public = true`

## 六、安全策略
- **RLS**：所有表启用，`draft_data` 仅本人可读写，`published_data` 匿名可读需 `is_public = true`
- **XSS**：所有用户输入在渲染前过 DOMPurify；Markdown 走白名单标签
- **URL 校验**：图片/链接只允许 `http:`、`https:`、`mailto:`
- **鉴权**：邀请制，匿名登录 + 前端邀请码，生产环境改为 Supabase 邀请邮件
- **不采集 PII**：profiles 表不含邮箱、手机号、真实姓名

## 七、视觉基调
- 深色底（`#0d0d0d` / `#1b1b1b`），主色 `#18d1ff`
- 字体：JetBrains Mono
- 圆角：卡片 16px，按钮 999px
- 动效：Astro View Transitions 淡入淡出

## 八、构建注意
本项目在 Cuckoo Code 编辑器下运行时，esbuild host 包会被编辑器注入错误的二进制路径。
`scripts/prebuild.mjs` 会在构建前动态修正 `ESBUILD_BINARY_PATH`，确保 `pnpm build` 在任何环境都能跑通。
