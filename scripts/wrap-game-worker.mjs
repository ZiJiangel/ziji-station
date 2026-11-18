/**
 * 构建后把飞行棋联机路由包进 Astro 的 Pages Worker。
 * 这样前端走同域 /game-ws/*，绕开本机被 DNS 污染的 workers.dev。
 *
 * 原理：把 adapter 生成的 dist/_worker.js/index.js 改名为 astro-entry.mjs，
 * 原 index.js 换成一个薄包装：/game-ws/* 交给 fq-game 的 Durable Object，
 * 其余请求原样转发给 astro-entry 的 default export。
 */
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const dir = join(root, 'dist/_worker.js');
const entry = join(dir, 'index.js');
const astroEntry = join(dir, 'astro-entry.mjs');

if (!existsSync(entry)) {
  console.error('[wrap-game] dist/_worker.js/index.js 不存在，请先构建');
  process.exit(1);
}
if (!existsSync(astroEntry)) renameSync(entry, astroEntry);

const wrapper = `// 由 scripts/wrap-game-worker.mjs 生成，请勿手改
import astroFetch from './astro-entry.mjs';

async function gameFetch(request, env, ctx) {
  const url = new URL(request.url);
  const ns = env.GAME_ROOMS;
  if (!ns) {
    return new Response(JSON.stringify({ error: 'GAME_ROOMS binding missing' }), {
      status: 503, headers: { 'content-type': 'application/json' }
    });
  }

  // 建房：/game-ws/lobby/create → 新生成一个房间 DO
  if (url.pathname === '/game-ws/lobby/create') {
    const body = await request.json().catch(() => ({}));
    const id = crypto.randomUUID();
    const stub = ns.get(ns.idFromName(id));
    const res = await stub.fetch(new Request('https://room/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }));
    const data = await res.json();
    return new Response(JSON.stringify({ ...data, id }), {
      status: res.status, headers: { 'content-type': 'application/json' }
    });
  }

  const m = url.pathname.match(/^\\/game-ws\\/([0-9a-f-]{36})(\\/.*)?$/i);
  if (!m) return new Response('Not found', { status: 404 });

  const roomId = m[1];
  const stub = ns.get(ns.idFromName(roomId));
  const target = 'https://room' + (m[2] || '/') + url.search;
  return stub.fetch(new Request(target, request));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/game-ws/')) {
      try { return await gameFetch(request, env, ctx); }
      catch (e) {
        return new Response(JSON.stringify({ error: String(e) }), {
          status: 500, headers: { 'content-type': 'application/json' }
        });
      }
    }
    return astroFetch(request, env, ctx);
  }
};
`;

writeFileSync(entry, wrapper, 'utf8');
console.log('[wrap-game] worker 已包装：/game-ws/* → GAME_ROOMS，其余 → Astro');
