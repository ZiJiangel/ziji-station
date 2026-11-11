docs/invite_codes.sql 已读完，共 87 行，都在这儿：

1: -- ═══════════════════════════════════════════════
2: -- 邀请码系统 · 在 Supabase SQL Editor 执行
3: -- ═══════════════════════════════════════════════
4: 
5: create table if not exists public.invite_codes (
6:   code       text primary key,
7:   created_by uuid references auth.users(id) on delete set null,
8:   created_at timestamptz not null default now(),
9:   expires_at timestamptz not null default now() + interval '7 days',
10:   used_by    uuid references auth.users(id) on delete set null,
11:   used_at    timestamptz,
12:   note       text
13: );
14: 
15: create index if not exists invite_codes_unused_idx
16:   on public.invite_codes (code)
17:   where used_at is null;
18: 
19: alter table public.invite_codes enable row level security;
20: 
21: -- 已登录用户可读自己创建的码（查看/管理）
22: drop policy if exists "invite_read_own" on public.invite_codes;
23: create policy "invite_read_own" on public.invite_codes
24:   for select to authenticated
25:   using (created_by = auth.uid());
26: 
27: -- 未登录不能读（防批量探测）
28: drop policy if exists "invite_no_anon_read" on public.invite_codes;
29: create policy "invite_no_anon_read" on public.invite_codes
30:   for select to anon
31:   using (false);
32: 
33: -- ═══ 原子消费：校验 + 标记已用，一个事务内完成 ═══
34: -- 匿名可调用（注册时还没登录），但只能消费未用过且未过期的码
35: create or replace function public.consume_invite_code(p_code text)
36: returns boolean
37: language plpgsql
38: security definer
39: set search_path = public
40: as $$
41: declare
42:   v_ok boolean;
43: begin
44:   update public.invite_codes
45:      set used_at = now()
46:    where code = p_code
47:      and used_at is null
48:      and expires_at > now()
49:   returning true into v_ok;
50: 
51:   return coalesce(v_ok, false);
52: end;
53: $$;
54: 
55: revoke all on function public.consume_invite_code(text) from public;
56: grant execute on function public.consume_invite_code(text) to anon, authenticated;
57: 
58: -- ═══ 生成邀请码（仅登录用户）═══
59: create or replace function public.create_invite_code(p_note text default null)
60: returns text
61: language plpgsql
62: security definer
63: set search_path = public
64: as $$
65: declare
66:   v_code text;
67:   v_uid  uuid := auth.uid();
68: begin
69:   if v_uid is null then
70:     raise exception '需要登录';
71:   end if;
72: 
73:   loop
74:     v_code := 'ZJ-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
75:     exit when not exists (select 1 from public.invite_codes where code = v_code);
76:   end loop;
77: 
78:   insert into public.invite_codes (code, created_by, note)
79:   values (v_code, v_uid, p_note);
80: 
81:   return v_code;
82: end;
83: $$;
84: 
85: revoke all on function public.create_invite_code(text) from public;
86: grant execute on function public.create_invite_code(text) to authenticated;
87: 

(到底啦，一共 87 行)

-- ═══ 只读校验（不消费）· 供注册流程预检 ═══
create or replace function public.verify_invite_code(p_code text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.invite_codes
     where code = p_code
       and used_at is null
       and expires_at > now()
  );
$$;

revoke all on function public.verify_invite_code(text) from public;
grant execute on function public.verify_invite_code(text) to anon, authenticated;

-- ═══ 记录使用者（消费后回填）═══
create or replace function public.consume_invite_code(p_code text, p_uid uuid default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  update public.invite_codes
     set used_at = now(),
         used_by = coalesce(p_uid, used_by)
   where code = p_code
     and used_at is null
     and expires_at > now()
  returning true into v_ok;

  return coalesce(v_ok, false);
end;
$$;

revoke all on function public.consume_invite_code(text, uuid) from public;
grant execute on function public.consume_invite_code(text, uuid) to anon, authenticated;
