# 子骥的小站 (Ziji Station)

基于 Astro + React + Supabase + Cloudflare Pages 的个人主页搭建平台。

## 技术栈
- **Astro 4**（hybrid 模式，静态页预渲染 + `/[username]` SSR）
- **React**（编辑器岛组件）
- **Supabase**（Postgres + RLS + Auth + Realtime）
- **Cloudflare Pages**（托管 + Functions）

## 本地开发
```bash
pnpm install
pnpm dev       # http://localhost:4321
```

## 构建
```bash
pnpm build     # 输出到 dist/
```

> 注意：`pnpm build` 内部会调用 `scripts/prebuild.mjs`，自动修正 esbuild 二进制路径（解决 Cuckoo Code 编辑器的注入问题）。

## 部署
推送到 `main` 分支自动触发 GitHub Actions：
1. `pnpm install`
2. `pnpm build`
3. `wrangler pages deploy dist`

需要在 GitHub 仓库里配置两个 secret：
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

## 数据库初始化
在 Supabase SQL Editor 执行 `docs/schema.sql`，然后执行授权语句（见 docs）。

## 目录结构
```
src/
├── components/
│   ├── blocks/          # 区块渲染器（SSR）
│   │   ├── BlockRenderer.astro
│   │   ├── ProfileBlock.astro
│   │   ├── MarkdownBlock.astro
│   │   ├── LinksBlock.astro
│   │   ├── ArticlesBlock.astro
│   │   ├── MomentsBlock.astro
│   │   └── GalleryBlock.astro
│   └── EditorApp.tsx    # 区块流编辑器（React 岛）
├── layouts/
│   └── Layout.astro
├── lib/
│   ├── api.ts           # 数据访问层
│   ├── blocks.ts        # 区块类型定义
│   ├── sanitize.ts      # DOMPurify + Markdown
│   └── supabase.ts      # Supabase 客户端
└── pages/
    ├── index.astro      # 大厅
    ├── login.astro
    ├── dashboard.astro
    ├── editor.astro
    ├── arcade.astro
    ├── [username].astro # 公开主页（SSR）
    └── post/[id].astro  # 文章阅读（SSR）
```
