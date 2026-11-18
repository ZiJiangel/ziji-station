-- ============================================================
-- RLS policies: live Supabase (authoritative)
-- 对齐日期：2026-11-18
-- 来源：Supabase SQL Editor 只读查询 pg_policies 的实际输出
-- 用途：从零重建线上 RLS。按线上原样记录，不修安全问题。
-- 注意：多条 PERMISSIVE 策略以 OR 合并，以下逐条照抄线上。
-- ============================================================

-- ---------- articles ----------
drop policy if exists "Public articles are viewable by everyone." on public.articles;
create policy "Public articles are viewable by everyone."
  on public.articles for select to public using (is_public = true);

drop policy if exists "Users can manage own articles." on public.articles;
create policy "Users can manage own articles."
  on public.articles for all to public using (auth.uid() = user_id);

drop policy if exists admin_delete_articles on public.articles;
create policy admin_delete_articles
  on public.articles for delete to authenticated using (public.is_admin());

drop policy if exists admin_read_all_articles on public.articles;
create policy admin_read_all_articles
  on public.articles for select to authenticated using (public.is_admin());

drop policy if exists articles_insert_self on public.articles;
create policy articles_insert_self
  on public.articles for insert to public with check (auth.uid() = user_id);

drop policy if exists articles_select on public.articles;
create policy articles_select
  on public.articles for select to public using ((is_public = true) or (auth.uid() = user_id));

-- ---------- comments ----------
drop policy if exists "Authenticated users can insert comments." on public.comments;
create policy "Authenticated users can insert comments."
  on public.comments for insert to public with check (auth.uid() = user_id);

drop policy if exists "Comments are viewable by everyone." on public.comments;
create policy "Comments are viewable by everyone."
  on public.comments for select to public using (true);

drop policy if exists "Users can delete own comments." on public.comments;
create policy "Users can delete own comments."
  on public.comments for delete to public using (auth.uid() = user_id);

drop policy if exists admin_delete_comments on public.comments;
create policy admin_delete_comments
  on public.comments for delete to authenticated using (public.is_admin());

drop policy if exists admin_read_all_comments on public.comments;
create policy admin_read_all_comments
  on public.comments for select to authenticated using (public.is_admin());

-- ---------- game_rooms ----------
drop policy if exists "Host can insert room." on public.game_rooms;
create policy "Host can insert room."
  on public.game_rooms for insert to public with check (auth.uid() = host_id);

drop policy if exists "Host can update room." on public.game_rooms;
create policy "Host can update room."
  on public.game_rooms for update to public using (auth.uid() = host_id);

drop policy if exists "Rooms are viewable by everyone." on public.game_rooms;
create policy "Rooms are viewable by everyone."
  on public.game_rooms for select to public
  using (status = any (array['waiting'::text, 'playing'::text]));
-- 线上没有 DELETE 策略：房主无法删除房间，只能靠 service_role / 管理员函数。

-- ---------- invite_codes ----------
drop policy if exists admin_delete_invites on public.invite_codes;
create policy admin_delete_invites
  on public.invite_codes for delete to authenticated using (public.is_admin());

drop policy if exists admin_read_all_invites on public.invite_codes;
create policy admin_read_all_invites
  on public.invite_codes for select to authenticated using (public.is_admin());

drop policy if exists invite_delete_own on public.invite_codes;
create policy invite_delete_own
  on public.invite_codes for delete to authenticated using (created_by = auth.uid());

drop policy if exists invite_no_anon_read on public.invite_codes;
create policy invite_no_anon_read
  on public.invite_codes for select to anon using (false);

drop policy if exists invite_read_own on public.invite_codes;
create policy invite_read_own
  on public.invite_codes for select to authenticated using (created_by = auth.uid());
-- 线上没有 INSERT / UPDATE 策略：邀请码的写入只能通过 security definer RPC。

-- ---------- likes ----------
drop policy if exists "Likes are viewable by everyone." on public.likes;
create policy "Likes are viewable by everyone."
  on public.likes for select to public using (true);

drop policy if exists "Users can delete own likes." on public.likes;
create policy "Users can delete own likes."
  on public.likes for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can insert own likes." on public.likes;
create policy "Users can insert own likes."
  on public.likes for insert to authenticated with check (auth.uid() = user_id);

-- ---------- moments ----------
drop policy if exists "Public moments are viewable by everyone." on public.moments;
create policy "Public moments are viewable by everyone."
  on public.moments for select to public using (is_public = true);

drop policy if exists "Users can manage own moments." on public.moments;
create policy "Users can manage own moments."
  on public.moments for all to public using (auth.uid() = user_id);

drop policy if exists admin_delete_moments on public.moments;
create policy admin_delete_moments
  on public.moments for delete to authenticated using (public.is_admin());

drop policy if exists admin_read_all_moments on public.moments;
create policy admin_read_all_moments
  on public.moments for select to authenticated using (public.is_admin());

drop policy if exists moments_insert_self on public.moments;
create policy moments_insert_self
  on public.moments for insert to public with check (auth.uid() = user_id);

drop policy if exists moments_select on public.moments;
create policy moments_select
  on public.moments for select to public using ((is_public = true) or (auth.uid() = user_id));

-- ---------- pages ----------
drop policy if exists "Published pages are viewable by everyone." on public.pages;
create policy "Published pages are viewable by everyone."
  on public.pages for select to public using (is_public = true);

drop policy if exists "Users can insert own page." on public.pages;
create policy "Users can insert own page."
  on public.pages for insert to public with check (auth.uid() = user_id);

drop policy if exists "Users can update own page." on public.pages;
create policy "Users can update own page."
  on public.pages for update to public using (auth.uid() = user_id);

drop policy if exists "Users can view own draft page." on public.pages;
create policy "Users can view own draft page."
  on public.pages for select to public using (auth.uid() = user_id);

drop policy if exists pages_insert_self on public.pages;
create policy pages_insert_self
  on public.pages for insert to public with check (auth.uid() = user_id);

drop policy if exists pages_select_pub on public.pages;
create policy pages_select_pub
  on public.pages for select to public using ((is_public = true) or (auth.uid() = user_id));

drop policy if exists pages_update_self on public.pages;
create policy pages_update_self
  on public.pages for update to public using (auth.uid() = user_id);

-- ---------- profiles ----------
drop policy if exists "Profiles are viewable by authenticated users." on public.profiles;
create policy "Profiles are viewable by authenticated users."
  on public.profiles for select to authenticated using (true);

drop policy if exists "Users can update own profile." on public.profiles;
create policy "Users can update own profile."
  on public.profiles for update to public using (auth.uid() = id);

drop policy if exists admin_read_all_profiles on public.profiles;
create policy admin_read_all_profiles
  on public.profiles for select to authenticated using (public.is_admin());

drop policy if exists admin_update_profiles on public.profiles;
create policy admin_update_profiles
  on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self
  on public.profiles for insert to public with check (auth.uid() = id);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
  on public.profiles for update to public using (auth.uid() = id);

-- ============================================================
-- 线上实测确认的风险（本文件不修，留给后续迁移文件）
-- 1. profiles 有两条 UPDATE 策略，均只按 id 限制行，无列级约束：
--    任何登录用户可执行 update profiles set role='admin' where id=auth.uid()
--    admin_update_profiles 是并列的 PERMISSIVE 策略，不构成约束。
-- 2. 没有任何策略判断 banned_at：封禁后用户仍可登录并读取全部 authenticated 数据，
--    只有前端 assertNotBanned() 在拦。
-- 3. game_rooms 只有房主能 UPDATE state。非房主的走子必须通过 security definer
--    的 fc_* RPC 写入，客户端直接 .update({state}) 会被 RLS 拒绝。
-- 4. game_rooms 无 DELETE 策略。
-- 5. invite_codes 无 INSERT / UPDATE 策略，写入只能走 RPC。
-- 6. likes 的 SELECT 是 using(true)，含匿名。
-- ============================================================
