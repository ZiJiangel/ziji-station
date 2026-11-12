# 子骥的小站

邀请制私人小站。写文章、发动态、贴照片，只给朋友用。

## 技术栈

- **Astro 4** — hybrid 模式，静态页预渲染 + `/[username]` SSR
- **React 18** — 编辑器与动效岛组件
- **Supabase** — Postgres + RLS + Auth + Realtime
- **Cloudflare Pages** — Git 集成自动构建部署
- **Tailwind-free** — 原生 CSS + OKLCH 令牌

## 本地开发

```bash
pnpm install
cp .env.example .env    # 填入 Supabase 凭据
pnpm dev                # http://localhost:4321
```

## 构建

```bash
pnpm build              # 输出到 dist/
```

`pnpm build` 经由 `scripts/astro-runner.mjs` 调用，该脚本会屏蔽编辑器注入的
`ESBUILD_BINARY_PATH`（指向不兼容版本时会破坏构建），并强制解析本地 esbuild。

## 部署

**唯一通道：Cloudflare Pages Git 集成。**

push 到 `main` → Cloudflare 自动拉取、构建、部署。

- 项目：`ziji-station` — https://ziji-station.pages.dev
- 构建命令：`pnpm build`
- 输出目录：`dist`
- 环境变量：在 Cloudflare Pages 控制台配置

详见 [docs/DEPLOY.md](docs/DEPLOY.md)。本项目**不使用** GitHub Actions 部署。

## 数据库

首次部署需在 Supabase SQL Editor 执行：

1. `docs/schema.sql` — 基础表结构
2. `docs/rls_policies.sql` — 行级安全策略
3. `docs/invite_codes.sql` — 邀请码系统

## 目录结构

```
src/
├── components/
│   ├── blocks/           区块渲染器（SSR）
│   ├── fx/               react-bits 动效组件
│   └── EditorApp.tsx     区块流编辑器（React 岛）
├── layouts/Layout.astro  全站外壳
├── lib/
│   ├── api.ts            数据访问层
│   ├── blocks.ts         区块类型定义
│   ├── sanitize.ts       DOMPurify + Markdown
│   ├── supabase.ts       Supabase 客户端
│   └── toast.ts          轻提示
├── pages/                路由
└── styles/
    ├── tokens.css        设计令牌（唯一来源）
    └── global.css        reset + 原子工具

public/layout.js          导航高亮、主题切换、登录态同步

docs/                     schema、RLS、部署说明
_attic/                   历史归档（不入库）
```

## 设计系统

**主题 = 色相 × 明暗**，两个属性独立：

- `data-theme` — `ink`（墨蓝）/ `moss`（苔绿）/ `ember`（陶橙）
- `data-mode` — `light` / `dark`

所有颜色由 `src/styles/tokens.css` 的 `--hue` 经 OKLCH 派生。加主题 = 加一行 `--hue`。

```css
[data-theme="ink"]  { --hue: 250; --chroma-accent: 0.15; --accent-L: 0.60; }
```

## 邀请制

注册需邀请码。码存 `invite_codes` 表，校验在数据库端原子完成（`verify_invite_code` → `signUp` → `consume_invite_code`），前端不含任何明文邀请码。

已登录用户在 `/invites` 生成，7 天有效，一次性。
