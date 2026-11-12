import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../../lib/supabase';
import { toastError } from '../../lib/toast';

const SKINS = [
  { id: 'miku', name: '初音', color: '#39C5BB', glow: 'rgba(57,197,187,0.8)', icon: 'M' },
  { id: 'rem',  name: '雷姆', color: '#5BA4CF', glow: 'rgba(91,164,207,0.8)', icon: 'R' },
  { id: 'kurumi',name: '狂三', color: '#D33030', glow: 'rgba(211,48,48,0.8)', icon: 'K' },
  { id: 'saber', name: 'Saber', color: '#F2C94C', glow: 'rgba(242,201,76,0.8)', icon: 'S' },
];

// 15x15 标准轨道坐标转 SVG 坐标映射
// 原项目 viewBox="-95,-95,190,190"，中心为0，格点间隔 12，即 (x - 7) * 12
const toSVG = (x: number, y: number) => ({
  x: (x - 7) * 12,
  y: (y - 7) * 12
});

const TRACK: [number, number][] = [
  [1,6],[2,6],[3,6],[4,6],[5,6],
  [6,5],[6,4],[6,3],[6,2],[6,1],
  [6,0],[7,0],[8,0],
  [8,1],[8,2],[8,3],[8,4],[8,5],
  [9,6],[10,6],[11,6],[12,6],[13,6],
  [14,6],[14,7],[14,8],
  [13,8],[12,8],[11,8],[10,8],[9,8],
  [8,9],[8,10],[8,11],[8,12],[8,13],
  [8,14],[7,14],[6,14],
  [6,13],[6,12],[6,11],[6,10],[6,9],
  [5,8],[4,8],[3,8],[2,8],[1,8],
  [0,8],[0,7],[0,6]
];
const TRACK_LEN = 52;
const FINISH_POS = 58;

// 0:红 右下, 1:绿 左下, 2:黄 左上, 3:蓝 右上
const STARTS = [35, 48, 9, 26];
const PLAYER_CLASSES = ['player-1', 'player-2', 'player-3', 'player-4'];

const HOME_RUNS = [
  [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],
  [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],
  [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],
  [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]]
];

const YARDS_POS = [
  [[10,10],[13,10],[10,13],[13,13]],
  [[1,10],[4,10],[1,13],[4,13]],
  [[1,1],[4,1],[1,4],[4,4]],
  [[10,1],[13,1],[10,4],[13,4]]
];

export default function FlightChess({ roomId, initialRoom }: { roomId: string, initialRoom: any }) {
  const [room, setRoom] = useState(initialRoom);
  const [myUid, setMyUid] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [rolling, setRolling] = useState(false);
  const [showRules, setShowRules] = useState(false);
  
  const state = room.state || { 
    phase: 'waiting', players: [], turnIndex: 0, lastDice: null, logs: [],
    rules: { takeoffRoll: 6, extraTurnOnSix: true, finishMode: 'exact' }
  };
  const players = state.players || [];
  const myPlayerIdx = players.findIndex((p: any) => p.uid === myUid);
  const myPlayer = players[myPlayerIdx];

  useEffect(() => {
    const uid = localStorage.getItem('ziji_uid');
    const uname = localStorage.getItem('ziji_user') || '玩家';
    if (uid) { setMyUid(uid); setUsername(uname); }

    const channel = supabase.channel('room_' + roomId)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_rooms', filter: `id=eq.${roomId}` }, (payload) => {
        setRoom(payload.new);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomId]);

  const getPiecePos = (pos: number, playerIdx: number, pieceIdx: number, allPieces: any[]) => {
    let x = 0, y = 0;
    
    if (pos === 0) {
      [x, y] = YARDS_POS[playerIdx][pieceIdx];
    } else if (pos > TRACK_LEN) {
      const homeIdx = pos - TRACK_LEN - 1;
      [x, y] = HOME_RUNS[playerIdx][homeIdx];
    } else {
      const idx = (STARTS[playerIdx] + pos - 1) % TRACK_LEN;
      [x, y] = TRACK[idx];
    }

    const svgPt = toSVG(x, y);

    // 同格重叠错位处理
    if (pos > 0 && pos <= TRACK_LEN) {
      const samePosCount = allPieces.filter(p => p.pos === pos).length;
      if (samePosCount > 1) {
        svgPt.x += (pieceIdx % 2) * 3 - 1.5;
        svgPt.y += Math.floor(pieceIdx / 2) * 3 - 1.5;
      }
    }
    return svgPt;
  };

  const joinRoom = async (skin: any) => {
    if (!myUid) return toastError('请先登录');
    if (myPlayer) return toastError('你已经在房间里了');
    
    const newPlayer = {
      uid: myUid, name: username, skinId: skin.id, color: skin.color, glow: skin.glow, icon: skin.icon,
      pieces: [0, 0, 0, 0]
    };
    const newPlayers = [...players, newPlayer];
    const newState = { ...state, players: newPlayers, logs: [...(state.logs||[]), `${username} 加入了游戏（${skin.name}）`] };
    const { error } = await supabase.from('game_rooms').update({ state: newState }).eq('id', roomId);
    if (error) toastError(error.message);
  };

  const startGame = async () => {
    if (!myPlayer) return;
    if (initialRoom.host_id !== myUid) return toastError('只有房主能开始');
    if (players.length < 2) return toastError('至少需要 2 名玩家');
    const newState = { ...state, phase: 'waiting_roll', turnIndex: 0, logs: [...(state.logs||[]), '游戏开始！'] };
    await supabase.from('game_rooms').update({ status: 'playing', state: newState }).eq('id', roomId);
  };

  const saveRules = async (newRules: any) => {
    const newState = { ...state, rules: newRules };
    await supabase.from('game_rooms').update({ state: newState }).eq('id', roomId);
    setShowRules(false);
  };

  const handleRoll = async () => {
    if (rolling) return;
    if (state.players[state.turnIndex]?.uid !== myUid) return toastError('还没轮到你');
    setRolling(true);
    await new Promise(r => setTimeout(r, 600));
    try {
      const { data: newState, error: err1 } = await supabase.rpc('fc_roll_dice', { p_room_id: roomId });
      if (err1) throw err1;
      setRolling(false);
      if (newState.phase === 'moving') {
        await new Promise(r => setTimeout(r, 800));
        await supabase.rpc('fc_skip_turn', { p_room_id: roomId });
      }
    } catch (e: any) {
      toastError(e.message);
      setRolling(false);
    }
  };

  const handleMove = async (pieceIdx: number) => {
    if (state.phase !== 'awaiting_move') return;
    if (myPlayerIdx !== state.turnIndex) return;
    try {
      const { error } = await supabase.rpc('fc_move_piece', { p_room_id: roomId, p_piece_idx: pieceIdx });
      if (error) throw error;
    } catch (e: any) {
      toastError(e.message);
    }
  };

  const renderSVGBoard = () => {
    const allPieces: any[] = [];
    players.forEach((p: any, pIdx: number) => {
      p.pieces.forEach((pos: number, pcIdx: number) => {
        allPieces.push({ playerIdx: pIdx, pieceIdx: pcIdx, pos, player: p });
      });
    });

    return (
      <svg viewBox="-95,-95,190,190" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%', maxHeight: '80vh' }}>
        <defs>
          <filter id="neonGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
            <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <rect id="vr" rx="2" ry="2" x="-5.5" y="-7.5" width="11" height="15" stroke-width="0.8" fill="currentColor" />
          <rect id="hr" rx="2" ry="2" x="-7.5" y="-5.5" width="15" height="11" stroke-width="0.8" fill="currentColor" />
          <rect id="vr2" rx="2" ry="2" x="-5" y="-5.5" width="10" height="11" stroke-width="0.8" fill="currentColor" />
          <rect id="hr2" rx="2" ry="2" x="-5.5" y="-5" width="11" height="10" stroke-width="0.8" fill="currentColor" />
          <path id="t1" d="M6.16 6.45A0.5 0.5 0 0 1 5.81 7.3H-5.5A2 2 0 0 1 -7.5 5.3V-5.81A0.5 0.5 0 0 1 -6.65 -6.16Z" stroke-width="0.8" fill="currentColor" />
          <path id="t2" d="M-6.16 6.45A0.5 0.5 0 0 0 -5.81 7.3H5.5A2 2 0 0 0 7.5 5.3V-5.81A0.5 0.5 0 0 0 6.65 -6.16Z" stroke-width="0.8" fill="currentColor" />
          <path id="t3" d="M6.16 -6.45A0.5 0.5 0 0 0 5.81 -7.3H-5.5A2 2 0 0 0 -7.5 -5.3V5.81A0.5 0.5 0 0 0 -6.65 6.16Z" stroke-width="0.8" fill="currentColor" />
          <path id="t4" d="M-6.16 -6.45A0.5 0.5 0 0 1 -5.81 -7.3H5.5A2 2 0 0 1 7.5 -5.3V5.81A0.5 0.5 0 0 1 6.65 6.16Z" stroke-width="0.8" fill="currentColor" />
          <path id="end" d="M0,0L-10,10Q-8,10 -6,10H6Q8,10 10,10L0,0Z" stroke-width="0.6" fill="currentColor" stroke-linejoin="round" stroke-linecap="round" />
          <g id="start">
            <rect width="28" height="28" x="-14" y="-14" rx="2" ry="2" stroke-width="0.6" fill="none" />
            <circle r="4.8" cx="5.8" cy="5.8" stroke-width="0.6" fill="none" />
            <circle r="4.8" cx="-5.8" cy="5.8" stroke-width="0.6" fill="none" />
            <circle r="4.8" cx="5.8" cy="-5.8" stroke-width="0.6" fill="none" />
            <circle r="4.8" cx="-5.8" cy="-5.8" stroke-width="0.6" fill="none" />
          </g>
          <g id="chess" transform="scale(0.34)">
            <circle cx="16.5" cy="16.5" r="14" fill="none" stroke="currentColor" stroke-width="3" />
            <circle cx="16.5" cy="16.5" r="13" fill="currentColor" class="chess-fill" />
            <path class="chess-airplane" d="M599.06048 831.309824l12.106752-193.404928 372.860928 184.430592L984.02816 710.206464 617.906176 367.33952 617.906176 151.638016c0-56.974336-46.188544-143.064064-103.158784-143.064064-56.974336 0-103.158784 86.089728-103.158784 143.064064L411.588608 367.33952 45.461504 710.206464l0 112.129024 366.660608-184.430592 14.999552 209.27488c0 5.05344 0.594944 9.892864 1.124352 14.749696l-66.591744 60.348416 0 66.587648 153.986048-50.879488 2.43712-0.80896 147.439616 51.688448 0-66.587648-68.758528-62.253056L599.06048 831.309824z" fill="white" transform="translate(16.5, 16.5) rotate(90) scale(0.018) translate(-512, -512)" />
          </g>
        </defs>

        {/* 渲染起飞区 */}
        {[
          { x: -68, y: 72, p: 0 }, // 红右下
          { x: 72, y: -68, p: 1 }, // 绿左下
          { x: -72, y: -68, p: 2 }, // 黄左上
          { x: 68, y: 68, p: 3 }   // 蓝右上
        ].map(s => (
          <use key={`start-${s.p}`} href="#start" x={s.x} y={s.y} className={PLAYER_CLASSES[s.p]} />
        ))}

        {/* 渲染外圈 52 格 */}
        {TRACK.map((pos, idx) => {
          const { x, y } = toSVG(pos[0], pos[1]);
          const isV = (y === -80 || y === 80);
          const href = isV ? '#vr' : '#hr';
          return <use key={`track-${idx}`} href={href} x={x} y={y} className="track-tile" data-cpos={idx} />;
        })}

        {/* 渲染终点通道 */}
        {HOME_RUNS.map((run, pIdx) => 
          run.map((pos, idx) => {
            const { x, y } = toSVG(pos[0], pos[1]);
            const isV = (x === 0);
            const href = isV ? '#vr2' : '#hr2';
            return <use key={`home-${pIdx}-${idx}`} href={href} x={x} y={y} className={PLAYER_CLASSES[pIdx]} />;
          })
        )}

        {/* 渲染终点三角形 */}
        {[
          { rot: 0, p: 0 }, { rot: 90, p: 1 }, { rot: 180, p: 2 }, { rot: 270, p: 3 }
        ].map(tri => (
          <use key={`end-${tri.p}`} href="#end" x="0" y="-2" className={PLAYER_CLASSES[tri.p]} transform={`rotate(${tri.rot},0,0) translate(0,3)`} />
        ))}

        {/* 渲染棋子 */}
        {allPieces.map(item => {
          const { x, y } = getPiecePos(item.pos, item.playerIdx, item.pieceIdx, allPieces);
          const isSelectable = state.phase === 'awaiting_move' && myPlayerIdx === state.turnIndex;
          return (
            <motion.g
              key={`piece-${item.playerIdx}-${item.pieceIdx}`}
              initial={false}
              animate={{ x, y }}
              transition={{ type: 'spring', stiffness: 250, damping: 20 }}
              onClick={() => { if (isSelectable) handleMove(item.pieceIdx); }}
              style={{ cursor: isSelectable ? 'pointer' : 'default', zIndex: 10 + item.pieceIdx }}
            >
              <use href="#chess" className={PLAYER_CLASSES[item.playerIdx]} filter="url(#neonGlow)" />
            </motion.g>
          );
        })}
      </svg>
    );
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      {/* 全局 SVG 样式注入 */}
      <style>{`
        .player-1 { color: #E74C3C; }
        .player-2 { color: #2ECC71; }
        .player-3 { color: #F1C40F; }
        .player-4 { color: #3498DB; }
        .track-tile { opacity: 0.3; }
        .chess-fill { fill: currentColor; }
        .chess-airplane { fill: #fff; }
        g[onclick]:hover { filter: brightness(1.2); }
      `}</style>
      
      <main style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <a href="/arcade" className="btn sm" style={{ textDecoration: 'none' }}>← 返回大厅</a>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0, fontFamily: 'var(--font-display)' }}>飞行棋</h1>
          {initialRoom.host_id === myUid && state.phase === 'waiting' && (
            <button className="btn sm" onClick={() => setShowRules(true)}>规则设置</button>
          )}
        </header>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {renderSVGBoard()}
        </div>

        <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32 }}>
          <AnimatePresence mode="wait">
            {state.phase === 'waiting' && players.length < 2 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ color: 'var(--muted)' }}>等待玩家加入…</motion.div>
            )}
            
            {state.phase === 'waiting' && players.length >= 2 && initialRoom.host_id === myUid && (
              <motion.button className="btn primary" onClick={startGame}>开始游戏</motion.button>
            )}

            {(state.phase === 'waiting_roll' || state.phase === 'awaiting_move') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                <motion.div
                  animate={rolling ? { rotateX: [0, 360, 720, 1080], rotateY: [0, 360, 720, 1080] } : { rotateX: 0, rotateY: 0 }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  style={{
                    width: 64, height: 64, background: 'var(--surface)', border: '2px solid var(--primary)',
                    borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 32, fontWeight: 800, color: 'var(--primary)', boxShadow: '0 8px 24px rgba(0,0,0,0.1)'
                  }}
                >
                  {rolling ? '?' : (state.lastDice || '-')}
                </motion.div>

                <button 
                  className="btn primary" 
                  onClick={handleRoll}
                  disabled={state.players[state.turnIndex]?.uid !== myUid || rolling || state.phase !== 'waiting_roll'}
                  style={{ minWidth: 120, height: 48, fontSize: 16, opacity: state.players[state.turnIndex]?.uid !== myUid ? 0.5 : 1 }}
                >
                  {state.phase === 'awaiting_move' ? '请点击棋子移动' : 
                   (state.players[state.turnIndex]?.uid === myUid ? '掷骰子' : '等对方掷骰')}
                </button>
              </div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <aside style={{ width: 320, borderLeft: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 20, borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 12px' }}>玩家列表</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {players.map((p: any, i: number) => (
              <div key={p.uid} style={{ 
                display: 'flex', alignItems: 'center', gap: 12, padding: 12, 
                background: state.turnIndex === i && state.phase !== 'waiting' ? 'var(--bg-elevated)' : 'transparent',
                borderRadius: 'var(--radius-sm)',
                border: state.turnIndex === i && state.phase !== 'waiting' ? '1px solid var(--border)' : '1px solid transparent'
              }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: p.color, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800 }}>{p.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    已到达: {p.pieces.filter((pos: number) => pos === FINISH_POS).length} / 4
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {!myPlayer && (
          <div style={{ padding: 20, borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 12px' }}>选择主题</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {SKINS.map(s => (
                <button key={s.id} onClick={() => joinRoom(s)} className="btn sm" 
                  style={{ borderColor: s.color, color: s.color }}>加入 · {s.name}</button>
              ))}
            </div>
          </div>
        )}

        <div style={{ flex: 1, padding: 20, overflowY: 'auto' }}>
          <h3 style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 12px' }}>战况日志</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(state.logs || []).slice().reverse().map((log: string, i: number) => (
              <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} key={i} style={{ fontSize: 12, color: 'var(--secondary)', padding: '6px 0', borderBottom: '1px dashed var(--border)' }}>{log}</motion.div>
            ))}
          </div>
        </div>
      </aside>

      <AnimatePresence>
        {showRules && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} style={{ background: 'var(--surface)', padding: 24, borderRadius: 'var(--radius-lg)', width: 360 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>自定义规则</h2>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, color: 'var(--secondary)' }}>起飞点数</label>
                <select className="f" defaultValue={state.rules?.takeoffRoll || 6} onChange={e => saveRules({...state.rules, takeoffRoll: Number(e.target.value)})}>
                  <option value="1">1 点</option>
                  <option value="5">5 点</option>
                  <option value="6">6 点</option>
                </select>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, color: 'var(--secondary)' }}>终点规则</label>
                <select className="f" defaultValue={state.rules?.finishMode || 'exact'} onChange={e => saveRules({...state.rules, finishMode: e.target.value})}>
                  <option value="exact">必须掷出精确点数</option>
                  <option value="overshoot">超过点数直接到达</option>
                </select>
              </div>
              <button className="btn primary" style={{ width: '100%', marginTop: 12 }} onClick={() => setShowRules(false)}>关闭</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
