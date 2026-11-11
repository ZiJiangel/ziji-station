-- ==========================================
-- RLS 策略定义
-- ==========================================

-- 1. Profiles 表
create policy "Public profiles are viewable by everyone."
  on profiles for select using (true);
create policy "Users can update own profile."
  on profiles for update using (auth.uid() = id);

-- 2. Pages 表
create policy "Published pages are viewable by everyone."
  on pages for select using (is_public = true);
create policy "Users can view own draft page."
  on pages for select using (auth.uid() = user_id);
create policy "Users can insert own page."
  on pages for insert with check (auth.uid() = user_id);
create policy "Users can update own page."
  on pages for update using (auth.uid() = user_id);

-- 3. Articles & Moments 表
create policy "Public articles are viewable by everyone."
  on articles for select using (is_public = true);
create policy "Public moments are viewable by everyone."
  on moments for select using (is_public = true);
create policy "Users can manage own articles."
  on articles for all using (auth.uid() = user_id);
create policy "Users can manage own moments."
  on moments for all using (auth.uid() = user_id);

-- 4. Comments 表
create policy "Comments are viewable by everyone."
  on comments for select using (true);
create policy "Authenticated users can insert comments."
  on comments for insert with check (auth.uid() = user_id);
create policy "Users can delete own comments."
  on comments for delete using (auth.uid() = user_id);

-- 5. Game Rooms 表
create policy "Rooms are viewable by everyone."
  on game_rooms for select using (status in ('waiting', 'playing'));
create policy "Host can insert room."
  on game_rooms for insert with check (auth.uid() = host_id);
create policy "Host can update room."
  on game_rooms for update using (auth.uid() = host_id);
create policy "Host can delete room."
  on game_rooms for delete using (auth.uid() = host_id);
