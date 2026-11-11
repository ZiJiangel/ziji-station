docs/rls_policies.sql 读完了，共 58 行，给你看看：

1: -- ==========================================
2: -- RLS 策略定义
3: -- ==========================================
4: 
5: -- 1. Profiles 表
6: -- 任何人可看公开主页的资料
7: create policy "Public profiles are viewable by everyone."
8:   on profiles for select using (true);
9: -- 用户只能改自己的
10: create policy "Users can update own profile."
11:   on profiles for update using (auth.uid() = id);
12: 
13: -- 2. Pages 表
14: -- 已发布的任何人都能看
15: create policy "Published pages are viewable by everyone."
16:   on pages for select using (is_public = true);
17: -- 草稿只有自己能看
18: create policy "Users can view own draft page."
19:   on pages for select using (auth.uid() = user_id);
20: -- 只有自己能改/插入
21: create policy "Users can insert own page."
22:   on pages for insert with check (auth.uid() = user_id);
23: create policy "Users can update own page."
24:   on pages for update using (auth.uid() = user_id);
25: 
26: -- 3. Articles & Moments 表
27: -- 公开的内容所有人可见
28: create policy "Public articles are viewable by everyone."
29:   on articles for select using (is_public = true);
30: create policy "Public moments are viewable by everyone."
31:   on moments for select using (is_public = true);
32: -- 作者本人可以全权操作 (增删改查)
33: create policy "Users can manage own articles."
34:   on articles for all using (auth.uid() = user_id);
35: create policy "Users can manage own moments."
36:   on moments for all using (auth.uid() = user_id);
37: 
38: -- 4. Comments 表
39: -- 所有人可看评论
40: create policy "Comments are viewable by everyone."
41:   on comments for select using (true);
42: -- 只有登录用户可以发表评论，且 user_id 必须是自己的
43: create policy "Authenticated users can insert comments."
44:   on comments for insert with check (auth.uid() = user_id);
45: -- 只能删自己的评论
46: create policy "Users can delete own comments."
47:   on comments for delete using (auth.uid() = user_id);
48: 
49: -- 5. Game Rooms 表
50: -- 所有人可以看“进行中”或“等待中”的房间
51: create policy "Rooms are viewable by everyone."
52:   on game_rooms for select using (status in ('waiting', 'playing'));
53: -- 只有房主可以创建/修改房间
54: create policy "Host can insert room."
55:   on game_rooms for insert with check (auth.uid() = host_id);
56: create policy "Host can update room."
57:   on game_rooms for update using (auth.uid() = host_id);
58: 

(到底啦，一共 58 行)
-- 游戏房间表的 RLS 策略
-- 允许任何人读取房间信息
create policy "Anyone can view game rooms."
on game_rooms for select
using (true);

-- 允许登录用户创建房间
create policy "Authenticated users can create game rooms."
on game_rooms for insert
with check (auth.uid() = host_id);

-- 允许房主更新和删除自己的房间
create policy "Host can update own room."
on game_rooms for update
using (auth.uid() = host_id);

create policy "Host can delete own room."
on game_rooms for delete
using (auth.uid() = host_id);
