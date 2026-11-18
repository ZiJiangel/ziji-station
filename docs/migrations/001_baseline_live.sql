-- ============================================================
-- Baseline: live Supabase schema (authoritative)
-- 对齐日期：2026-11-18
-- 来源：Supabase Dashboard schema 导出 + anon key 只读探测确认
-- 用途：从零重建生产库的表结构。函数与 RLS 见后续文件。
-- 注意：本文件以线上现状为准，不代表"正确设计"。
--       已知风险见 README.md 与全量审计报告。
-- ============================================================

-- 说明：线上所有外键均为裸 REFERENCES，没有 ON DELETE CASCADE。
-- 这与旧 docs/schema.sql 不同，此处按线上实际写入。
-- 后果：删除 profile 前必须先手动清理关联行，否则外键约束失败。

create extension if not exists pgcrypto;

-- 1. profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id),
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  bio text,
  avatar_url text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  display_name text,
  role text not null default 'member'::text check (role in ('member','admin')),
  banned_at timestamptz
);
alter table public.profiles enable row level security;

-- 2. pages
create table if not exists public.pages (
  user_id uuid primary key references public.profiles(id),
  draft_data jsonb,
  published_data jsonb,
  is_public boolean default false,
  updated_at timestamptz not null default timezone('utc'::text, now())
);
alter table public.pages enable row level security;

-- 3. articles
create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  title text not null,
  content text not null,
  summary text,
  cover_url text,
  is_public boolean default true,
  published_at timestamptz not null default timezone('utc'::text, now()),
  deleted_at timestamptz
);
alter table public.articles enable row level security;
create index if not exists idx_articles_user on public.articles(user_id);

-- 4. moments
create table if not exists public.moments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  content text not null check (char_length(content) <= 300),
  images jsonb,
  is_public boolean default true,
  created_at timestamptz not null default timezone('utc'::text, now()),
  deleted_at timestamptz
);
alter table public.moments enable row level security;
create index if not exists idx_moments_user on public.moments(user_id);

-- 5. comments
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  target_id uuid not null,
  target_type text not null check (target_type in ('article','moment','page')),
  content text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  deleted_at timestamptz
);
alter table public.comments enable row level security;
create index if not exists idx_comments_target on public.comments(target_id);

-- 6. game_rooms
create table if not exists public.game_rooms (
  id uuid primary key default gen_random_uuid(),
  game_type text check (game_type in ('ludo','doudizhu','monopoly')),
  host_id uuid not null references public.profiles(id),
  status text default 'waiting'::text check (status in ('waiting','playing','finished')),
  state jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz default now()
);
alter table public.game_rooms enable row level security;
create index if not exists idx_game_rooms_status on public.game_rooms(status);

-- 7. invite_codes
create table if not exists public.invite_codes (
  code text primary key,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_by uuid references auth.users(id),
  used_at timestamptz,
  note text
);
alter table public.invite_codes enable row level security;

-- 8. likes（线上存在，仓库旧文档完全没有，源码也未使用）
create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  target_type text not null check (target_type in ('article','moment','comment')),
  target_id uuid not null,
  created_at timestamptz not null default now()
);
alter table public.likes enable row level security;
create index if not exists idx_likes_target on public.likes(target_id);

-- RLS 策略：见 002_rls_live.sql
-- 函数：见 003_functions_live.sql
