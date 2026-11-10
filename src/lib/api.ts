import { supabase } from './supabase';
import type { PageData } from './blocks';

/** 登录：注册用户名，创建初始 page 记录 */
export async function login(username: string) {
  let { data: { user } } = await supabase.auth.getUser();

  // 强制确保有 Supabase 匿名会话
  if (!user) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw new Error('匿名登录失败：' + error.message);
    user = data.user;
  }

  const uid = user!.id;
  localStorage.setItem('ziji_uid', uid);

  // 尝试插入/更新 profiles
  const { error: pErr } = await supabase.from('profiles').upsert({ id: uid, username }, { onConflict: 'id' });
  if (pErr) console.error('Profile upsert error:', pErr);

  // 尝试插入/更新 pages
  const { error: pageErr } = await supabase.from('pages').upsert(
    { user_id: uid, draft_data: { blocks: [] }, is_public: false },
    { onConflict: 'user_id' }
  );
  if (pageErr) console.error('Page upsert error:', pageErr);

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

/** 保存草稿 */
export async function saveDraft(uid: string, data: PageData) {
  const { error } = await supabase
    .from('pages')
    .update({ draft_data: data })
    .eq('user_id', uid);
  if (error) throw error;
}

/** 发布（草稿 → 已发布） */
export async function publishPage(uid: string) {
  const { data, error } = await supabase
    .from('pages')
    .select('draft_data')
    .eq('user_id', uid)
    .single();
  if (error) throw error;

  const { error: e2 } = await supabase
    .from('pages')
    .update({ published_data: data.draft_data, is_public: true })
    .eq('user_id', uid);
  if (e2) throw e2;
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
