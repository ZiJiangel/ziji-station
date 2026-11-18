/**
 * 接管飞行棋首页「在线联机」按钮。
 * 独立模块，不修改 indexMain.js 的旧联机逻辑。
 */
import { createRoom, listRooms, rememberRoom, OnlineSession, getIdentity } from './onlineLobby.js';

let session = null;

function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else n.setAttribute(k, v);
  });
  children.forEach(c => n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
  return n;
}

function closePanel() {
  document.getElementById('fq-online-panel')?.remove();
}

function openPanel() {
  closePanel();
  const { name } = getIdentity();
  const panel = el('div', { id: 'fq-online-panel', class: 'fq-online-panel' });
  const card = el('div', { class: 'fq-online-card' });
  const title = el('div', { class: 'fq-online-title', text: '在线联机' });
  const close = el('button', { class: 'fq-online-close', type: 'button', text: '×' });
  close.onclick = closePanel;
  title.appendChild(close);
  card.appendChild(title);

  const tip = el('p', { class: 'fq-online-tip', text: `以 ${name} 的身份联机。创建房间后把房间号发给朋友。` });
  card.appendChild(tip);

  const nameRow = el('div', { class: 'fq-online-row' });
  const nameInput = el('input', { class: 'fq-online-input', type: 'text', value: name, placeholder: '你的昵称', maxlength: '16' });
  nameRow.appendChild(nameInput);
  card.appendChild(nameRow);

  const actions = el('div', { class: 'fq-online-actions' });
  const createBtn = el('button', { class: 'fq-online-btn primary', type: 'button', text: '创建房间' });
  const joinBtn = el('button', { class: 'fq-online-btn', type: 'button', text: '加入房间' });
  const codeInput = el('input', { class: 'fq-online-input', type: 'text', placeholder: '房间号', maxlength: '36' });
  actions.appendChild(createBtn);
  actions.appendChild(codeInput);
  actions.appendChild(joinBtn);
  card.appendChild(actions);

  const status = el('div', { class: 'fq-online-status', text: '' });
  card.appendChild(status);

  const rooms = listRooms();
  if (rooms.length) {
    const recent = el('div', { class: 'fq-online-recent' });
    recent.appendChild(el('div', { class: 'fq-online-sub', text: '最近房间' }));
    rooms.slice(0, 5).forEach(r => {
      const b = el('button', { class: 'fq-online-room', type: 'button', text: `${r.name} · ${r.id.slice(0, 8)}` });
      b.onclick = () => enter(r.id, nameInput.value.trim() || name);
      recent.appendChild(b);
    });
    card.appendChild(recent);
  }

  function saveName() {
    const v = nameInput.value.trim();
    if (v) localStorage.setItem('ludo_online_name', v);
    return v || name;
  }

  createBtn.onclick = async () => {
    createBtn.disabled = true;
    status.textContent = '正在创建…';
    try {
      const id = await createRoom(saveName());
      rememberRoom(id, saveName());
      enter(id, saveName());
    } catch (e) {
      status.textContent = '创建失败：' + e.message;
      createBtn.disabled = false;
    }
  };
  joinBtn.onclick = () => {
    const id = codeInput.value.trim();
    if (!id) { status.textContent = '请填房间号'; return; }
    rememberRoom(id, saveName());
    enter(id, saveName());
  };

  panel.appendChild(card);
  document.body.appendChild(panel);
}

function enter(roomId, nickname) {
  closePanel();
  session?.close();
  const wrap = el('div', { id: 'fq-online-game', class: 'fq-online-game' });
  const bar = el('div', { class: 'fq-online-bar' });
  const info = el('div', { text: `房间 ${roomId.slice(0, 8)}` });
  const copy = el('button', { type: 'button', text: '复制房间号' });
  copy.onclick = () => navigator.clipboard?.writeText(roomId);
  const status = el('span', { class: 'fq-online-status', text: '连接中…' });
  const leave = el('button', { type: 'button', text: '离开' });
  leave.onclick = () => { session?.close(); session = null; wrap.remove(); };
  bar.appendChild(info); bar.appendChild(copy); bar.appendChild(status); bar.appendChild(leave);
  wrap.appendChild(bar);

  const board = el('div', { class: 'fq-online-board' });
  wrap.appendChild(board);
  const action = el('div', { class: 'fq-online-action' });
  const roll = el('button', { type: 'button', text: '掷骰子' });
  action.appendChild(roll);
  wrap.appendChild(action);
  document.body.appendChild(wrap);

  const render = (snap) => {
    board.innerHTML = '';
    status.textContent = `第 ${snap.round || 0} 回合 · seq ${snap.seq}`;
    const myColor = session?.room?.players?.find(p => p.nickname === nickname)?.color;
    const myTurn = snap.currentPlayer === myColor;
    roll.disabled = !myTurn || snap.gamePhase !== 'rolling';

    Object.entries(snap.playerChess || {}).forEach(([color, pieces]) => {
      const row = el('div', { class: 'fq-online-row' });
      row.appendChild(el('span', { class: `fq-dot p${color}` }));
      row.appendChild(el('span', { text: `玩家${color}` }));
      pieces.forEach((p, i) => {
        const b = el('button', {
          type: 'button',
          class: `fq-piece${p.finished ? ' done' : ''}${myTurn && snap.gamePhase === 'selecting' && p.position >= 0 && !p.finished ? ' movable' : ''}`,
          text: p.finished ? '✓' : p.position > 0 ? String(p.position) : '·'
        });
        b.disabled = !(myTurn && snap.gamePhase === 'selecting' && p.position >= 0 && !p.finished);
        b.onclick = () => session?.intent({ type: 'move', chessIndex: i });
        row.appendChild(b);
      });
      board.appendChild(row);
    });
  };

  session = new OnlineSession(roomId, {
    onStatus: t => { status.textContent = t; },
    onSnapshot: render,
    onRoom: r => { /* 颜色由服务端分配，无需本地处理 */ },
    onRejected: r => { status.textContent = r; }
  });

  session.load().then(state => {
    if (state.snapshot) render(state.snapshot);
    return session.join();
  }).catch(e => { status.textContent = '进入失败：' + e.message; });

  roll.onclick = () => session?.intent({ type: 'roll' });
}

export function setupOnlineEntry() {
  const btn = document.getElementById('menuOnlineBtn');
  if (!btn) return;
  btn.disabled = false;
  btn.removeAttribute('title');
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openPanel();
  }, true);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupOnlineEntry);
} else {
  setupOnlineEntry();
}
