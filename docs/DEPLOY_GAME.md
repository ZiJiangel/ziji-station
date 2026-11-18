# 飞行棋联机部署说明

## 已部署（2026-11-18）

- Worker：`fq-game`
- 地址：`https://fq-game.<账号>.workers.dev`（实际地址已写入 `Layout.astro` 的 `window.__FQ_GAME_WORKER__`，无需手动配置）
- 版本：`2d5cf6fa-e487-4d63-9f12-c67d422960cf`
- 地址已注入 `Layout.astro` 的 `window.__FQ_GAME_WORKER__`，构建产物中已确认。
- 普通用户无需任何配置；本地开发默认连 `127.0.0.1:8787`。

重新部署的命令（本机 esbuild 被锁定，须用独立 wrangler）：

```bash
CLOUDFLARE_API_TOKEN=<token> /tmp/fq-wrangler/node_modules/.bin/wrangler deploy -c wrangler.game.toml
```

## 架构

```
浏览器 ──WebSocket──> fq-game Worker ──> 每个房间一个 Durable Object
                                            ├── AuthoritySession（服务端权威）
                                            ├── engine.mjs（规则裁决）
                                            └── DO SQLite（对局状态持久化）
```

- 服务端完全权威：客户端只发意图（`roll` / `move`），规则由 `worker/engine.mjs` 在服务端执行。
- 状态传输用**全量快照 + seq**，客户端丢弃重复/倒退帧，不用增量合并。
- 断线重连：重连后服务端下发全量快照；客户端也可主动 `snapshotRequest`。
- 房间空置 30 分钟自毁（`alarm`），断线宽限 5 分钟。

## 部署 Worker

```bash
# 首次部署会创建 Durable Object namespace（wrangler.game.toml 里的 migrations v1）
pnpm exec wrangler deploy -c wrangler.game.toml
```

部署成功后记下 Worker 地址，例如 `https://fq-game.<你的账号>.workers.dev`。

## 前端指向 Worker

三种方式，任选其一：

1. **临时（本机调试）**：浏览器控制台执行
   ```js
   localStorage.setItem('fq_game_worker', 'https://fq-game.xxx.workers.dev')
   ```
2. **页面注入**：在 `Layout.astro` 里加 `<script is:inline>window.__FQ_GAME_WORKER__='...'</script>`
3. **同域路由**：把 Worker 挂到站点同域，前端默认走 `location.origin`。

## 本地联机调试

```bash
# 终端 1：Worker
pnpm exec wrangler dev -c wrangler.game.toml --port 8787

# 终端 2：站点（另一个端口）
pnpm dev -- --port 4321
```

前端在本地会自动连 `127.0.0.1:8787`。

> 注意：本项目 `package.json` 把 esbuild 锁在 `0.21.5`（Astro 需要），
> 而 wrangler 4.158 要求 `es2024` target，直接用 `pnpm exec wrangler dev`
> 会报 `Invalid target "es2024"`。本地调试请用独立安装的 wrangler：
> ```bash
> mkdir -p /tmp/fq-wrangler && cd /tmp/fq-wrangler
> npm init -y && npm i wrangler@4.158.0
> /tmp/fq-wrangler/node_modules/.bin/wrangler dev \
>   -c D:/project/MyselfWeb/FQ/wrangler.game.toml --port 8787
> ```

## 玩法入口

- `/arcade` → 飞行棋「去玩」→ 单机版（原 `public/ludo/`，不依赖服务器）
- 房间页 `/room/:id` 默认单机视图，右上角切到**联机视图**
- 两人进入同一房间后服务端自动开局，各自点「掷骰子」/可移动的棋子

## 已验证

- 权威层：非法意图拒绝、掷骰→移动流程、seq 递增、序列化恢复、回放留档
- Worker HTTP：创建房间、两人加入、状态读取
- Worker 消息：双人连接、自动开局、颜色分配、`roll` 意图经服务端裁决后广播全量快照给两端
- 站点构建：通过

## 已知边界

- 目前只实现飞行棋；斗地主/大富翁仍显示旧组件，需在 arcade 标注为筹备中
- AI 托管、观战、回放、聊天尚未迁移到新 Worker（旧协议里有，属于下一阶段）
- 房间列表接口 `/lobby/rooms` 暂返回空，房间创建后需通过 Supabase `game_rooms` 或分享链接进入
- 旧 `fc_*` RPC 仍在线上，掷骰有 bug；新方案不依赖它们，后续可 drop
- `worker/engine.mjs` 与 `public/ludo/shared/engine.mjs` 是两份拷贝，改动需同步
