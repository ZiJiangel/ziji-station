# 数据库对齐说明（2026-11-18）

## 目标

让仓库脚本能重建线上库，消除「线上有、仓库无」的漂移。

## 已完成

`001_baseline_live.sql` — 以线上 schema 导出为准的 8 张表结构。已通过 anon key
只读探测逐列确认：

- `likes` 表在线上存在（anon 无 SELECT 权限，权限错误为 `permission denied for table likes`）
- `articles/moments/comments.deleted_at` 存在
- `profiles.role / banned_at / display_name` 存在
- `game_rooms.updated_at` 存在
- `invite_codes` anon 无读权限，符合预期

## 与旧 `docs/schema.sql` 的关键差异

| 项 | 旧文档 | 线上（本次对齐） |
|---|---|---|
| 表数量 | 6 | 8（多 `likes`、`invite_codes`） |
| `profiles` 列 | 5 | 8（多 `display_name`、`role`、`banned_at`） |
| 软删除列 | 无 | `articles/moments/comments` 均有 `deleted_at` |
| `game_rooms.updated_at` | 无 | 有 |
| 外键 `on delete cascade` | 全部有 | **全部没有** |
| RLS 策略 | `rls_policies.sql` | `002_rls_live.sql`（41 条，含 profiles 收紧与管理员策略） |

> 外键差异是实际功能问题：`admin.astro` 调用 `deleteUser()` 时，只要目标用户有
> 任一关联行，删除会被外键约束拒绝。修复方向见全量审计报告第 2.2 节。

## RLS 与函数（已对齐）

2026-11-18 由用户在 SQL Editor 只读导出，已固化：

- `002_rls_live.sql` — 线上 41 条 RLS 策略，逐条原样记录
- `003_functions_live.sql` — 线上 12 个函数的签名与权限，函数体来源指向仓库已有脚本

### 线上确认的关键事实

- `profiles` 的 SELECT 是 `to authenticated using (true)`，**anon 不可读**。
  旧 `rls_policies.sql:6-7` 写的是 public 可读，线上已经收紧。
- **提权漏洞确认成立**：`profiles` 有两条 UPDATE 策略
  （`Users can update own profile.` 与 `profiles_update_self`），均只按 `id` 限制行、
  无列级约束。任何登录用户可执行 `update profiles set role='admin' where id=auth.uid()`。
  `admin_update_profiles` 是并列的 PERMISSIVE 策略，不构成约束。
- **封禁绕过确认成立**：线上没有任何策略判断 `banned_at`。封禁后用户仍能登录并读取
  全部 authenticated 数据，只有前端 `assertNotBanned()` 在拦。
- `game_rooms` 只有房主能 UPDATE `state`，且无 DELETE 策略。非房主走子必须走
  security definer 的 `fc_*` RPC，客户端直接 `.update({state})` 会被 RLS 拒绝。
- `invite_codes` 无 INSERT/UPDATE 策略，写入只能走 RPC；anon 读被 `using(false)` 拒绝。
- `consume_invite_code` 有两个重载（单参 / 双参），均为 security definer。
- `fc_roll_dice / fc_skip_turn / fc_move_piece` 在线上存在，其中 `fc_roll_dice`
  函数体有 `jsonb_set` 类型错误（42883），掷骰必失败。
- `likes` 表 SELECT 是 `using(true)`，含匿名可读。

### 仍未导出

5 个函数体原文（`fc_*`、`handle_new_user`、`rls_auto_enable`）无法从 anon 侧导出，
`003_functions_live.sql` 里给了导出 SQL。联机重做后 `fc_*` 会被服务端裁决取代，
届时直接 drop，无需恢复。

## 文件权威顺序

- **表结构唯一权威**：`001_baseline_live.sql`（线上现状）
- **历史参考**：`000_schema_legacy.sql`（旧 `docs/schema.sql` 的副本，仅用于查差异，不要执行）
- 原 `docs/schema.sql` 已过时，后续改动请只改 `001_baseline_live.sql`，避免再次分叉。

## 使用顺序（重建库时）

1. `001_baseline_live.sql` — 表结构
2. `002_rls_live.sql` — RLS 策略
3. `docs/invite_codes.sql` — 邀请码函数（线上已确认存在且工作）
4. `docs/admin.sql` + `docs/admin_v2.sql` — 管理员函数（线上已确认存在）
5. 联机重做时再决定 `fc_*` 是恢复还是 drop，见 `003_functions_live.sql`

## 注意

本目录记录的是**现状**，不是建议状态。已知安全问题（提权、封禁绕过、邀请码可复用、
XSS）不在对齐文件里修复，避免把「对齐」和「改造」混在一起。修复会单独提交迁移文件。
