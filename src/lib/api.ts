import { supabase } from './supabase';
import type { PageData } from './blocks';

const emailOf = (username: string) => `${username}@ziji.local`;

/** 检查当前用户是否被封禁，被则抛错 */
export async function assertNotBanned(uid?: string) {
  const target = uid || (await supabase.auth.getUser()).data.user?.id;
  if (!target) return;
  const { data } = await supabase
    .from('profiles')
    .select('banned_at')
    .eq('id', target)
    .maybeSingle();
  if (data?.banned_at) {
    throw new Error('账号已被封禁，请联系站长');
  }
}

/** 登录：仅做密码登录，不需要邀请码 */
export async function login(username: string, password: string) {
  if (!password) throw new Error('密码不能为空');
  const { data, error } = await supabase.auth.signInWithPassword({ email: emailOf(username), password });
  if (error) throw new Error('用户名或密码错误');
  const user = data.user;
  if (!user) throw new Error('无法获取用户信息');

  // 封禁检查：登录成功但账号被封，立即登出
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, banned_at')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.banned_at) {
    await supabase.auth.signOut();
    throw new Error('账号已被封禁，请联系站长');
  }

  localStorage.setItem('ziji_uid', user.id);
  localStorage.setItem('ziji_user', username);

  // 兜底：老用户若无 profiles 记录则补建
  if (!profile) {
    await supabase.from('profiles').insert({ id: user.id, username });
    localStorage.setItem('ziji_role', 'member');
  } else {
    localStorage.setItem('ziji_role', profile.role || 'member');
  }
  return { id: user.id, username };
}

/** 注册：邀请码在数据库端原子校验并消费，前端不留明文 */
export async function register(username: string, password: string, inviteCode: string) {
  if (!password) throw new Error('密码不能为空');
  const code = (inviteCode || '').trim().toUpperCase();
  if (!code) throw new Error('请输入邀请码');

  // 1. 只读校验：不消费，失败时邀请码仍然有效
  const { data: valid, error: vErr } = await supabase.rpc('verify_invite_code', { p_code: code });
  if (vErr) throw new Error('邀请码校验失败：' + vErr.message);
  if (valid !== true) throw new Error('邀请码无效、已使用或已过期');

  // 2. 创建账号（失败则邀请码原封不动）
  const { data, error } = await supabase.auth.signUp({ email: emailOf(username), password });
  if (error) {
    if (error.message.includes('already registered')) throw new Error('该用户名已被注册');
    throw new Error('注册失败：' + error.message);
  }
  const user = data.user;
  if (!user) throw new Error('注册失败：无法创建用户');

  localStorage.setItem('ziji_uid', user.id);
  localStorage.setItem('ziji_user', username);
  localStorage.setItem('ziji_role', 'member');

  // 3. 建档案与画布；失败则回滚提示，避免"有号没资料"的半残状态
  try {
    const { error: pErr } = await supabase.from('profiles').insert({ id: user.id, username });
    if (pErr && pErr.code !== '23505') throw pErr;
    const { error: pgErr } = await supabase.from('pages').insert({
      user_id: user.id, draft_data: { blocks: [] }, is_public: false,
    });
    if (pgErr && pgErr.code !== '23505') throw pgErr;
  } catch (e: any) {
    throw new Error('账号已创建，但资料初始化失败，请联系站长：' + (e.message || e));
  }

  // 4. 账号就绪后才消费邀请码，并记录使用者
  const { data: consumed } = await supabase.rpc('consume_invite_code', {
    p_code: code, p_uid: user.id,
  });
  if (consumed !== true) {
    // 极端并发：别人恰好抢先用掉。账号已建成，不阻断，仅记录。
    console.warn('[invite] 邀请码在注册完成后已不可消费:', code);
  }

  return { id: user.id, username };
}

/** 拉当前用户的画布草稿 */
export async function getMyPage(uid: string): Promise<PageData | null> {
  const { data, error } = await supabase
    .from('pages')
    .select('draft_data')
    .eq('user_id', uid)
    .maybeSingle();
  if (error) throw error;
  return (data?.draft_data as PageData) ?? null;
}

/** 保存草稿 */
export async function saveDraft(uid: string, data: PageData) {
  await assertNotBanned();
  const { error } = await supabase
    .from('pages')
    .upsert({ user_id: uid, draft_data: data }, { onConflict: 'user_id' });
  if (error) throw error;
}

/** 发布（草稿 → 已发布） */
export async function publishPage(uid: string, data: PageData) {
  await assertNotBanned();
  const { error } = await supabase
    .from('pages')
    .upsert({ user_id: uid, draft_data: data, published_data: data, is_public: true }, { onConflict: 'user_id' });
  if (error) throw error;
}

/** 按用户名读公开主页 */
export async function getPublicPage(username: string) {
  const { data: profile, error: pe } = await supabase
    .from('profiles')
    .select('id, username, display_name, bio, avatar_url')
    .eq('username', username)
    .maybeSingle();
  if (pe) throw pe;
  if (!profile) return null;

  const { data: page, error: pageErr } = await supabase
    .from('pages')
    .select('published_data')
    .eq('user_id', profile.id)
    .eq('is_public', true)
    .maybeSingle();
  if (pageErr) throw pageErr;

  return { profile, page: page?.published_data as PageData | null };
}

/** 发碎碎念 */
export async function createMoment(uid: string, content: string, images: string[] = []) {
  await assertNotBanned();
  const { error } = await supabase.from('moments').insert({ user_id: uid, content, images });
  if (error) throw error;
}

/** 发文章 */
export async function createArticle(uid: string, title: string, content: string, summary?: string, coverUrl?: string) {
  await assertNotBanned();
  const { error } = await supabase.from('articles').insert({
    user_id: uid,
    title,
    content,
    summary,
    cover_url: coverUrl || null,
  });
  if (error) throw error;
}

/** 大厅 Feed：最近动态 + 最近文章 */
export async function getFeed(limit = 20) {
  const [m, a] = await Promise.all([
    supabase
      .from('moments')
      .select('id, user_id, content, created_at, profiles(username, display_name, avatar_url)')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('articles')
      .select('id, user_id, title, summary, cover_url, published_at, profiles(username, display_name, avatar_url)')
      .eq('is_public', true)
      .order('published_at', { ascending: false })
      .limit(10),
  ]);
  if (m.error) throw m.error;
  if (a.error) throw a.error;
  return {
    moments: m.data ?? [],
    articles: a.data ?? [],
  };
}

/** 读当前用户的全部文章（含草稿态，用于写作页归档） */
export async function getMyArticles(uid: string) {
  const { data, error } = await supabase
    .from('articles')
    .select('id, title, summary, published_at, is_public, cover_url')
    .eq('user_id', uid)
    .order('published_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** 删除自己的文章 */
export async function deleteArticle(id: string) {
  await assertNotBanned();
  const { error } = await supabase.from('articles').delete().eq('id', id);
  if (error) throw error;
}

/** 读某用户文章列表（区块用） */
export async function getArticles(uid: string, limit: number) {
  const { data } = await supabase
    .from('articles')
    .select('id, title, summary, published_at')
    .eq('user_id', uid)
    .eq('is_public', true)
    .order('published_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

/** 读某用户碎碎念列表（区块用） */
export async function getMoments(uid: string, limit: number) {
  const { data } = await supabase
    .from('moments')
    .select('id, content, created_at')
    .eq('user_id', uid)
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}


/** 获取某篇文章的留言 */
export async function getComments(targetId: string) {
  const { data } = await supabase
    .from('comments')
    .select('id, content, created_at, profiles(username, display_name, avatar_url)')
    .eq('target_type', 'article')
    .eq('target_id', targetId)
    .order('created_at', { ascending: true });
  return data || [];
}

/** 创建游戏房间 */
export async function createGameRoom(hostId: string, gameType: string) {
  await assertNotBanned();
  const { data, error } = await supabase
    .from('game_rooms')
    .insert({ host_id: hostId, game_type: gameType, status: 'waiting' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** 获取大厅中正在进行的房间列表 */
export async function getActiveGameRooms() {
  // 幽灵房间清理：超过 24 小时仍在 waiting 的房间视为失效。
  // （无心跳机制时的权宜之计——房主关页面后房间会一直挂着）
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('game_rooms')
    .select('*, profiles(username, display_name, avatar_url)')
    .in('status', ['waiting', 'playing'])
    .or(`status.eq.playing,created_at.gte.${cutoff}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/** 获取单个房间详情 */
export async function getGameRoom(id: string) {
  const { data, error } = await supabase
    .from('game_rooms')
    .select('*, profiles(username, display_name, avatar_url)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** 发表留言 */
export async function createComment(uid: string, targetId: string, content: string) {
  await assertNotBanned();
  const { error } = await supabase.from('comments').insert({
    user_id: uid,
    target_type: 'article',
    target_id: targetId,
    content
  });
  if (error) throw error;
}
