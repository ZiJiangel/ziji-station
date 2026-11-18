/**
 * 每个房间一个 Durable Object 实例：持有权威对局 + 连接管理。
 * 使用 WebSocket Hibernation API，空闲时不计 duration 费用。
 */
import { AuthoritySession } from './authority.js';

const ROOM_TTL_MS = 30 * 60 * 1000;      // 空房 30 分钟后自毁
const RECONNECT_GRACE_MS = 5 * 60 * 1000; // 断线宽限 5 分钟
const SNAPSHOT_INTERVAL_MS = 25 * 1000;

export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    // 连接由 DO 的 WebSocket Hibernation API 管理；
    // ping/pong 在 webSocketMessage 里显式处理，不依赖 WebSocketRequestResponsePair
    // （该构造器在部分 Worker 运行时版本不可用，会导致 DO 构造期崩溃）
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/create') return this.createRoom(request);
    if (url.pathname === '/join') return this.joinRoom(request);
    if (url.pathname === '/state') return this.getState();
    if (request.headers.get('Upgrade') === 'websocket') return this.onConnect(request);
    return new Response('GameRoom', { status: 200 });
  }

  /** 从 DO storage 读取或初始化权威会话 */
  async getAuthority() {
    const saved = await this.state.storage.get('authority');
    if (saved) return AuthoritySession.restore(saved);
    return null;
  }

  async saveAuthority(a) {
    await this.state.storage.put('authority', a.serialize());
  }

  async getRoomMeta() {
    return (await this.state.storage.get('meta')) || null;
  }

  async createRoom(request) {
    const cfg = await request.json();
    const existing = await this.getRoomMeta();
    if (existing) return json({ ok: true, room: existing });

    const meta = {
      gameType: cfg.gameType || 'ludo',
      hostId: cfg.hostId,
      hostName: cfg.hostName || '房主',
      status: 'waiting',
      players: [],
      createdAt: Date.now(),
      maxPlayers: cfg.maxPlayers || 4
    };
    await this.state.storage.put('meta', meta);
    await this.state.storage.setAlarm(Date.now() + ROOM_TTL_MS);
    return json({ ok: true, room: meta });
  }

  async joinRoom(request) {
    const { playerId, nickname, color } = await request.json();
    const meta = await this.getRoomMeta();
    if (!meta) return json({ ok: false, error: '房间不存在' }, 404);
    if (meta.status === 'playing') {
      // 对局中断线重连：不新增玩家
      const found = meta.players.find(p => p.playerId === playerId);
      if (found) return json({ ok: true, room: meta, resumed: true });
      return json({ ok: false, error: '对局已开始' }, 403);
    }
    if (!meta.players.some(p => p.playerId === playerId)) {
      if (meta.players.length >= meta.maxPlayers) {
        return json({ ok: false, error: '房间已满' }, 403);
      }
      meta.players.push({ playerId, nickname: nickname || '玩家', color: color || null });
      await this.state.storage.put('meta', meta);
    }
    this.broadcast({ type: 'roomUpdated', room: meta });
    return json({ ok: true, room: meta });
  }

  async getState() {
    const meta = await this.getRoomMeta();
    const a = await this.getAuthority();
    return json({
      room: meta,
      snapshot: a ? a.snapshot() : null,
      replay: a ? a.getReplay() : null
    });
  }

  async onConnect(request) {
    const url = new URL(request.url);
    const playerId = url.searchParams.get('playerId') || 'anon';
    const nickname = url.searchParams.get('nickname') || '玩家';
    const { socket, response } = this.state.acceptWebSocket(request, [playerId, nickname]);

    const meta = await this.getRoomMeta();
    if (!meta) { socket.close(1008, '房间不存在'); return response; }

    // 握手：下发房间与当前全量快照（晚加入者靠这里对齐，不依赖历史 broadcast）
    socket.send(JSON.stringify({ type: 'connected', playerId }));
    socket.send(JSON.stringify({ type: 'roomUpdated', room: meta }));
    const a = await this.getAuthority();
    if (a) socket.send(JSON.stringify(a.snapshot()));

    if (!a && meta.status === 'waiting' && meta.players.length >= 2) {
      // 服务端自动开局：房主以外的人连接后才触发，避免单人空转
      await this.startGame(meta, a);
    }
    return response;
  }

  async startGame(meta, authority) {
    const players = meta.players.slice(0, meta.maxPlayers);
    const colors = players.map((_, i) => i + 1);
    const a = new AuthoritySession({
      gameSessionId: this.state.id.toString(),
      colors,
      pieceCount: 4,
      happy: false,
      seed: null
    });
    // 必须把颜色写回玩家：意图提交时服务端靠它校验"只能以自己的颜色出手"
    meta.players.forEach((p, i) => { p.color = colors[i]; });
    meta.status = 'playing';
    meta.gameSessionId = a.gameSessionId;
    await this.state.storage.put({ meta, authority: a.serialize() });
    await this.state.storage.setAlarm(Date.now() + RECONNECT_GRACE_MS);

    this.broadcast({ type: 'gameStarted', gameSessionId: a.gameSessionId, room: meta });
    this.broadcast(a.snapshot());
  }

  /** WebSocket 消息入口：唯一状态变更通道 */
  async webSocketMessage(ws, message) {
    let msg;
    try { msg = JSON.parse(message); } catch { return; }

    if (msg.type === 'ping') { ws.send(JSON.stringify({ type: 'pong', t: Date.now() })); return; }
    if (msg.type === 'snapshotRequest') {
      const a = await this.getAuthority();
      if (a) ws.send(JSON.stringify(a.markResumed()));
      return;
    }
    if (msg.type !== 'intent') return;

    const a = await this.getAuthority();
    if (!a) return;
    const meta = await this.getRoomMeta();
    const tags = this.state.getTags(ws);
    const player = meta?.players.find(p => p.playerId === tags[0]);
    if (!player) {
      ws.send(JSON.stringify({ type: 'intentRejected', reason: '未加入本房间' }));
      return;
    }
    if (meta.status !== 'playing' || player.color == null) {
      ws.send(JSON.stringify({ type: 'intentRejected', reason: '对局未开始' }));
      return;
    }
    // 服务端校验：只能以自己的颜色提交意图
    const result = a.applyIntent(player.color, msg.intent);
    if (!result.ok) {
      ws.send(JSON.stringify({ type: 'intentRejected', reason: result.error }));
      return;
    }
    await this.saveAuthority(a);
    // 广播权威快照，所有端整体替换本地棋面
    this.broadcast(result.snapshot);
  }

  async webSocketClose(ws, code, reason, wasClean) {
    this.state.storage.setAlarm(Date.now() + RECONNECT_GRACE_MS);
  }

  async webSocketError(ws, error) {
    // Hibernation 下无需手动清理，连接由运行时回收
  }

  broadcast(payload) {
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
    for (const ws of this.state.getWebSockets()) {
      try { ws.send(text); } catch { /* 断线连接会在 close 时回收 */ }
    }
  }

  /** 空房 / 长断线自毁；对局中有人在线则续期 */
  async alarm() {
    const meta = await this.getRoomMeta();
    if (!meta) return;
    const sockets = this.state.getWebSockets();
    if (sockets.length === 0) {
      await this.state.storage.deleteAll();
      return;
    }
    await this.state.storage.setAlarm(Date.now() + ROOM_TTL_MS);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' }
  });
}
