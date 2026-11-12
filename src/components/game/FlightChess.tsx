import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../../lib/supabase';
import { toastSuccess, toastError } from '../../lib/toast';

const SKINS = [
  { id: 'miku', name: '初音', color: '#39C5BB', glow: 'rgba(57,197,187,0.6)', icon: 'M' },
  { id: 'rem',  name: '雷姆', color: '#5BA4CF', glow: 'rgba(91,164,207,0.6)', icon: 'R' },
  { id: 'kurumi',name: '狂三', color: '#D33030', glow: 'rgba(211,48,48,0.6)', icon: 'K' },
  { id: 'saber', name: 'Saber', color: '#F2C94C', glow: 'rgba(242,201,76,0.6)', icon: 'S' },
];

function buildTrack(): [number, number][] {
  const N = 12;
  const t: [number, number][] = [];
  for (let x = 0; x <= N; x++) t.push([x, 0]);
  for (let y = 1; y <= N; y++) t.push([N, y]);
  for (let x = N - 1; x >= 0; x--) t.push([x, N]);
  for (let y = N - 1; y >= 1; y--) t.push([0, y]);
  return t;
}
const TRACK = buildTrack();
const TRACK_LEN = TRACK.length;
const START_OFFSETS = [6, 18, 30, 42];
const HOME_POS = [ [1,1], [11,1], [11,11], [1,11] ];

export default function FlightChess({ roomId, initialRoom }: { roomId: string, initialRoom: any }) {
  const [room, setRoom] = useState(initialRoom);
  const [myUid, setMyUid] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  
  const [rolling, setRolling] = useState(false);
  const [diceValue, setDiceValue] = useState<number | null>(null);
  
  const state = room.state || { phase: 'waiting', players: [], turnIndex: 0, lastDice: null, logs: [] };
  const players = state.players || [];
  const myPlayer = players.find((p: any) => p.uid === myUid);

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

  const joinRoom = async (skin: any) => {
    if (!myUid) return toastError('请先登录');
    if (myPlayer) return toastError('你已经在房间里了');
    
    const newPlayer = {
      uid: myUid,
      name: username,
      skinId: skin.id,
      color: skin.color,
      glow: skin.glow,
      icon: skin.icon,
      pos: 0
    };

    const newPlayers = [...players, newPlayer];
    const newState = { ...state, players: newPlayers, logs: [...(state.logs||[]), `${username} 加入了游戏（${skin.name}）`] };

    const { error } = await supabase.from('game_rooms').update({ state: newState }).eq('id', roomId);
    if (error) toastError(error.message);
  };

  const handleRoll = async () => {
    if (rolling) return;
    if (state.players[state.turnIndex]?.uid !== myUid) return toastError('还没轮到你');
    
    setRolling(true);
    setDiceValue(null);
    
    await new Promise(r => setTimeout(r, 600));

    try {
      const { data: dice, error: err1 } = await supabase.rpc('fc_roll_dice', { p_room_id: roomId });
      if (err1) throw err1;
      
      setDiceValue(dice);
      setRolling(false);

      await new Promise(r => setTimeout(r, 800)); 
      const { error: err2 } = await supabase.rpc('fc_move_piece', { p_room_id: roomId });
      if (err2) throw err2;
      
      setDiceValue(null);
    } catch (e: any) {
      toastError(e.message);
      setRolling(false);
    }
  };

  const startGame = async () => {
    if (!myPlayer) return;
    if (initialRoom.host_id !== myUid) return toastError('只有房主能开始');
    if (players.length < 2) return toastError('至少需要 2 名玩家');

    const newState = { ...state, phase: 'playing', turnIndex: 0, logs: [...(state.logs||[]), '游戏开始！'] };
    await supabase.from('game_rooms').update({ status: 'playing', state: newState }).eq('id', roomId);
  };

  const renderBoard = () => {
    const size = 13;
    const grid = [];
    const trackSet = new Set(TRACK.map(([x,y]) => `${x}-${y}`));
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const isTrack = trackSet.has(`${x}-${y}`);
        
        if (isTrack) {
          grid.push(
            <div key={`t-${x}-${y}`} style={{
              gridColumn: x + 1, gridRow: y + 1,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 4,
            }} />
          );
        } else if (x > 1 && x < 11 && y > 1 && y < 11) {
          const homeOwner = HOME_POS.findIndex(([hx, hy]) => Math.abs(x - hx) <= 1 && Math.abs(y - hy) <= 1);
          if (homeOwner !== -1) {
            const skin = SKINS[homeOwner];
            grid.push(
              <div key={`h-${x}-${y}`} style={{
                gridColumn: x + 1, gridRow: y + 1,
                background: `${skin.color}20`,
                border: '1px dashed var(--border)',
                borderRadius: 4,
              }} />
            );
          } else {
             grid.push(<div key={`bg-${x}-${y}`} style={{ gridColumn: x + 1, gridRow: y + 1 }} />);
          }
        } else {
          grid.push(<div key={`bg-${x}-${y}`} style={{ gridColumn: x + 1, gridRow: y + 1 }} />);
        }
      }
    }

    const pieceEls = players.map((p: any, pIdx: number) => {
      let px, py;
      if (p.pos === 0) {
        const [hx, hy] = HOME_POS[pIdx] || [6,6];
        px = hx; py = hy;
      } else {
        const idx = (START_OFFSETS[pIdx] + p.pos - 1) % TRACK_LEN;
        [px, py] = TRACK[idx];
      }
      
      return (
        <motion.div
          key={p.uid}
          layout
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          style={{
            gridColumn: px + 1, gridRow: py + 1,
            width: '80%', height: '80%',
            background: p.color,
            borderRadius: '50%',
            boxShadow: `0 0 16px ${p.glow}`,
            zIndex: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 14, fontWeight: 800,
          }}
        >
          {p.icon}
        </motion.div>
      );
    });

    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${size}, 1fr)`,
        gridTemplateRows: `repeat(${size}, 1fr)`,
        width: '100%', maxWidth: 600, aspectRatio: 1,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: 12, margin: '0 auto',
        position: 'relative',
        boxShadow: '0 12px 32px rgba(0,0,0,0.06)'
      }}>
        {grid}
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
          <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>ID: {roomId.slice(0, 8)}</span>
        </header>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {renderBoard()}
        </div>

        <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32 }}>
          <AnimatePresence mode="wait">
            {state.phase === 'waiting' && players.length < 2 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ color: 'var(--muted)' }}>
                等待其他玩家加入…
              </motion.div>
            )}
            
            {state.phase === 'waiting' && players.length >= 2 && myUid === initialRoom.host_id && (
              <motion.button className="btn primary" onClick={startGame} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                开始游戏
              </motion.button>
            )}

            {state.phase === 'playing' && (
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
                  {rolling ? '?' : (diceValue || state.lastDice || '-')}
                </motion.div>

                <button 
                  className="btn primary" 
                  onClick={handleRoll}
                  disabled={state.players[state.turnIndex]?.uid !== myUid || rolling}
                  style={{ minWidth: 120, height: 48, fontSize: 16, opacity: state.players[state.turnIndex]?.uid !== myUid ? 0.5 : 1 }}
                >
                  {state.players[state.turnIndex]?.uid === myUid ? '掷骰子' : '等对方掷骰'}
                </button>
              </div>
            )}

            {state.phase === 'finished' && (
              <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ fontSize: 24, fontWeight: 800, color: 'var(--primary)' }}>
                🎉 {state.players[state.winner]?.name} 获得了胜利！
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <aside style={{ width: 320, borderLeft: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 20, borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 1 }}>玩家列表</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {players.map((p: any, i: number) => (
              <div key={p.uid} style={{ 
                display: 'flex', alignItems: 'center', gap: 12, padding: 12, 
                background: state.turnIndex === i && state.phase === 'playing' ? 'var(--bg-elevated)' : 'transparent',
                borderRadius: 'var(--radius-sm)',
                border: state.turnIndex === i && state.phase === 'playing' ? '1px solid var(--border)' : '1px solid transparent'
              }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: p.color, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, boxShadow: `0 0 8px ${p.glow}` }}>
                  {p.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.uid === initialRoom.host_id ? '房主' : '玩家'} · {p.pos === 48 ? '已到达' : `第 ${p.pos} 格`}</div>
                </div>
                {state.turnIndex === i && state.phase === 'playing' && (
                  <motion.div layoutId="turn-indicator" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
                )}
              </div>
            ))}
          </div>
        </div>

        {!myPlayer && (
          <div style={{ padding: 20, borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 12px' }}>选择你的主题</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {SKINS.map(s => (
                <button key={s.id} onClick={() => joinRoom(s)} className="btn sm" 
                  style={{ borderColor: s.color, color: s.color, justifyContent: 'center' }}>
                  加入 · {s.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ flex: 1, padding: 20, overflowY: 'auto' }}>
          <h3 style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 12px', textTransform: 'uppercase' }}>战况日志</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(state.logs || []).slice().reverse().map((log: string, i: number) => (
              <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} key={i} style={{ fontSize: 12, color: 'var(--secondary)', padding: '6px 0', borderBottom: '1px dashed var(--border)' }}>
                {log}
              </motion.div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
