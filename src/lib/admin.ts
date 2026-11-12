import { supabase } from './supabase';

export interface AdminUser {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  role: 'member' | 'admin';
  banned_at: string | null;
  created_at: string;
}

export interface AdminStats {
  users: number;
  articles: number;
  moments: number;
  comments: number;
  invites: { total: number; used: number; active: number };
}

/** 当前登录者是否为管理员 */
export async function checkIsAdmin(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  return data?.role === 'admin';
}

export async function listUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, bio, avatar_url, role, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AdminUser[];
}

export async function getStats(): Promise<AdminStats> {
  const [u, a, m, c, inv] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('articles').select('id', { count: 'exact', head: true }),
    supabase.from('moments').select('id', { count: 'exact', head: true }),
    supabase.from('comments').select('id', { count: 'exact', head: true }),
    supabase.from('invite_codes').select('used_at'),
  ]);
  const codes = inv.data ?? [];
  return {
    users: u.count ?? 0,
    articles: a.count ?? 0,
    moments: m.count ?? 0,
    comments: c.count ?? 0,
    invites: {
      total: codes.length,
      used: codes.filter(x => x.used_at).length,
      active: codes.filter(x => !x.used_at).length,
    },
  };
}

export async function setUserRole(uid: string, role: 'member' | 'admin') {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', uid);
  if (error) throw error;
}

/** 清空某用户的全部内容（保留账号） */
export async function purgeUserContent(uid: string) {
  const results = await Promise.all([
    supabase.from('moments').delete().eq('user_id', uid),
    supabase.from('articles').delete().eq('user_id', uid),
    supabase.from('comments').delete().eq('user_id', uid),
  ]);
  const err = results.find(r => r.error)?.error;
  if (err) throw err;
}

export interface AdminMoment {
  id: string;
  user_id: string;
  content: string;
  images: string[] | null;
  created_at: string;
  is_public: boolean;
  profiles: { username: string; display_name: string | null } | null;
}

export async function listMoments(limit = 100): Promise<AdminMoment[]> {
  const { data, error } = await supabase
    .from('moments')
    .select('id, user_id, content, images, created_at, is_public, profiles(username, display_name)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as AdminMoment[];
}

export async function deleteMoment(id: string) {
  const { error } = await supabase.from('moments').delete().eq('id', id);
  if (error) throw error;
}

export interface AdminArticle {
  id: string;
  user_id: string;
  title: string;
  published_at: string;
  is_public: boolean;
  profiles: { username: string; display_name: string | null } | null;
}

export async function listArticles(limit = 100): Promise<AdminArticle[]> {
  const { data, error } = await supabase
    .from('articles')
    .select('id, user_id, title, published_at, is_public, profiles(username, display_name)')
    .order('published_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as AdminArticle[];
}


// ===== v2 新增 =====

export async function deleteUser(uid: string) {
  const { error } = await supabase.rpc('admin_delete_user', { target_uid: uid });
  if (error) throw error;
}

export async function banUser(uid: string, ban: boolean) {
  const { error } = await supabase.rpc('admin_ban_user', { target_uid: uid, ban });
  if (error) throw error;
}

export interface AdminInvite {
  code: string;
  created_by: string | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  used_by: string | null;
  note: string | null;
  creator?: { username: string; display_name: string | null };
  user?: { username: string; display_name: string | null };
}

export async function listInvites(): Promise<AdminInvite[]> {
  const { data: codes, error } = await supabase
    .from('invite_codes')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!codes || codes.length === 0) return [];

  const uids = Array.from(new Set(
    codes.flatMap(c => [c.created_by, c.used_by]).filter(Boolean)
  )) as string[];

  let profileMap: Record<string, { username: string; display_name: string | null }> = {};
  if (uids.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name')
      .in('id', uids);
    if (profiles) {
      profileMap = Object.fromEntries(profiles.map(p => [p.id, p]));
    }
  }

  return codes.map(c => ({
    ...c,
    creator: c.created_by ? profileMap[c.created_by] : undefined,
    user: c.used_by ? profileMap[c.used_by] : undefined,
  }));
}

export async function deleteInvite(code: string) {
  const { error } = await supabase.from('invite_codes').delete().eq('code', code);
  if (error) throw error;
}

export async function deleteArticle(id: string) {
  const { error } = await supabase.from('articles').delete().eq('id', id);
  if (error) throw error;
}
