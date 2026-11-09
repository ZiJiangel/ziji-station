-- 请复制以下所有代码，去 Supabase 的 SQL Editor 里点击 Run
drop table if exists pages;
drop table if exists profiles;
drop table if exists articles;
drop table if exists moments;
drop table if exists comments;

-- 1. 用户表
create table profiles (
  id uuid primary key,
  username text unique not null,
  created_at timestamp with time zone default now()
);

-- 2. 画布表
create table pages (
  user_id uuid references profiles(id) on delete cascade primary key,
  draft_data jsonb,
  published_data jsonb,
  is_public boolean default false,
  updated_at timestamp with time zone default now()
);

-- 允许所有公开操作（因为你只是个人用，先把逻辑跑通）
alter table profiles enable row level security;
alter table pages enable row level security;
create policy "public_profiles" on profiles for all using (true) with check (true);
create policy "public_pages" on pages for all using (true) with check (true);

-- 3. 文章表
create table articles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  title text not null,
  content text not null,
  created_at timestamp with time zone default now()
);
alter table articles enable row level security;
create policy "public_articles" on articles for all using (true) with check (true);