-- ═══════════════════════════════════════════════
-- 管理后台 · 在 Supabase SQL Editor 执行
-- 前置：profiles 已有 role 字段
-- ═══════════════════════════════════════════════

-- is_admin() —— 避免 RLS 策略里查 profiles 造成递归
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ═══ profiles：管理员可读全部 ═══
drop policy if exists "admin_read_all_profiles" on public.profiles;
create policy "admin_read_all_profiles" on public.profiles
  for select to authenticated
  using (public.is_admin());

-- ═══ profiles：管理员可改 role（但改不了别人的 username 之外无所谓）═══
drop policy if exists "admin_update_profiles" on public.profiles;
create policy "admin_update_profiles" on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ═══ 内容表：管理员可读全部（含未公开）═══
drop policy if exists "admin_read_all_articles" on public.articles;
create policy "admin_read_all_articles" on public.articles
  for select to authenticated using (public.is_admin());

drop policy if exists "admin_delete_articles" on public.articles;
create policy "admin_delete_articles" on public.articles
  for delete to authenticated using (public.is_admin());

drop policy if exists "admin_read_all_moments" on public.moments;
create policy "admin_read_all_moments" on public.moments
  for select to authenticated using (public.is_admin());

drop policy if exists "admin_delete_moments" on public.moments;
create policy "admin_delete_moments" on public.moments
  for delete to authenticated using (public.is_admin());

drop policy if exists "admin_read_all_comments" on public.comments;
create policy "admin_read_all_comments" on public.comments
  for select to authenticated using (public.is_admin());

drop policy if exists "admin_delete_comments" on public.comments;
create policy "admin_delete_comments" on public.comments
  for delete to authenticated using (public.is_admin());

-- ═══ 邀请码：管理员可读全部（RLS 已允许读自己创建的，这里放开全部）═══
drop policy if exists "admin_read_all_invites" on public.invite_codes;
create policy "admin_read_all_invites" on public.invite_codes
  for select to authenticated using (public.is_admin());
