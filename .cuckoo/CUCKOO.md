# 子骥的小站 · 项目说明

> 本文件供 AI 助手与开发者快速理解项目边界、约定与坑点。
> 修改代码前必读，尤其「开发规范」与「已知坑点」两节。

---

## 一、项目定位

只给朋友用的私有小站。写文章、发动态、传照片、玩小游戏。
不开放注册，凭邀请码进入；不采集 PII，不对外索引。

- 线上：https://ziji-station.pages.dev
- 仓库：git@github.com:ZiJiangel/ziji-station.git（私有）
- 本地路径：D:\project\MyselfWeb\FQ

---

## 二、技术栈

| 层 | 技术 |
|---|---|
| 前端 | Astro 4（output: hybrid）+ React 岛 + 原生 CSS（OKLCH 令牌） |
| 数据库 / 鉴权 | Supabase（Postgres + RLS + Auth） |
| 托管 | Cloudflare Pages（Git 集成，push main 自动构建） |
| 包管理 | pnpm（锁 esbuild 0.21.5） |

**不要使用 GitHub Actions 部署**。原部署脚本已删，push 后 Cloudflare 自动拉取构建。

---

## 三、目录结构

```
src/
  components/    React 岛与通用组件
  layouts/       Layout.astro（全局导航、主题、SEO）
  lib/           api.ts / supabase.ts / admin.ts / sanitize.ts / toast.ts / dialog.ts / upload.ts / blocks.ts
  pages/         路由（见下）
  styles/        global.css + tokens.css
scripts/
  astro-runner.mjs   包装 astro build，修正 ESBUILD_BINARY_PATH
  fix-routes.mjs     构建后修补 _routes.json（见已知坑点）
public/
  ludo/          飞行棋静态游戏（原版移植，见第六节）
docs/            schema.sql / rls_policies.sql / architecture.md 等
_attic/          旧快照与第三方源码（已 gitignore）
```

---

## 四、路由

| 路径 | 渲染 | 说明 |
|---|---|---|
| `/` | 静态 | 大厅 + feed 流 |
| `/articles` `/moments` `/gallery` | 静态 | 内容列表 |
| `/members` `/about` `/invites` `/settings` `/dashboard` | 静态 | 功能页 |
| `/editor` | 静态壳 + React 岛 | 区块流编辑器 |
| `/arcade` | 静态 | 游戏厅 |
| `/admin` | 静态 | 管理后台（需管理员角色） |
| `/[username]` | SSR | 用户公开主页 |
| `/post/[id]` | SSR | 文章阅读 |
| `/room/[id]` | SSR | 游戏房间（依赖 FlightChess.tsx） |
| `/ludo/*` | 静态 | 飞行棋游戏（纯静态，不经过 Worker） |

**hybrid 模式下新增 SSR 动态路由必须显式写 `export const prerender = false;`**，否则构建失败。

---

## 五、数据与安全

- **RLS 全表启用**。`draft_data` 仅本人读写；`published_data` 匿名可读需 `is_public = true`。
- **邀请制**：`invite_codes` 表 + RPC，流程 `verify_invite_code` → `signUp` → `consume_invite_code`，注册失败不烧码。
- **XSS**：用户内容渲染前过 DOMPurify（`src/lib/sanitize.ts`）；Markdown 走标签白名单。
- **URL 校验**：图片/链接仅允许 `http:` `https:` `mailto:`。
- **不采集 PII**：`profiles` 不含邮箱、手机号、真实姓名。
- 用户名格式 `^[a-z0-9_]{3,20}$`，保留字见 `docs/architecture.md`。

---

## 六、飞行棋（public/ludo/）

从开源项目 [ZTMYO/MinimalistAeroplaneChess](https://github.com/ZTMYO/MinimalistAeroplaneChess) 移植（GPLv3，保留 LICENSE）。

- **纯静态**：原生 JS + 内联 SVG，无构建步骤，直接放 `public/ludo/` 由 Astro 原样拷贝。
- **当前可用**：人机对战、本地多人、回放、统计。
- **在线联机未接通**：按钮已禁用并标注「即将开放」。原版依赖 Node WebSocket 服务，静态托管跑不了；如需实现，方案是 Cloudflare Durable Objects。
- **共享引擎**：`public/ludo/shared/engine.mjs` 是规则唯一真相，前端与（未来的）服务端共用。
- **棋子渲染**：`game.html` 的 `<defs>` 里定义 `#chess`（33×33），棋盘上用 `<use href="#chess" class="player-N">` 实例化，颜色靠 `currentColor` 继承。
  - ⚠️ **棋盘上的格子、跑道、箭头也带有 `class="player-N"`**。任何 `querySelectorAll('use.player-N')` 都会同时选中棋子与格子。若要只选棋子，必须加 `[href="#chess"]` 过滤。
- **动画硬编码**：`js/animation.js` 内多处写死 `setAttribute('href', '#chess')` 与 `'#checkmark'`。修改棋子外观必须先处理这些硬编码，否则会被动画覆盖。

---

## 七、已知坑点

### 1. 构建必须用 `pnpm build`
Cuckoo Code 会注入 `ESBUILD_BINARY_PATH` 指向自带的 0.28.2，但项目锁 0.21.5。
`pnpm build` 走 `scripts/astro-runner.mjs` 自动修复该环境变量。**不要裸跑 `astro build`**。

### 2. `_routes.json` 有 100 条上限
Cloudflare Pages 限制 `_routes.json` 规则总数 ≤ 100。
`scripts/fix-routes.mjs` 做了两件事：把 Windows 反斜杠转成正斜杠；把 `/ludo/` 下所有静态资源合并成单条 `/ludo/*`。
新增大量静态文件后若构建报 `Error 8000057`，检查这里。

### 3. 绝对不要 write 带行号的文本
`read` 工具返回的内容带 `1: xxx` 行号。**不能把这段直接 `write` 回去**，会污染源码。
需要整文件改写时，用 `readLines` 或确保内容来自原始文件。

### 4. 不要用原生 `confirm()`
项目统一使用 `src/lib/dialog.ts` 的 `confirmDialog()`。

### 5. 样式令牌集中在 `src/styles/tokens.css`
基于 OKLCH，支持 `data-theme`（ink/moss/ember）× `data-mode`（light/dark）6 种组合。
改配色改这一个文件，不要在组件里写死颜色。

---

## 八、开发规范（重要）

修改代码前，按 `karpathy-guidelines` 执行：

1. **想清楚再写**：显式声明假设；有多种理解就全部列出，不默默挑一个；不确定就停下来问。
2. **简洁优先**：只写解决问题的最少代码，不做未被要求的抽象与配置化。
3. **手术式改动**：只碰必须碰的行。不改相邻代码、注释、格式。不重构没坏的东西。
   判断标准：**每一行改动都能直接追溯到用户的请求。**
4. **目标驱动**：动手前给出计划，每步附验证方式；改完必须验证再宣布完成。

> 不要声称「已实现」「已修复」，除非有实际执行输出作为证据。

---

## 九、常用命令

```bash
pnpm install      # 安装依赖
pnpm dev          # 本地开发（端口 4321）
pnpm build        # 生产构建（必须用这个）
pnpm preview      # 预览构建产物
pnpm build:check  # 类型检查 + 构建
```

部署：`git push origin main`，Cloudflare Pages 自动构建。
构建状态在 Cloudflare 控制台 → Workers & Pages → ziji-station → Deployments 查看。
