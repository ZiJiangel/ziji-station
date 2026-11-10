import { supabase } from './supabase';
import type { PageData } from './canvas';

/** 登录：注册用户名，创建初始 page 记录 */
export async function login(username: string) {
  let { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw new Error('匿名登录失败：' + error.message);
    user = data.user;
  }

  const uid = user!.id;
  localStorage.setItem('ziji_uid', uid);

  const { error: pErr } = await supabase.from('profiles').upsert({ id: uid, username }, { onConflict: 'id' });
  if (pErr) {
    if (pErr.code === '23505') throw new Error('该用户名已被占用，请换一个');
    throw new Error('创建用户档案失败：' + pErr.message);
  }

  const { error: pageErr } = await supabase.from('pages').upsert(
    { user_id: uid, draft_data: { elements: [] }, is_public: false },
    { onConflict: 'user_id' }
  );
  if (pageErr) throw new Error('初始化主页失败：' + pageErr.message);

  localStorage.setItem('ziji_user', username);
  return { id: uid, username };
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

/** 确保 profiles 记录存在（自愈机制） */
async function ensureProfile(uid: string) {
  let username = localStorage.getItem('ziji_user') || ('user_' + Math.random().toString(36).slice(2, 8));
  localStorage.setItem('ziji_user', username);
  
  const { error } = await supabase.from('profiles').upsert({ id: uid, username }, { onConflict: 'id' });
  if (error) {
    if (error.code === '23505') { // 名字冲突就加后缀
      const newName = username + '_' + Math.random().toString(36).slice(2, 4);
      localStorage.setItem('ziji_user', newName);
      await supabase.from('profiles').upsert({ id: uid, username: newName }, { onConflict: 'id' });
    } else {
      throw new Error('同步用户资料失败: ' + error.message);
    }
  }
}

/** 保存草稿 */
export async function saveDraft(uid: string, data: PageData) {
  await ensureProfile(uid);
  const { error } = await supabase
    .from('pages')
    .upsert({ user_id: uid, draft_data: data }, { onConflict: 'user_id' });
  if (error) throw error;
}

/** 发布（草稿 → 已发布） */
export async function publishPage(uid: string, data: PageData) {
  await ensureProfile(uid);
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
export async function createMoment(uid: string, content: string) {
  const { error } = await supabase.from('moments').insert({ user_id: uid, content });
  if (error) throw error;
}

/** 发文章 */
export async function createArticle(uid: string, title: string, content: string) {
  const { error } = await supabase.from('articles').insert({ user_id: uid, title, content });
  if (error) throw error;
}

/** 大厅 Feed：最近动态 + 最近文章 */
export async function getFeed(limit = 20) {
  const [m, a] = await Promise.all([
    supabase
      .from('moments')
      .select('id, user_id, content, published_at, profiles(username, display_name, avatar_url)')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('articles')
      .select('id, user_id, title, summary, published_at, profiles(username, display_name, avatar_url)')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);
  return {
    moments: m.data ?? [],
    articles: a.data ?? [],
  };
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

/** 发表留言 */
export async function createComment(uid: string, targetId: string, content: string) {
  const { error } = await supabase.from('comments').insert({
    user_id: uid,
    target_type: 'article',
    target_id: targetId,
    content
  });
  if (error) throw error;
}
