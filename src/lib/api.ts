const SUPABASE_URL = 'https://wgtqupyjpykaegrcmsma.supabase.co/rest/v1';
const SUPABASE_KEY = 'sb_publishable_YmnctfZ7j0SY-3qCrlwwTg_o5CQuzmM';

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

export const api = {
  async login(username: string) {
    let id = localStorage.getItem('ziji_uid');
    if (!id) id = crypto.randomUUID();
    localStorage.setItem('ziji_uid', id);

    // 尝试插入用户，失败则忽略（假设已存在）
    await fetch(`${SUPABASE_URL}/profiles`, {
      method: 'POST', headers,
      body: JSON.stringify({ id, username })
    }).catch(() => {});

    // 尝试初始化空主页，失败则忽略
    await fetch(`${SUPABASE_URL}/pages`, {
      method: 'POST', headers,
      body: JSON.stringify({ user_id: id, draft_data: { elements: [] }, is_public: false })
    }).catch(() => {});

    return { id, username };
  },

  async getPage(userId: string) {
    const res = await fetch(`${SUPABASE_URL}/pages?user_id=eq.${userId}&select=*`, { headers });
    const data = await res.json();
    return data[0] || null;
  },

  async savePage(userId: string, draft: any) {
    const res = await fetch(`${SUPABASE_URL}/pages?user_id=eq.${userId}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ draft_data: draft })
    });
    return res.ok;
  },

  async publishPage(userId: string, data: any) {
    const res = await fetch(`${SUPABASE_URL}/pages?user_id=eq.${userId}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ published_data: data, is_public: true })
    });
    return res.ok;
  },

  async getPublishedPage(username: string) {
    const pRes = await fetch(`${SUPABASE_URL}/profiles?username=eq.${username}&select=id`, { headers });
    const pData = await pRes.json();
    if (!pData[0]) return null;
    
    const pageRes = await fetch(`${SUPABASE_URL}/pages?user_id=eq.${pData[0].id}&is_public=eq.true&select=published_data`, { headers });
    const pageData = await pageRes.json();
    return pageData[0] ? pageData[0].published_data : null;
  },
  
  async createMoment(userId: string, content: string) {
    await fetch(`${SUPABASE_URL}/moments`, {
      method: 'POST', headers,
      body: JSON.stringify({ user_id: userId, content })
    });
  },

  async getFeed() {
    const mRes = await fetch(`${SUPABASE_URL}/moments?select=*&order=created_at.desc&limit=20`, { headers });
    const moments = await mRes.json();
    const aRes = await fetch(`${SUPABASE_URL}/articles?select=*&order=created_at.desc&limit=10`, { headers });
    const articles = await aRes.json();
    return { moments, articles };
  },

  async createArticle(userId: string, title: string, content: string) {
    await fetch(`${SUPABASE_URL}/articles`, {
      method: 'POST', headers,
      body: JSON.stringify({ user_id: userId, title, content })
    });
  }
};