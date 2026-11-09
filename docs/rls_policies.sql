-- ==========================================
-- RLS 策略定义
-- ==========================================

-- 1. Profiles 表
-- 任何人可看公开主页的资料
create policy "Public profiles are viewable by everyone."
  on profiles for select using (true);
-- 用户只能改自己的
create policy "Users can update own profile."
  on profiles for update using (auth.uid() = id);

-- 2. Pages 表
-- 已发布的任何人都能看
create policy "Published pages are viewable by everyone."
  on pages for select using (is_public = true);
-- 草稿只有自己能看
create policy "Users can view own draft page."
  on pages for select using (auth.uid() = user_id);
-- 只有自己能改/插入
create policy "Users can insert own page."
  on pages for insert with check (auth.uid() = user_id);
create policy "Users can update own page."
  on pages for update using (auth.uid() = user_id);

-- 3. Articles & Moments 表
-- 公开的内容所有人可见
create policy "Public articles are viewable by everyone."
  on articles for select using (is_public = true);
create policy "Public moments are viewable by everyone."
  on moments for select using (is_public = true);
-- 作者本人可以全权操作 (增删改查)
create policy "Users can manage own articles."
  on articles for all using (auth.uid() = user_id);
create policy "Users can manage own moments."
  on moments for all using (auth.uid() = user_id);

-- 4. Comments 表
-- 所有人可看评论
create policy "Comments are viewable by everyone."
  on comments for select using (true);
-- 只有登录用户可以发表评论，且 user_id 必须是自己的
create policy "Authenticated users can insert comments."
  on comments for insert with check (auth.uid() = user_id);
-- 只能删自己的评论
create policy "Users can delete own comments."
  on comments for delete using (auth.uid() = user_id);

-- 5. Game Rooms 表
-- 所有人可以看“进行中”或“等待中”的房间
create policy "Rooms are viewable by everyone."
  on game_rooms for select using (status in ('waiting', 'playing'));
-- 只有房主可以创建/修改房间
create policy "Host can insert room."
  on game_rooms for insert with check (auth.uid() = host_id);
create policy "Host can update room."
  on game_rooms for update using (auth.uid() = host_id);
