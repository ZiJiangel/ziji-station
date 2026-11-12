import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../../lib/supabase';
import { toastError } from '../../lib/toast';

// 预设二次元主题（带发光阴影）
const SKINS = [
  { id: 'miku', name: '初音', color: '#39C5BB', glow: 'rgba(57,197,187,0.8)', icon: 'M' },
  { id: 'rem',  name: '雷姆', color: '#5BA4CF', glow: 'rgba(91,164,207,0.8)', icon: 'R' },
  { id: 'kurumi',name: '狂三', color: '#D33030', glow: 'rgba(211,48,48,0.8)', icon: 'K' },
  { id: 'saber', name: 'Saber', color: '#F2C94C', glow: 'rgba(242,201,76,0.8)', icon: 'S' },
];

// ── 绝对精确的 15x15 飞行棋坐标系 ──

// 52格外圈轨道 (顺时针)
const TRACK: [number, number][] = [
  // 左臂上侧 (向右)
  [1,6],[2,6],[3,6],[4,6],[5,6],
  // 上臂左侧 (向上)
  [6,5],[6,4],[6,3],[6,2],[6,1],
  // 顶边 (向右)
  [6,0],[7,0],[8,0],
  // 上臂右侧 (向下)
  [8,1],[8,2],[8,3],[8,4],[8,5],
  // 右臂上侧 (向右)
  [9,6],[10,6],[11,6],[12,6],[13,6],
  // 右边 (向下)
  [14,6],[14,7],[14,8],
  // 右臂下侧 (向左)
  [13,8],[12,8],[11,8],[10,8],[9,8],
  // 下臂右侧 (向下)
  [8,9],[8,10],[8,11],[8,12],[8,13],
  // 底边 (向左)
  [8,14],[7,14],[6,14],
  // 下臂左侧 (向上)
  [6,13],[6,12],[6,11],[6,10],[6,9],
  // 左臂下侧 (向左)
  [5,8],[4,8],[3,8],[2,8],[1,8],
  // 左边 (向上)
  [0,8],[0,7],[0,6]
];
const TRACK_LEN = 52;
const FINISH_POS = 58;

// 四色起飞点索引 (红右下, 绿左下, 黄左上, 蓝右上)
const STARTS = [35, 48, 9, 26];

// 四色终点通道坐标
const HOME_RUNS = [
  [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]], // 0:红 右下
  [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],     // 1:绿 左下
  [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],     // 2:黄 左上
  [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]]  // 3:蓝 右上
];

// 营地内的四个棋子初始坐标
const YARDS_POS = [
  [[10,10],[13,10],[10,13],[13,13]], // 0:红 右下
  [[1,10],[4,10],[1,13],[4,13]],     // 1:绿 左下
  [[1,1],[4,1],[1,4],[4,4]],         // 2:黄 左上
  [[10,1],[13,1],[10,4],[13,4]]      // 3:蓝 右上
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

  // 计算棋子的绝对网格坐标
  const getPieceCoords = (pos: number, playerIdx: number, pieceIdx: number, allPieces: any[]) => {
    let [x, y] = [0, 0];
    
    if (pos === 0) {
      // 在营地，使用预设的 4 个点
      [x, y] = YARDS_POS[playerIdx][pieceIdx];
    } else if (pos > TRACK_LEN) {
      // 在终点通道
      const homeIdx = pos - TRACK_LEN - 1;
      [x, y] = HOME_RUNS[playerIdx][homeIdx];
    } else {
      // 在外圈轨道
      const idx = (STARTS[playerIdx] + pos - 1) % TRACK_LEN;
      [x, y] = TRACK[idx];
    }

    // 同格重叠时，稍微错开一点距离，避免完全盖住
    if (pos > 0 && pos <= TRACK_LEN) {
      const samePosCount = allPieces.filter(p => p.pos === pos).length;
      if (samePosCount > 1) {
        x += (pieceIdx % 2) * 0.3 - 0.15;
        y += Math.floor(pieceIdx / 2) * 0.3 - 0.15;
      }
    }
    return { x, y };
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

  // 绘制底层格子
  const renderCell = (x: number, y: number) => {
    const isTrack = TRACK.some(([tx,ty]) => tx===x && ty===y);
    const isHomeRun = HOME_RUNS.some(run => run.some(([hx,hy]) => hx===x && hy===y));
    const isCenter = x >= 6 && x <= 8 && y >= 6 && y <= 8;

    if (isCenter) {
      // 中心终点区
      return (
        <div key={`c-${x}-${y}`} style={{
          gridColumn: x+1, gridRow: y+1,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{ width: '50%', height: '50%', borderRadius: '50%', background: 'var(--primary)', opacity: 0.1 }} />
        </div>
      );
    }

    if (isTrack || isHomeRun) {
      let bg = 'var(--bg-elevated)';
      let border = 'var(--border)';
      
      if (isHomeRun) {
        const owner = HOME_RUNS.findIndex(run => run.some(([hx,hy]) => hx===x && hy===y));
        bg = `${SKINS[owner].color}30`;
        border = `${SKINS[owner].color}80`;
      }

      return (
        <div key={`c-${x}-${y}`} style={{
          gridColumn: x+1, gridRow: y+1,
          background: bg,
          border: `1px solid ${border}`,
          borderRadius: 3,
          margin: 1,
          boxShadow: 'inset 0 1px 3px rgba(255,255,255,0.05)',
          // 轨道内的中心小圆点
          backgroundImage: isTrack ? 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.1) 15%, transparent 20%)' : 'none'
        }} />
      );
    }

    return <div key={`c-${x}-${y}`} style={{ gridColumn: x+1, gridRow: y+1 }} />;
  };

  const renderBoard = () => {
    const grid = [];
    for (let y = 0; y < 15; y++) {
      for (let x = 0; x < 15; x++) {
        grid.push(renderCell(x, y));
      }
    }

    // 营地背景框
    const yards = [
      { x: 9, y: 9, color: SKINS[0].color }, // 红 右下
      { x: 0, y: 9, color: SKINS[1].color }, // 绿 左下
      { x: 0, y: 0, color: SKINS[2].color }, // 黄 左上
      { x: 9, y: 0, color: SKINS[3].color }  // 蓝 右上
    ].map((bg, i) => (
      <div key={`bg-${i}`} style={{
        gridColumn: `${bg.x + 1} / span 6`, gridRow: `${bg.y + 1} / span 6`,
        background: `${bg.color}15`,
        border: `2px solid ${bg.color}40`,
        borderRadius: 16,
        margin: 4,
        zIndex: 0
      }} />
    ));

    const allPieces: any[] = [];
    players.forEach((p: any, pIdx: number) => {
      p.pieces.forEach((pos: number, pcIdx: number) => {
        allPieces.push({ playerIdx: pIdx, pieceIdx: pcIdx, pos, player: p });
      });
    });

    const pieceEls = allPieces.map((item) => {
      const { x, y } = getPieceCoords(item.pos, item.playerIdx, item.pieceIdx, allPieces);
      const isSelectable = state.phase === 'awaiting_move' && myPlayerIdx === state.turnIndex;
      
      return (
        <motion.div
          key={`p-${item.playerIdx}-${item.pieceIdx}`}
          layout
          initial={{ scale: 0 }}
          animate={{ scale: 1, left: `${(x / 15) * 100}%`, top: `${(y / 15) * 100}%` }}
          transition={{ type: 'spring', stiffness: 250, damping: 20 }}
          onClick={() => { if (isSelectable) handleMove(item.pieceIdx); }}
          style={{
            position: 'absolute', width: '6.66%', height: '6.66%',
            zIndex: 10 + item.pieceIdx,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          <motion.div
            whileHover={isSelectable ? { scale: 1.3, zIndex: 30 } : {}}
            style={{
              width: '75%', height: '75%',
              background: `radial-gradient(circle at 30% 30%, ${item.player.color}, ${item.player.color}80)`,
              borderRadius: '50%',
              boxShadow: `0 0 12px ${item.player.glow}, inset 0 -2px 4px rgba(0,0,0,0.4), inset 0 2px 4px rgba(255,255,255,0.5)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 12, fontWeight: 800,
              cursor: isSelectable ? 'pointer' : 'default',
              border: item.pos === FINISH_POS ? '2px solid #fff' : '1px solid rgba(255,255,255,0.3)',
              textShadow: '0 1px 2px rgba(0,0,0,0.5)'
            }}
          >
            {item.player.icon}
          </motion.div>
        </motion.div>
      );
    });

    return (
      <div style={{
        width: '100%', maxWidth: 600, aspectRatio: 1,
        background: 'var(--surface)', 
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: 12,
        position: 'relative',
        boxShadow: '0 20px 40px -10px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.05) inset'
      }}>
        <div style={{
          display: 'grid', gridTemplateColumns: `repeat(15, 1fr)`, gridTemplateRows: `repeat(15, 1fr)`,
          width: '100%', height: '100%', position: 'relative'
        }}>
          {yards}
          {grid}
        </div>
        {pieceEls}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      <main style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <a href="/arcade" className="btn sm" style={{ textDecoration: 'none' }}>← 返回大厅</a>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0, fontFamily: 'var(--font-display)' }}>飞行棋</h1>
          {initialRoom.host_id === myUid && state.phase === 'waiting' && (
            <button className="btn sm" onClick={() => setShowRules(true)}>规则设置</button>
          )}
        </header>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {renderBoard()}
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
