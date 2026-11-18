/**
 * FQ 联机 Worker 入口。
 * 路由：
 *   /room/:id/*  → 该房间的 Durable Object
 *   /lobby/create → 创建房间，返回房间 id
 *   /lobby/rooms  → 活跃房间列表
 */
import { GameRoom } from './room.js';

export { GameRoom };

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type'
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    if (url.pathname === '/lobby/create') {
      if (request.method !== 'POST') return json({ error: 'method' }, 405);
      const body = await request.json().catch(() => ({}));
      const id = crypto.randomUUID();
      const stub = env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(id));
      const res = await stub.fetch(new Request('https://room/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      }));
      const data = await res.json();
      return json({ ...data, id });
    }

    if (url.pathname === '/lobby/rooms') {
      // 房间列表由客户端从 Supabase game_rooms 读取；这里保留空实现供后续接 D1
      return json({ rooms: [] });
    }

    const match = url.pathname.match(/^\/room\/([0-9a-f-]{36})(\/.*)?$/i);
    if (match) {
      const id = match[1];
      const stub = env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(id));
      const target = 'https://room' + (match[2] || '/') + url.search;
      return stub.fetch(new Request(target, request));
    }

    return json({ ok: true, service: 'fq-game-worker' });
  }
};
