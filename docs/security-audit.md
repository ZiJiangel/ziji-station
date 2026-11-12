# 安全现状与攻击面评估

> 最后核对：2026-11-12。本文档区分**已实现**与**未实现**，不把计划当现状。

## 测试环境

- 数据库：Supabase (PostgreSQL 15 + PostgREST)
- 认证：Supabase Auth（JWT `sub` = `auth.uid()`）
- 暴露面：前端持 anon key 直连数据库，RLS 是唯一防线

---

## 已实现

### 1. 水平越权 — 修改他人主页

**攻击**：登录账号 A，向 `pages` 发 `PATCH /rest/v1/pages?user_id=eq.<B的UUID>`。

**结果**：拦截（0 行受影响）。

**依据**：`rls_policies.sql:18-19`
```sql
create policy "Users can update own page."
  on pages for update using (auth.uid() = user_id);
```

### 2. 隐私泄露 — 读取他人草稿

**攻击**：`GET /rest/v1/pages?select=draft_data` 遍历。

**结果**：只能拿到 `is_public = true` 的行 + 自己那条草稿。

**依据**：`rls_policies.sql:12-15`。两条 select 策略以 OR 合并。

### 3. 伪造身份 — 冒名发评论

**攻击**：`POST /rest/v1/comments`，body 里把 `user_id` 填成受害者的 UUID。

**结果**：403。

**依据**：`rls_policies.sql:34-35`，`with check (auth.uid() = user_id)`。

### 4. 邀请码泄露

**历史问题**：`INVITE_CODE = 'ZIJI2026'` 曾硬编码在 `src/lib/api.ts`，被 Astro 打进 `dist/_astro/api.*.js`，DevTools 可见。

**已修复**：迁移到数据库端（`docs/invite_codes.sql`）：

- 码存 `invite_codes` 表，RLS 禁止 anon 读取
- `verify_invite_code(text)` — 只读校验
- `consume_invite_code(text, uuid)` — 原子消费，`where used_at is null and expires_at > now()`
- `create_invite_code(text)` — 仅 `authenticated` 可调

注册流程 `verify` → `signUp` → `consume`，**注册失败不烧码**。

**残留风险**：`consume_invite_code` 对 anon 开放，可被枚举。8 位十六进制 = 43 亿组合，配合「用完即失效」，实际风险可接受。若需加固，加 IP 限流。

### 5. XSS — 渲染层

**现状**：用户输入在渲染前过 DOMPurify（`src/lib/sanitize.ts`），Markdown 走标签白名单。

**依据**：`src/lib/sanitize.ts` 导出 `sanitizeText` / `sanitizeHtml`，`api.ts` 与各页面渲染前调用。

### 6. 保留字与用户名格式

**依据**：`schema.sql:7` `check (username ~ '^[a-z0-9_]{3,20}$')` + 应用层保留字黑名单。

---

## 未实现（真实缺口）

### A. CSP 未配置

**现状**：无 `public/_headers` 文件，Cloudflare Pages 未下发任何安全响应头。

**影响**：若 DOMPurify 被绕过，注入的 `<script>` 会被浏览器执行，无第二道防线。

**修复**：新增 `public/_headers`：

```
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=()
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://wgtquypjypkaegrcsmsa.supabase.co wss://wgtquypjypkaegrcsmsa.supabase.co
```

> `'unsafe-inline'` 因 Astro 内联脚本与样式暂无法去掉。要移除需引入 nonce 或 hash，属后续优化。

### B. 无限流

**现状**：评论、动态、邀请码生成均无频率限制。

**影响**：单个已登录账号可脚本刷数据，撑大存储或刷屏。

**修复选项**：
1. Supabase Edge Function + 计数表（免费额度 50 万次/月）
2. Cloudflare Rate Limiting（免费版有限规则数）
3. 数据库层：`comments` 加触发器，检查最近 1 分钟该 `user_id` 的插入数

### C. `profiles` 全员可读

**现状**：`rls_policies.sql:6-7` `for select using (true)` —— 任何人（含匿名）可列出全部用户资料。

**影响**：你的小站是邀请制，但用户列表对未登录者完全公开，可被爬取。

**若需收紧**：改为 `to authenticated using (true)`，匿名不可读。

---

## 优先级建议

| 项 | 风险 | 成本 | 建议 |
|---|---|---|---|
| A. CSP | 中 | 低（一个文件） | **尽快做** |
| B. 限流 | 中 | 中 | 有滥用迹象时做 |
| C. profiles 收紧 | 低 | 低 | 顺手改 |

---

## 已失效的历史声明

旧版本文档（2026-11-10）曾声称：

- ❌ 「服务端配置 Content-Security-Policy」——从未配置
- ❌ 「Edge Function 限流器，每分钟最多 3 条」——从未实现
- ❌ 「生产环境改为 Supabase 邀请邮件」——实际用 `invite_codes` 表

以上三处均为计划而非现状，已在本文档中更正。
