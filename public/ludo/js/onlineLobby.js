/**
 * 飞行棋在线联机（对接 fq-game Worker / Durable Objects）
 *
 * 设计约定：
 * - 纯静态、无构建、无外部依赖，和 public/ludo 其它 JS 一样直接 <script type="module"> 引入。
 * - 不改 multiplayerManager.js（旧 Node WS 协议），只接管「在线联机」入口。
 * - 服务端权威：本地只渲染快照，玩家发 intent，规则由 worker/engine.mjs 裁决。
 * - 房间号用 Worker 返回的 UUID，兼容原页面的 ?room= 参数。
 */

// 同域代理，绕开部分网络环境对 workers.dev 的 DNS 污染。
// Pages 的 /game-ws/* 由 scripts/wrap-game-worker.mjs 包装后转给 fq-game Worker。
// 本地开发可直接指向 http://127.0.0.1:8787。
const WORKER = (() => {
  try {
    const h = location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') return 'http://127.0.0.1:8787';
  } catch { /* non-browser */ }
  return location.origin + '/game-ws';
})();

function api(path, opts) {
  return fetch(WORKER + path, opts).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
    return data;
  });
}

function getIdentity() {
  let id = localStorage.getItem('ludo_online_id');
  if (!id) {
    id = 'p_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('ludo_online_id', id);
  }
  let name = localStorage.getItem('ludo_online_name');
  if (!name) {
    name = '玩家' + id.slice(2, 5).toUpperCase();
    localStorage.setItem('ludo_online_name', name);
  }
  return { id, name };
}

/** 联机会话：WebSocket + 快照对齐 */
export class OnlineSession {
  constructor(roomId, handlers = {}) {
    this.roomId = roomId;
    this.handlers = handlers;
    this.ws = null;
    this.seq = 0;
    this.snapshot = null;
    this.room = null;
    this.retries = 0;
    this.closed = false;
    this.heartbeat = null;
  }

  async load() {
    const state = await api(`/room/${this.roomId}/state`);
    this.room = state.room;
    this.snapshot = state.snapshot;
    return state;
  }

  async join() {
    const { id, name } = getIdentity();
    await api(`/room/${this.roomId}/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId: id, nickname: name })
    });
    this.connect();
  }

  connect() {
    this.closed = false;
    const { id, name } = getIdentity();
    const url = WORKER.replace(/^http/, 'ws') + `/room/${this.roomId}` +
      `?playerId=${encodeURIComponent(id)}&nickname=${encodeURIComponent(name)}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.retries = 0;
      this.handlers.onStatus?.('已连接');
      clearInterval(this.heartbeat);
      this.heartbeat = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) this.send({ type: 'ping' });
      }, 15000);
    };

    this.ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === 'gameSnapshot') {
        // 丢弃重复/倒退帧，重连用 snapshotRequest 强制对齐
        if (typeof msg.seq === 'number' && msg.seq <= this.seq) return;
        this.seq = msg.seq ?? 0;
        this.snapshot = msg;
        this.handlers.onSnapshot?.(msg);
      } else if (msg.type === 'roomUpdated' || msg.type === 'gameStarted') {
        this.room = msg.room || this.room;
        this.handlers.onRoom?.(this.room);
      } else if (msg.type === 'intentRejected') {
        this.handlers.onRejected?.(msg.reason || '动作被拒绝');
      }
    };

    this.ws.onclose = () => {
      clearInterval(this.heartbeat);
      if (this.closed) return;
      this.retries += 1;
      if (this.retries > 5) { this.handlers.onStatus?.('连接已断开，请刷新'); return; }
      const delay = Math.min(1000 * 2 ** (this.retries - 1), 16000);
      this.handlers.onStatus?.(`断线，${delay / 1000} 秒后重连…`);
      setTimeout(() => this.connect(), delay);
    };
  }

  send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  intent(action) { return this.send({ type: 'intent', intent: action }); }
  resync() { this.seq = 0; this.send({ type: 'snapshotRequest' }); }
  close() {
    this.closed = true;
    clearInterval(this.heartbeat);
    this.ws?.close();
  }
}

export async function createRoom(roomName) {
  const { id, name } = getIdentity();
  const res = await api('/lobby/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ hostId: id, hostName: roomName || name, gameType: 'ludo' })
  });
  return res.id;
}

export function listRooms() {
  // Worker 暂不持久化房间索引；只返回本地曾加入过的房间
  const raw = localStorage.getItem('ludo_online_rooms') || '[]';
  try { return JSON.parse(raw); } catch { return []; }
}

export function rememberRoom(roomId, roomName) {
  const rooms = listRooms().filter(r => r.id !== roomId);
  rooms.unshift({ id: roomId, name: roomName, at: Date.now() });
  localStorage.setItem('ludo_online_rooms', JSON.stringify(rooms.slice(0, 10)));
}

export { getIdentity };
