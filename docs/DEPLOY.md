# 部署说明

## 唯一部署通道

Cloudflare Pages Git 集成。push 到 `main` → Cloudflare 自动拉取、构建、部署。

- 项目名：`ziji-station`
- 地址：https://ziji-station.pages.dev
- 构建命令：`pnpm build`
- 输出目录：`dist`
- 环境变量：在 Cloudflare Pages 控制台配置（`PUBLIC_SUPABASE_URL`、`PUBLIC_SUPABASE_ANON_KEY`）

## 为什么不用 GitHub Actions

该项目是 Cloudflare Pages 的 **Git 集成**类型（`source.type: "github"`），
Cloudflare 自己负责构建和部署。`wrangler pages deploy` 只能用于 Direct Upload 项目，
对 Git 集成项目会失败。原 `.github/workflows/deploy.yml` 已归档至 `_attic/github-workflows/`。

## 验证部署

```bash
# 查最近部署状态
curl -s -H "Authorization: Bearer $CF_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/ziji-station/deployments?per_page=3"
```

或直接访问 https://ziji-station.pages.dev 查看。

## 数据库

邀请码相关 SQL 见 `docs/invite_codes.sql`，需在 Supabase SQL Editor 执行一次。
