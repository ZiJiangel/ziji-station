/**
 * 服务端权威对局会话 — 从 _attic/ludo-source/backend/authority.cjs 移植为 ESM。
 * 规则裁决全部由 engine.mjs 在服务端执行；客户端只能发意图，不能上报棋面。
 * 与旧实现的差异：
 *   - 去掉内存 Map / eventLog 上限对 DO 的依赖，状态由 DO 持久化
 *   - 保留 seq、回放档案、事件流、完成度采样
 */
import * as engine from './engine.mjs';
import { encodeReplayAction } from './replayCodec.mjs';

const INTENT_TYPES = new Set(['roll', 'move', 'skip', 'teleport', 'item', 'debug']);
const ITEM_DICE_MAX = { 'remote-dice': 6, 'polyhedral-dice': 12 };
const ITEM_ACTIVATIONS = new Set(['remote-dice', 'teleport', 'mysteryBox']);
const EVENT_LOG_MAX = 2000;
const PROGRESS_FULL_ROUNDS = 100;
const PROGRESS_SAMPLE_STEP = 5;

/**
 * 意图白名单 — 逐字对齐旧 authority.cjs，避免规则分歧。
 * 非法字段一律拒绝，绝不把客户端原始对象送进引擎。
 */
function sanitizeIntent(intent) {
  switch (intent.type) {
    case 'move':
      return { type: 'move', chessIndex: Number(intent.chessIndex) };
    case 'teleport':
      return { type: 'teleport', chessIndex: Number(intent.chessIndex) };
    case 'skip':
      return { type: 'skip', reason: intent.reason === 'mysteryBox' ? 'mysteryBox' : null };
    case 'roll': {
      const maxDice = ITEM_DICE_MAX[intent.item];
      if (!maxDice) return { type: 'roll' };
      if (intent.value === undefined || intent.value === null) {
        return { type: 'roll', maxDice, noBonus: true, item: intent.item };
      }
      const value = Number(intent.value);
      if (!Number.isInteger(value) || value < 1 || value > maxDice) {
        throw new Error(`非法道具点数：${intent.value}`);
      }
      return { type: 'roll', value, maxDice, noBonus: true, item: intent.item };
    }
    case 'debug':
      return {
        type: 'debug', op: String(intent.op || ''), player: intent.player,
        chessIndex: intent.chessIndex, value: intent.value, delta: intent.delta
      };
    case 'item':
      return { type: 'item', item: ITEM_ACTIVATIONS.has(intent.item) ? intent.item : null };
    default:
      return { type: intent.type };
  }
}

function calcPlayerProgress(state, color, trackEnd) {
  const chesses = state.players?.[color]?.chesses;
  if (!Array.isArray(chesses)) return 0;
  const perPiece = 100 / chesses.length;
  let total = 0;
  let allAtBase = true;
  for (const chess of chesses) {
    if (chess.finished) {
      total += perPiece;
      allAtBase = false;
    } else if (chess.pos >= 0) {
      total += Math.min((chess.pos / trackEnd) * perPiece, perPiece);
      allAtBase = false;
    }
  }
  return allAtBase ? 0 : Math.round(total * 100) / 100;
}

export class AuthoritySession {
  constructor(options = {}) {
    const {
      gameSessionId, colors = [1, 2, 3, 4], pieceCount = 4,
      happy = false, skillMode = false, startEnergy = 0,
      seed = null, players = []
    } = options;

    this.gameSessionId = gameSessionId;
    // 引擎的回合顺序按颜色升序，加入顺序不能直接用
    this.colors = [...colors].sort((a, b) => a - b);
    this.pieceCount = pieceCount;
    this.happy = happy;
    this.seq = 0;
    this.state = engine.createState({
      players: this.colors, piecesPerPlayer: pieceCount, happy, skillMode, startEnergy
    });
    this.defeats = engine.emptyDefeatMatrix(this.colors);
    this.progressHistory = [];
    this.eventLog = [];
    this.eventLogCount = 0;
    this.lastIntentAt = Date.now();

    this.seed = Number.isInteger(seed) ? seed : Math.floor(Math.random() * 0xffffffff);
    this.rng = engine.makeRng(this.seed);
    this.actions = [];
    this.replayConfig = {
      gameSessionId, engineVersion: engine.ENGINE_VERSION,
      colors: this.colors, pieceCount, happy, skillMode, startEnergy
    };
  }

  /** 序列化状态，供 DO 在 hibernation 后重建（rng 需 resume） */
  serialize() {
    return {
      gameSessionId: this.gameSessionId, colors: this.colors,
      pieceCount: this.pieceCount, happy: this.happy,
      seq: this.seq, state: this.state, defeats: this.defeats,
      progressHistory: this.progressHistory, eventLog: this.eventLog,
      eventLogCount: this.eventLogCount, lastIntentAt: this.lastIntentAt,
      seed: this.seed, rngState: this.rng?.state ?? null,
      actions: this.actions
    };
  }

  static restore(data) {
    const s = new AuthoritySession({
      gameSessionId: data.gameSessionId, colors: data.colors,
      pieceCount: data.pieceCount, happy: data.happy, seed: data.seed
    });
    s.seq = data.seq || 0;
    s.state = data.state;
    s.defeats = data.defeats || engine.emptyDefeatMatrix(s.colors);
    s.progressHistory = data.progressHistory || [];
    s.eventLog = data.eventLog || [];
    s.eventLogCount = data.eventLogCount || 0;
    s.lastIntentAt = data.lastIntentAt || Date.now();
    s.actions = data.actions || [];
    s.rng = engine.makeRng(data.seed, data.rngState || null);
    return s;
  }

  recordAction(color, action) {
    this.actions.push([color, ...encodeReplayAction(action)]);
  }

  getReplay() {
    return {
      format: 1, ...this.replayConfig,
      seed: this.seed,
      finished: this.state.phase === 'ended' ? 1 : 0,
      winner: this.state.winner || 0,
      turn: this.state.turn || 0,
      actionCount: this.actions.length,
      actions: this.actions
    };
  }

  recordEvents(events) {
    if (!Array.isArray(events) || events.length === 0) return;
    this.eventLog.push(events.slice());
    this.eventLogCount += events.length;
    while (this.eventLogCount > EVENT_LOG_MAX && this.eventLog.length > 1) {
      this.eventLogCount -= this.eventLog.shift().length;
    }
  }

  recordProgress(round) {
    if (round > PROGRESS_FULL_ROUNDS && round % PROGRESS_SAMPLE_STEP !== 0) return;
    if (this.progressHistory.some(item => item.round === round)) return;
    const players = {};
    for (const color of this.colors) {
      players[color] = calcPlayerProgress(this.state, color, engine.TRACK_END);
    }
    this.progressHistory.push({ round, players });
    if (this.progressHistory.length > 500) this.progressHistory.shift();
  }

  /** 全量快照：客户端拿到后整体替换本地棋面，不做增量合并 */
  snapshot(events = []) {
    return engine.toSnapshot(this.state, {
      gameSessionId: this.gameSessionId,
      seq: this.seq,
      events,
      diceValue: this.state.dice,
      defeatCounts: this.defeats,
      progressHistory: this.progressHistory
    });
  }

  markResumed() {
    this.seq += 1;
    this.lastIntentAt = Date.now();
    return this.snapshot();
  }

  /** 唯一状态变更入口：白名单校验 → 引擎裁决 → 记档 → 返回新快照 */
  applyIntent(color, intent) {
    if (!this.colors.includes(Number(color))) {
      return { ok: false, error: `玩家 ${color} 不在本局` };
    }
    let sanitized;
    try {
      sanitized = sanitizeIntent(intent);
    } catch (error) {
      return { ok: false, error: error.message };
    }

    let result;
    try {
      result = engine.apply(this.state, Number(color), sanitized, this.rng);
    } catch (error) {
      return { ok: false, error: error.message };
    }

    this.state = result.state;
    this.seq += 1;
    engine.countBeats(this.defeats, result.events);
    this.recordProgress(this.state.turn);
    this.recordEvents(result.events);
    this.recordAction(Number(color), sanitized);
    this.lastIntentAt = Date.now();

    return { ok: true, snapshot: this.snapshot(result.events) };
  }

  isFinished() {
    return this.state.phase === 'ended';
  }
}
