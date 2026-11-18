/**
 * 飞行棋联机客户端 — 对接 fq-game Worker（Durable Objects）。
 * 协议刻意精简：握手 → 全量快照 → 意图 → 快照广播。
 * 服务端权威：本地只渲染快照，不直接改棋面。
 */

export type Snapshot = {
  type: 'gameSnapshot';
  gameSessionId: string;
  seq: number;
  currentPlayer: number;
  gamePhase: 'rolling' | 'selecting' | 'ended' | 'paused';
  diceValue: number | null;
  diceItem: boolean | string;
  pendingItem: string | null;
  winner: number | null;
  round: number;
  pieceCount: number;
  playerChess: Record<number, { position: number; finished: boolean }[]>;
  energy: Record<number, number>;
  defeats: Record<number, number>;
  events: any[];
  [key: string]: any;
};

export type RoomInfo = {
  id: string;
  gameType: string;
  status: 'waiting' | 'playing' | 'finished';
  hostId: string;
  hostName: string;
  players: { playerId: string; nickname: string; color: number | null }[];
};

type Handlers = {
  onSnapshot?: (s: Snapshot) => void;
  onRoom?: (r: RoomInfo) => void;
  onStatus?: (text: string) => void;
  onRejected?: (reason: string) => void;
  onClose?: () => void;
};

/**
 * Worker 地址优先级：
 *   1. window.__FQ_GAME_WORKER__（部署后在页面里注入）
 *   2. localStorage.fq_game_worker（本地临时指定）
 *   3. 本地开发默认 127.0.0.1:8787
 *   4. 生产默认同域（若把 Worker 挂在同域 /room 路由下）
 */
function baseUrl(): string {
  if (typeof window === 'undefined') return '';
  const h = window.location.host;
  const local = h.includes('localhost') || h.includes('127.0.0.1');
  const w = window as any;
  const saved = localStorage.getItem('fq_game_worker');
  // 本地开发优先连本地 Worker，除非手动在 localStorage 指定了地址
  if (saved) return saved.replace(/\/$/, '');
  if (local) return 'http://127.0.0.1:8787';
  if (w.__FQ_GAME_WORKER__) return String(w.__FQ_GAME_WORKER__).replace(/\/$/, '');
  return window.location.origin;
}

export async function createRoom(opts: {
  hostId: string; hostName: string; gameType?: string;
}): Promise<{ id: string; room: RoomInfo }> {
  const res = await fetch(`${baseUrl()}/lobby/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...opts, gameType: opts.gameType || 'ludo' })
  });
  if (!res.ok) throw new Error(`建房失败 (${res.status})`);
  return res.json();
}

export async function joinRoom(roomId: string, playerId: string, nickname: string) {
  const res = await fetch(`${baseUrl()}/room/${roomId}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ playerId, nickname })
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `加入失败 (${res.status})`);
  }
  return res.json();
}

export async function getRoomState(roomId: string): Promise<{
  room: RoomInfo; snapshot: Snapshot | null; replay: any;
}> {
  const res = await fetch(`${baseUrl()}/room/${roomId}/state`);
  if (!res.ok) throw new Error(`读取房间失败 (${res.status})`);
  return res.json();
}

/** 带心跳与指数退避重连的 WebSocket 连接 */
export class GameClient {
  private ws: WebSocket | null = null;
  private timer: number | null = null;
  private retry = 0;
  private closed = false;
  private lastSeq = 0;

  constructor(
    private roomId: string,
    private playerId: string,
    private nickname: string,
    private handlers: Handlers = {}
  ) {}

  connect() {
    this.closed = false;
    const http = baseUrl() || window.location.origin;
    const wsUrl = http.replace(/^http/, 'ws')
      + `/room/${this.roomId}?playerId=${encodeURIComponent(this.playerId)}`
      + `&nickname=${encodeURIComponent(this.nickname)}`;

    this.ws = new WebSocket(wsUrl);
    this.ws.onopen = () => {
      this.retry = 0;
      this.handlers.onStatus?.('已连接');
      this.startHeartbeat();
    };
    this.ws.onmessage = ev => {
      let msg: any;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === 'gameSnapshot') {
        // seq 去重：丢弃重复与倒退帧（旧协议的 SnapshotGate 语义）
        if (typeof msg.seq === 'number' && msg.seq <= this.lastSeq) return;
        if (typeof msg.seq === 'number') this.lastSeq = msg.seq;
        this.handlers.onSnapshot?.(msg as Snapshot);
      } else if (msg.type === 'roomUpdated' || msg.type === 'gameStarted' || msg.type === 'roomCreated') {
        this.handlers.onRoom?.(msg.room as RoomInfo);
      } else if (msg.type === 'intentRejected') {
        this.handlers.onRejected?.(msg.reason || '动作被拒绝');
      } else if (msg.type === 'pong') {
        // 心跳响应，忽略
      }
    };
    this.ws.onclose = () => {
      this.stopHeartbeat();
      this.handlers.onClose?.();
      if (!this.closed) this.scheduleReconnect();
    };
    this.ws.onerror = () => { /* onclose 会处理重连 */ };
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.timer = window.setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 15000);
  }

  private stopHeartbeat() {
    if (this.timer != null) { window.clearInterval(this.timer); this.timer = null; }
  }

  private scheduleReconnect() {
    this.retry += 1;
    if (this.retry > 5) {
      this.handlers.onStatus?.('连接已断开，请刷新页面');
      return;
    }
    const delay = Math.min(1000 * 2 ** (this.retry - 1), 16000);
    this.handlers.onStatus?.(`连接中断，${delay / 1000} 秒后重连…`);
    window.setTimeout(() => this.connect(), delay);
  }

  /** 发送意图：掷骰 / 移动 / 跳过 */
  sendIntent(intent: { type: string; [key: string]: any }) {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      this.handlers.onStatus?.('尚未连接，请稍候');
      return false;
    }
    this.ws.send(JSON.stringify({ type: 'intent', intent }));
    return true;
  }

  /** 重连后强制对齐一次全量快照 */
  requestSnapshot() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.lastSeq = 0;
      this.ws.send(JSON.stringify({ type: 'snapshotRequest' }));
    }
  }

  close() {
    this.closed = true;
    this.stopHeartbeat();
    this.ws?.close();
    this.ws = null;
  }
}
