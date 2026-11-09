-- ==========================================
-- 一、 用户与主页表
-- ==========================================
-- 1. 用户资料表
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null check (username ~ '^[a-z0-9_]{3,20}$'),
  bio text,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table profiles enable row level security;

-- 2. 画布主页表
create table pages (
  user_id uuid references profiles(id) on delete cascade primary key,
  draft_data jsonb,
  published_data jsonb,
  is_public boolean default false,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table pages enable row level security;

-- ==========================================
-- 二、 内容层表 (文章、动态、相册)
-- ==========================================
-- 3. 长文章表
create table articles (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  title text not null,
  content text not null,
  summary text,
  cover_url text,
  is_public boolean default true,
  published_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table articles enable row level security;
create index idx_articles_user on articles(user_id);

-- 4. 动态（碎碎念）表
create table moments (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  content text check (char_length(content) <= 300) not null,
  images jsonb, -- 存放 Tigris 图片 URL 数组
  is_public boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table moments enable row level security;
create index idx_moments_user on moments(user_id);

-- ==========================================
-- 三、 互动与游戏表
-- ==========================================
-- 5. 评论表
create table comments (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  target_id uuid not null, -- 关联的文章/动态/主页 ID
  target_type text not null check (target_type in ('article', 'moment', 'page')),
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table comments enable row level security;

-- 6. 游戏房间表 (进行中才会被查询)
create table game_rooms (
  id uuid default gen_random_uuid() primary key,
  game_type text check (game_type in ('ludo', 'doudizhu', 'monopoly')),
  host_id uuid references profiles(id) on delete cascade not null,
  status text default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  state jsonb, -- 游戏快照
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table game_rooms enable row level security;
