import { useEffect, useRef, useState } from 'react';
import { GameClient, joinRoom, getRoomState, type Snapshot, type RoomInfo } from '../../lib/gameClient';

const COLOR_NAME: Record<number, string> = { 1: '红', 2: '绿', 3: '黄', 4: '蓝' };
const COLOR_HEX: Record<number, string> = { 1: '#d9453f', 2: '#2f9e63', 3: '#d9a92e', 4: '#3a72c4' };

export default function OnlineRoom({ roomId }: { roomId: string }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [status, setStatus] = useState('连接中…');
  const [error, setError] = useState('');
  const [uid, setUid] = useState('');
  const [nickname, setNickname] = useState('');
  const clientRef = useRef<GameClient | null>(null);

  useEffect(() => {
    const myUid = localStorage.getItem('ziji_uid') || '';
    const myName = localStorage.getItem('ziji_user') || '玩家';
    setUid(myUid); setNickname(myName);
    if (!myUid) { setStatus('请先登录'); setError('需要先登录才能进入房间。'); return; }

    let client: GameClient;
    let cancelled = false;

    (async () => {
      try {
        // 先拉一次全量状态（晚加入者靠这里对齐，不依赖历史广播）
        const init = await getRoomState(roomId);
        if (cancelled) return;
        setRoom(init.room);
        if (init.snapshot) setSnap(init.snapshot);

        await joinRoom(roomId, myUid, myName);
        client = new GameClient(roomId, myUid, myName, {
          onSnapshot: (s) => { if (!cancelled) setSnap(s); },
          onRoom: (r) => { if (!cancelled) setRoom(r); },
          onStatus: (t) => { if (!cancelled) setStatus(t); },
          onRejected: (r) => { if (!cancelled) { setError(r); window.setTimeout(() => setError(''), 2600); } },
          onClose: () => { if (!cancelled) setStatus('连接已断开'); }
        });
        clientRef.current = client;
        client.connect();
      } catch (e: any) {
        if (!cancelled) { setError(e.message || '进入房间失败'); setStatus('进入失败'); }
      }
    })();

    return () => { cancelled = true; client?.close(); clientRef.current = null; };
  }, [roomId]);

  const myColor = room?.players.find(p => p.playerId === uid)?.color ?? null;
  const isMyTurn = snap != null && myColor != null && snap.currentPlayer === myColor;
  const canRoll = isMyTurn && snap?.gamePhase === 'rolling';
  const canMove = isMyTurn && snap?.gamePhase === 'selecting';

  const move = (index: number) => clientRef.current?.sendIntent({ type: 'move', chessIndex: index });
  const roll = () => { setError(''); clientRef.current?.sendIntent({ type: 'roll' }); };

  const movable = snap && canMove
    ? (snap.playerChess[myColor!] || [])
        .map((c, i) => ({ i, pos: c.position, finished: c.finished }))
        .filter(c => !c.finished && c.pos >= 0)
    : [];

  return (
    <div className="online-room">
      <div className="room-bar">
        <div>
          <b>{room?.gameType === 'ludo' ? '飞行棋' : room?.gameType || '对局'}</b>
          <span className="muted">　房间 {roomId.slice(0, 8)}</span>
        </div>
        <span className={`conn ${status === '已连接' ? 'ok' : ''}`}>{status}</span>
      </div>

      {error && <div className="err">{error}</div>}

      <div className="players">
        {(room?.players || []).map(p => (
          <div key={p.playerId} className={`player ${snap?.currentPlayer === p.color ? 'active' : ''}`}>
            <span className="dot" style={{ background: COLOR_HEX[p.color || 1] }} />
            <span>{p.nickname}</span>
            {p.color != null && <small>{COLOR_NAME[p.color]}</small>}
            {p.playerId === uid && <small className="me">我</small>}
          </div>
        ))}
      </div>

      {!snap ? (
        <div className="waiting">
          <b>等待对局开始</b>
          <p>再邀请一位朋友进入同一房间即可开局。</p>
          <button onClick={() => clientRef.current?.requestSnapshot()}>重新同步</button>
        </div>
      ) : (
        <>
          <div className="board">
            {snap.playerChess && Object.entries(snap.playerChess).map(([color, chesses]) => (
              <div className="row" key={color}>
                <div className="row-label">
                  <span className="dot" style={{ background: COLOR_HEX[Number(color)] }} />
                  {COLOR_NAME[Number(color)] || color}
                  <small>{(snap.energy?.[Number(color)] ?? 0)} 分</small>
                </div>
                <div className="pieces">
                  {chesses.map((c, i) => (
                    <button
                      key={i}
                      className={`piece ${c.finished ? 'done' : ''} ${canMove && movable.some(m => m.i === i) ? 'movable' : ''}`}
                      style={{ borderColor: COLOR_HEX[Number(color)] }}
                      onClick={() => canMove && move(i)}
                      disabled={!canMove || !movable.some(m => m.i === i)}
                      title={`第 ${i + 1} 颗：${c.finished ? '已到达' : c.position > 0 ? `位置 ${c.position}` : '在基地'}`}
                    >
                      {c.finished ? '✓' : c.position > 0 ? c.position : '·'}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="action">
            <div className="dice">
              {snap.diceValue ? <b>{snap.diceValue}</b> : <span>—</span>}
              <small>{isMyTurn ? '轮到你' : `等待 ${COLOR_NAME[snap.currentPlayer] || '其他玩家'}`}</small>
            </div>
            <button className="roll" onClick={roll} disabled={!canRoll}>
              {canRoll ? '掷骰子' : snap.gamePhase === 'ended' ? '对局结束' : '等待回合'}
            </button>
          </div>

          <div className="events">
            <div className="events-title">最近动态 <small>seq {snap.seq}</small></div>
            {(snap.events || []).slice(-6).reverse().map((e, i) => (
              <div key={i} className="event">
                <span className="dot" style={{ background: COLOR_HEX[e.player] || 'var(--text-muted)' }} />
                {e.type === 'dice' ? `掷出 ${e.value}` :
                 e.type === 'move' ? '移动棋子' :
                 e.type === 'beat' ? '击败对手' :
                 e.type === 'finish' ? '到达终点' : e.type}
              </div>
            ))}
            {!snap.events?.length && <div className="muted">还没有动作</div>}
          </div>
        </>
      )}

      <style>{`
        .online-room{max-width:640px;margin:0 auto;font-family:inherit;color:var(--text-primary)}
        .room-bar{display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid var(--border-light)}
        .conn{font-size:12px;color:var(--text-muted)}
        .conn.ok{color:var(--success,#2f9e63)}
        .muted{color:var(--text-muted)}
        .err{margin-top:12px;padding:10px 14px;border:1px solid var(--danger);border-radius:8px;color:var(--danger);font-size:13px}
        .players{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0}
        .player{display:flex;align-items:center;gap:7px;padding:7px 12px;border:1px solid var(--border-light);border-radius:99px;font-size:13px}
        .player.active{border-color:var(--text-primary);font-weight:500}
        .player small{color:var(--text-muted);font-size:11px}
        .player small.me{color:var(--text-primary);border:1px solid var(--border-light);border-radius:99px;padding:0 6px}
        .dot{width:9px;height:9px;border-radius:50%;display:inline-block;flex:0 0 auto}
        .waiting{padding:48px 20px;text-align:center;border:1px dashed var(--border-light);border-radius:12px}
        .waiting p{color:var(--text-muted);font-size:13px}
        .waiting button,.roll{padding:10px 18px;border:1px solid var(--border-light);border-radius:8px;background:var(--elevated);color:var(--text-primary);cursor:pointer}
        .board{border:1px solid var(--border-light);border-radius:12px;padding:8px 16px}
        .row{display:flex;align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid var(--border-light)}
        .row:last-child{border-bottom:0}
        .row-label{width:74px;display:flex;align-items:center;gap:6px;font-size:13px}
        .row-label small{margin-left:auto;color:var(--text-muted);font-size:11px}
        .pieces{display:flex;gap:8px;flex-wrap:wrap}
        .piece{width:36px;height:36px;border-radius:8px;border:2px solid;background:transparent;color:var(--text-primary);cursor:default;font-size:12px}
        .piece.movable{cursor:pointer;outline:2px solid var(--text-primary);outline-offset:2px}
        .piece.done{background:var(--elevated)}
        .action{display:flex;align-items:center;gap:18px;margin:18px 0}
        .dice{display:flex;align-items:baseline;gap:8px}
        .dice b{font-size:32px}
        .dice span{font-size:32px;color:var(--text-muted)}
        .dice small{color:var(--text-muted)}
        .roll:disabled{opacity:.45;cursor:not-allowed}
        .events{border-top:1px solid var(--border-light);padding-top:14px}
        .events-title{font-size:13px;font-weight:500;margin-bottom:8px}
        .events-title small{color:var(--text-muted);font-weight:400}
        .event{display:flex;align-items:center;gap:8px;font-size:12px;padding:4px 0;color:var(--text-secondary)}
      `}</style>
    </div>
  );
}
