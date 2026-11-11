docs/invite_codes.sql 已读完，共 87 行，都在这儿：

-- ═══════════════════════════════════════════════
-- 邀请码系统 · 在 Supabase SQL Editor 执行
-- ═══════════════════════════════════════════════

create table if not exists public.invite_codes (
  code       text primary key,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_by    uuid references auth.users(id) on delete set null,
  used_at    timestamptz,
  note       text
);

create index if not exists invite_codes_unused_idx
  on public.invite_codes (code)
  where used_at is null;

alter table public.invite_codes enable row level security;

-- 已登录用户可读自己创建的码（查看/管理）
drop policy if exists "invite_read_own" on public.invite_codes;
create policy "invite_read_own" on public.invite_codes
  for select to authenticated
  using (created_by = auth.uid());

-- 未登录不能读（防批量探测）
drop policy if exists "invite_no_anon_read" on public.invite_codes;
create policy "invite_no_anon_read" on public.invite_codes
  for select to anon
  using (false);

-- ═══ 原子消费：校验 + 标记已用，一个事务内完成 ═══
-- 匿名可调用（注册时还没登录），但只能消费未用过且未过期的码
create or replace function public.consume_invite_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  update public.invite_codes
     set used_at = now()
   where code = p_code
     and used_at is null
     and expires_at > now()
  returning true into v_ok;

  return coalesce(v_ok, false);
end;
$$;

revoke all on function public.consume_invite_code(text) from public;
grant execute on function public.consume_invite_code(text) to anon, authenticated;

-- ═══ 生成邀请码（仅登录用户）═══
create or replace function public.create_invite_code(p_note text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_uid  uuid := auth.uid();
begin
  if v_uid is null then
    raise exception '需要登录';
  end if;

  loop
    v_code := 'ZJ-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    exit when not exists (select 1 from public.invite_codes where code = v_code);
  end loop;

  insert into public.invite_codes (code, created_by, note)
  values (v_code, v_uid, p_note);

  return v_code;
end;
$$;

revoke all on function public.create_invite_code(text) from public;
grant execute on function public.create_invite_code(text) to authenticated;


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
