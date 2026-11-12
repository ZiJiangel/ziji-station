# 子骥的小站 · 架构与规范

## 一、基础设施

| 层 | 服务 | 免费额度 |
|---|---|---|
| 前端托管 | Cloudflare Pages（Git 集成，push 即部署） | 无限带宽 |
| 数据库 / 鉴权 / 实时 | Supabase（Postgres + RLS + Auth + Realtime） | 500MB / 5 万 MAU |
| 图床 | Supabase Storage（Tigris 二期可选） | 1GB |
| 代码托管 | GitHub（私有仓库） | 无限 |

## 二、路由

| 路径 | 类型 | 说明 |
|---|---|---|
| `/` | 静态 | 大厅（首屏 + feed 流） |
| `/login` | 静态 | 登录 / 邀请码注册 |
| `/articles` `/moments` `/gallery` | 静态 | 内容列表 |
| `/members` `/about` | 静态 | 成员、说明 |
| `/invites` | 静态 | 邀请码生成 |
| `/settings` | 静态 | 个人资料与外观 |
| `/dashboard` | 静态 | 写作台 |
| `/editor` | 静态壳 + React 岛 | 区块流编辑器 |
| `/arcade` | 静态 | 游戏厅 |
| `/[username]` | **SSR** | 用户公开主页 |
| `/post/[id]` | **SSR** | 文章阅读 |
| `/room/[id]` | **SSR** | 游戏房间 |

## 三、用户名规范

- 格式：`^[a-z0-9_]{3,20}$`
- 保留字：`admin` `api` `arcade` `circle` `login` `editor` `dashboard` `post` `_astro`

## 四、主页数据模型

`pages.draft_data` 与 `pages.published_data` 均为 `{ blocks: Block[] }`。

`Block` 类型（每块含 `id` / `type` / `visible` / `props`）：

- `profile` — 头像卡片（avatar、name、bio、status）
- `markdown` — 富文本
- `links` — 社交链接组
- `articles` — 该用户文章列表
- `moments` — 该用户动态列表
- `gallery` — 相册

## 五、编辑器交互

- 左侧添加区块；中间实时预览，支持上移 / 下移 / 隐藏 / 删除；右侧属性面板
- 自动保存：停止操作 1.2s 后写入 `draft_data`
- 发布：`draft_data` 复制到 `published_data`，设 `is_public = true`

## 六、安全策略

- **RLS**：全表启用。`draft_data` 仅本人可读写；`published_data` 匿名可读需 `is_public = true`
- **XSS**：用户输入渲染前过 DOMPurify；Markdown 走标签白名单
- **URL 校验**：图片 / 链接仅允许 `http:` `https:` `mailto:`
- **邀请制**：`invite_codes` 表 + RPC。校验在数据库端原子完成，前端不含明文邀请码。流程为 `verify_invite_code` → `signUp` → `consume_invite_code`，注册失败不烧码
- **不采集 PII**：`profiles` 不含邮箱、手机号、真实姓名

## 七、设计系统

**主题 = 色相 × 明暗**，两个属性独立，组合成 6 种外观。

| 属性 | 取值 | 作用 |
|---|---|---|
| `data-theme` | `ink` / `moss` / `ember` | 色相家族 |
| `data-mode` | `light` / `dark` | 明度锚点 |

- **令牌唯一来源**：`src/styles/tokens.css`。所有颜色由 `--hue` 经 OKLCH 派生
- **加主题**：加一行 `[data-theme="x"] { --hue: N; }`
- **字体**：`Newsreader`（标题衬线）/ `Inter`（正文）/ `JetBrains Mono`（元信息）
- **动效**：`src/components/fx/` 下 7 个 react-bits 组件，全部支持 `prefers-reduced-motion`

## 八、构建注意

编辑器（Cuckoo Code）会注入 `ESBUILD_BINARY_PATH` 指向自带的不兼容版本（0.28.2），
与项目锁定的 0.21.5 冲突，导致 `pnpm install` 的 postinstall 校验失败。

`scripts/astro-runner.mjs` 在构建前覆盖该变量指向本地 `node_modules` 里的正确二进制，
并改用 `pnpm exec astro` 而非裸 `astro`，确保任何环境下 `pnpm build` 都能跑通。

## 九、部署

唯一通道：Cloudflare Pages Git 集成。push `main` 自动构建部署。
详见 [DEPLOY.md](DEPLOY.md)。
