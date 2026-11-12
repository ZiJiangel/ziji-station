import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../../lib/supabase';
import { toastSuccess, toastError } from '../../lib/toast';

// 预设二次元立绘
const SKINS = [
  { id: 'miku', name: '初音', color: '#39C5BB', glow: 'rgba(57,197,187,0.6)', icon: 'M' },
  { id: 'rem',  name: '雷姆', color: '#5BA4CF', glow: 'rgba(91,164,207,0.6)', icon: 'R' },
  { id: 'kurumi',name: '狂三', color: '#D33030', glow: 'rgba(211,48,48,0.6)', icon: 'K' },
  { id: 'saber', name: 'Saber', color: '#F2C94C', glow: 'rgba(242,201,76,0.6)', icon: 'S' },
];

// 15x15 经典飞行棋地图路径 (算法生成，非常精确)
const N = 15; // 15x15 网格
// 路径序列，从红色起飞点 (6,13) 开始，顺时针转一圈
const TRACK: [number, number][] = [
  // 左区上方
  [6,13],[6,12],[6,11],[6,10],[6,9], [5,8],[4,8],[3,8],[2,8],[1,8],[0,8],
  // 下区左侧
  [0,7],[0,6], [1,6],[2,6],[3,6],[4,6],[5,6], [6,5],[6,4],[6,3],[6,2],[6,1],[6,0],
  // 右区上方
  [7,0],[8,0], [8,1],[8,2],[8,3],[8,4],[8,5], [9,6],[10,6],[11,6],[12,6],[13,6],[14,6],
  // 上区右侧
  [14,7],[14,8], [13,8],[12,8],[11,8],[10,8],[9,8], [8,9],[8,10],[8,11],[8,12],[8,13],[8,14],
  // 回到起点前
  [7,14]
];

// 终点通道 (6个格子)，每个玩家有独立的
const HOME_RUNS = [
  [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]], // 红(右下)
  [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],     // 绿(左下)
  [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],     // 黄(左上)
  [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]]  // 蓝(右上)
];

// 停机坪坐标 (每个玩家4个格子的中心点)
const YARDS = [
  [[6,14],[6,15],[7,15],[7,14]], // 红(右下)
  [[-1,6],[-1,7],[0,7],[0,6]],   // 绿(左下)
  [[6,-1],[7,-1],[7,0],[6,0]],   // 黄(左上)
  [[14,6],[14,7],[15,7],[15,6]]  // 蓝(右上)
];

const STARTS = [0, 13, 26, 39];
const TRACK_LEN = 52;
const FINISH_POS = 58; // 52 + 6 个终点格

export default function FlightChess({ roomId, initialRoom }: { roomId: string, initialRoom: any }) {
  const [room, setRoom] = useState(initialRoom);
  const [myUid, setMyUid] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  
  const [rolling, setRolling] = useState(false);
  const [diceValue, setDiceValue] = useState<number | null>(null);
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

  // 解决棋子重叠：相同位置加一点偏移
  const getPieceCoords = (pos: number, playerIdx: number, pieceIdx: number, allPieces: any[]) => {
    let [x, y] = [0, 0];
    
    if (pos === 0) {
      // 在停机坪
      [x, y] = YARDS[playerIdx][pieceIdx];
    } else if (pos > TRACK_LEN) {
      // 终点通道 (53~58)
      const homeIdx = pos - TRACK_LEN - 1;
      [x, y] = HOME_RUNS[playerIdx][homeIdx];
    } else {
      // 外圈 (1~52)
      const idx = (STARTS[playerIdx] + pos - 1) % TRACK_LEN;
      [x, y] = TRACK[idx];
    }

    // 如果有多枚棋子在同一格，稍微偏移
    if (pos > 0 && pos <= TRACK_LEN) {
      const samePosCount = allPieces.filter(p => p.pos === pos).length;
      if (samePosCount > 1) {
        // 简单的类聚错位
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
      pieces: [0, 0, 0, 0] // 4 个棋子初始化在停机坪
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
    setDiceValue(null);
    
    // 假动画延迟（增加手感）
    await new Promise(r => setTimeout(r, 600));

    try {
      const { data: newState, error: err1 } = await supabase.rpc('fc_roll_dice', { p_room_id: roomId });
      if (err1) throw err1;
      
      setDiceValue(newState.lastDice);
      setRolling(false);

      // 如果后端判断没有合法的移动 (phase === 'moving')，自动跳过
      if (newState.phase === 'moving') {
        await new Promise(r => setTimeout(r, 800));
        await supabase.rpc('fc_skip_turn', { p_room_id: roomId });
        setDiceValue(null);
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
      const { data: newState, error } = await supabase.rpc('fc_move_piece', { p_room_id: roomId, p_piece_idx: pieceIdx });
      if (error) throw error;
      setDiceValue(null); // 移动完成，清空骰子状态
    } catch (e: any) {
      toastError(e.message);
    }
  };

  const renderBoard = () => {
    const grid = [];
    const trackSet = new Set(TRACK.map(([x,y]) => `${x}-${y}`));
    
    // 渲染底色格子
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const isTrack = trackSet.has(`${x}-${y}`);
        const isHomeRun = HOME_RUNS.some(run => run.some(([rx,ry]) => rx===x && ry===y));
        const isYard = YARDS.some(yard => yard.some(([yx,yy]) => yx===x && yy===y));
        const isCenter = x > 5 && x < 9 && y > 5 && y < 9;

        if (isCenter) {
          grid.push(<div key={`c-${x}-${y}`} style={{ gridColumn: x+1, gridRow: y+1, background: 'var(--border)', borderRadius: 8, margin: 2 }} />);
        } else if (isTrack || isHomeRun || isYard) {
          let bg = 'var(--bg-elevated)';
          if (isHomeRun) {
             const owner = HOME_RUNS.findIndex(run => run.some(([rx,ry]) => rx===x && ry===y));
             bg = `${SKINS[owner].color}40`;
          }
          if (isYard) bg = `${SKINS[YARDS.findIndex(yard => yard.some(([yx,yy]) => yx===x && yy===y))].color}20`;

          grid.push(
            <div key={`t-${x}-${y}`} style={{
              gridColumn: x + 1, gridRow: y + 1,
              background: bg,
              border: '1px solid var(--border)',
              borderRadius: 4, margin: 1,
              boxShadow: isTrack ? 'inset 0 0 8px rgba(0,0,0,0.05)' : 'none'
            }} />
          );
        } else {
          grid.push(<div key={`b-${x}-${y}`} style={{ gridColumn: x + 1, gridRow: y + 1 }} />);
        }
      }
    }

    // 提取所有棋子的扁平数组，用于计算重叠
    const allPieces: any[] = [];
    players.forEach((p: any, pIdx: number) => {
      p.pieces.forEach((pos: number, pcIdx: number) => {
        allPieces.push({ playerIdx: pIdx, pieceIdx: pcIdx, pos, player: p });
      });
    });

    const pieceEls = allPieces.map((item) => {
      const { x, y } = getPieceCoords(item.pos, item.playerIdx, item.pieceIdx, allPieces);
      const isSelectable = state.phase === 'awaiting_move' && myPlayerIdx === state.turnIndex;
      // 只有在可移动状态下，才能点击（后端会二次校验）
      
      return (
        <motion.div
          key={`p-${item.playerIdx}-${item.pieceIdx}`}
          layout
          initial={{ scale: 0 }}
          animate={{ scale: 1, x: `${(x + 0.5) * (100/15)}%`, y: `${(y + 0.5) * (100/15)}%` }}
          transition={{ type: 'spring', stiffness: 250, damping: 20 }}
          onClick={() => {
            if (isSelectable) {
              // 简单拦截：如果在停机坪且点数不对，后端会报错，这里也可以做前端提示
              handleMove(item.pieceIdx);
            }
          }}
          style={{
            position: 'absolute', top: 0, left: 0, width: '6.66%', height: '6.66%',
            zIndex: 10 + item.pieceIdx,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          <motion.div
            whileHover={isSelectable ? { scale: 1.3, zIndex: 30 } : {}}
            style={{
              width: '80%', height: '80%',
              background: item.player.color,
              borderRadius: '50%',
              boxShadow: `0 0 12px ${item.player.glow}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 10, fontWeight: 800,
              cursor: isSelectable ? 'pointer' : 'default',
              border: item.pos === FINISH_POS ? '2px solid #fff' : '1px solid rgba(255,255,255,0.3)'
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
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: 12, position: 'relative'
      }}>
        <div style={{
          display: 'grid', gridTemplateColumns: `repeat(${N}, 1fr)`, gridTemplateRows: `repeat(${N}, 1fr)`,
          width: '100%', height: '100%'
        }}>
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

      {/* 自定义规则弹窗 */}
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
