-- ═══════════════════════════════════════════════
-- 管理后台 v2 · 封禁、删号、邀请码管理
-- 在 Supabase SQL Editor 执行
-- ═══════════════════════════════════════════════

-- 1. profiles 增加封禁标记
alter table public.profiles add column if not exists banned_at timestamptz;

-- 2. 管理员删除用户（级联删除 auth.users 以及所有关联数据）
create or replace function public.admin_delete_user(target_uid uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception '需要管理员权限';
  end if;
  if target_uid = auth.uid() then
    raise exception '不能删除自己的账号';
  end if;

  delete from auth.users where id = target_uid;
  return true;
end;
$$;

revoke all on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- 3. 管理员封禁 / 解封用户
-- 注意：这里是在 profiles 表打标记，前端在 login 时校验。auth.users 层面依然可以登录，
-- 但后续的所有数据拉取可以按需在 RLS 拦截，或仅前端拦截（朋友小站足够）。
create or replace function public.admin_ban_user(target_uid uuid, ban boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '需要管理员权限';
  end if;
  if target_uid = auth.uid() then
    raise exception '不能封禁自己';
  end if;

  update public.profiles
     set banned_at = case when ban then now() else null end
   where id = target_uid;
  return true;
end;
$$;

revoke all on function public.admin_ban_user(uuid, boolean) from public;
grant execute on function public.admin_ban_user(uuid, boolean) to authenticated;

-- 4. 邀请码管理权限
-- 允许普通用户作废自己创建的邀请码
drop policy if exists "invite_delete_own" on public.invite_codes;
create policy "invite_delete_own" on public.invite_codes
  for delete to authenticated using (created_by = auth.uid());

-- 允许管理员作废任何邀请码
drop policy if exists "admin_delete_invites" on public.invite_codes;
create policy "admin_delete_invites" on public.invite_codes
  for delete to authenticated using (public.is_admin());
