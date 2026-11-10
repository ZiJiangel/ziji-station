import { useEffect, useState, useCallback, useRef } from 'react';
import type { Block, BlockType, PageData } from '../lib/blocks';
import { createDefaultBlock, BLOCK_LABELS, getTemplates } from '../lib/blocks';

type Area = 'main' | 'sidebar';
import { getMyPage, saveDraft, publishPage } from '../lib/api';
import { renderMarkdown } from '../lib/sanitize';
import { toastSuccess, toastError } from '../lib/toast';

const BLOCK_TYPES: BlockType[] = ['profile', 'markdown', 'links', 'articles', 'moments', 'gallery', 'music'];

function uid() { return 'b-' + Math.random().toString(36).slice(2, 9); }

export default function EditorApp() {
  const [mainBlocks, setMainBlocks] = useState<Block[]>([]);
  const [sidebarBlocks, setSidebarBlocks] = useState<Block[]>([]);
  const [sidebarWidth, setSidebarWidth] = useState<number | 'none'>('none');
  const [activeArea, setActiveArea] = useState<Area>('main');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [publishing, setPublishing] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSidebarSetting, setShowSidebarSetting] = useState(false);

  const saveTimer = useRef<number | null>(null);
  const dataRef = useRef<PageData>({ blocks: [], sidebarBlocks: [], sidebarWidth: 'none' });

  const getBlocks = (area: Area) => area === 'main' ? mainBlocks : sidebarBlocks;
  const setBlocksOf = (area: Area, next: Block[]) => {
    if (area === 'main') setMainBlocks(next);
    else setSidebarBlocks(next);
  };

  useEffect(() => {
    const user = localStorage.getItem('ziji_user');
    const uidStr = localStorage.getItem('ziji_uid');
    if (!user || !uidStr) { window.location.href = '/login'; return; }
    setUserId(uidStr); setUsername(user);

    getMyPage(uidStr).then(data => {
      const initMain = data?.blocks || [];
      const initSide = data?.sidebarBlocks || [];
      const initWidth = data?.sidebarWidth ?? 'none';

      if (initMain.length === 0) {
        const tpl = getTemplates().blogger.data.blocks;
        setMainBlocks(tpl);
        dataRef.current = { blocks: tpl, sidebarBlocks: [], sidebarWidth: 'none' };
        saveDraft(uidStr, dataRef.current);
      } else {
        setMainBlocks(initMain);
        setSidebarBlocks(initSide);
        setSidebarWidth(initWidth);
        dataRef.current = { blocks: initMain, sidebarBlocks: initSide, sidebarWidth: initWidth };
      }
    });
  }, []);

  const scheduleSave = useCallback((next: PageData) => {
    dataRef.current = next;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      if (!userId) return;
      setSaveStatus('saving');
      try {
        await saveDraft(userId, dataRef.current);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 1500);
      } catch { setSaveStatus('error'); }
    }, 1000);
  }, [userId]);

  const commit = (main: Block[], side: Block[], width: number | 'none') => {
    setMainBlocks(main);
    setSidebarBlocks(side);
    setSidebarWidth(width);
    scheduleSave({ blocks: main, sidebarBlocks: side, sidebarWidth: width });
  };

  const updateAreaBlocks = (area: Area, updater: (prev: Block[]) => Block[]) => {
    const nextMain = area === 'main' ? updater(mainBlocks) : mainBlocks;
    const nextSide = area === 'sidebar' ? updater(sidebarBlocks) : sidebarBlocks;
    commit(nextMain, nextSide, sidebarWidth);
  };

  const addBlock = (type: BlockType) => {
    const b = createDefaultBlock(type, uid());
    // 如果当前没开侧栏，且正在往侧栏加，自动开侧栏
    if (activeArea === 'sidebar' && sidebarWidth === 'none') {
      commit([...mainBlocks, b], sidebarBlocks, 320);
    } else {
      updateAreaBlocks(activeArea, prev => [...prev, b]);
    }
    setSelectedId(b.id);
  };

  const removeBlock = (id: string) => {
    updateAreaBlocks(activeArea, prev => prev.filter(b => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const moveBlock = (id: string, dir: -1 | 1) => {
    updateAreaBlocks(activeArea, prev => {
      const idx = prev.findIndex(b => b.id === id);
      if (idx < 0) return prev;
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const updateBlock = (id: string, updater: (b: Block) => Block) => {
    updateAreaBlocks(activeArea, prev => prev.map(b => b.id === id ? updater(b) : b));
  };

  const handlePublish = async () => {
    if (!userId) return;
    setPublishing(true);
    try {
      await saveDraft(userId, dataRef.current);
      await publishPage(userId, dataRef.current);
      toastSuccess('已发布到主页');
    } catch (e: any) {
      toastError('发布失败: ' + e.message);
    } finally { setPublishing(false); }
  };

  const currentBlocks = getBlocks(activeArea);
  const selected = currentBlocks.find(b => b.id === selectedId);

  return (
    <div style={s.root}>
      <header style={s.topbar}>
        <div style={s.brand}>
          <a href="/" style={{ color: 'var(--text-muted)', fontSize: '13px', fontFamily: 'var(--font-mono)', textDecoration: 'none' }}>← 返回大厅</a>
          <span style={{ color: 'var(--border)', fontSize: '13px' }}>|</span>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: '20px' }}>工作室</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '13px', fontFamily: 'var(--font-mono)' }}>/{username}</span>
        </div>
        <div style={s.topRight}>
          <span style={s.saveStatus(saveStatus)}>
            {saveStatus === 'saving' ? '保存中…' : saveStatus === 'saved' ? '已保存' : saveStatus === 'error' ? '保存失败' : ''}
          </span>
          <button onClick={() => setShowTemplates(true)} style={s.btnGhost}>模板</button>
          <a href={username ? '/' + username : '/'} target="_blank" style={s.btnGhost}>预览</a>
          <button onClick={handlePublish} disabled={publishing} style={s.btnPrimary}>
            {publishing ? '发布中…' : '发布'}
          </button>
        </div>
      </header>

      <div style={s.layout}>
        <aside style={s.sidebar}>
          <div style={s.areaTabs}>
            <button onClick={() => { setActiveArea('main'); setSelectedId(null); }} style={s.areaTab(activeArea === 'main')}>主区域</button>
            <button onClick={() => { setActiveArea('sidebar'); setSelectedId(null); }} style={s.areaTab(activeArea === 'sidebar')}>侧边栏</button>
          </div>

          {activeArea === 'sidebar' && (
            <div style={{ marginBottom: '24px' }}>
              <div style={s.sectionTitle}>侧栏宽度</div>
              <div style={s.widthRow}>
                {([
                  ['无', 'none'],
                  ['260', 260],
                  ['320', 320],
                  ['380', 380],
                ] as const).map(([label, val]) => (
                  <button key={label} onClick={() => commit(mainBlocks, sidebarBlocks, val)} style={s.widthBtn(sidebarWidth === val)}>{label}</button>
                ))}
              </div>
            </div>
          )}

          <div style={s.sectionTitle}>添加区块</div>
          <div style={s.blockList}>
            {BLOCK_TYPES.map(t => (
              <button key={t} onClick={() => addBlock(t)} style={s.typeBtn}>
                <span style={{ opacity: 0.4, marginRight: '8px' }}>+</span> {BLOCK_LABELS[t]}
              </button>
            ))}
          </div>
        </aside>

        <main style={s.canvas}>
          <div style={s.previewWrap}>
            {currentBlocks.map(b => (
              <div 
                key={b.id} 
                onClick={() => setSelectedId(b.id)} 
                style={s.blockCard(selectedId === b.id)}
              >
                <div style={s.blockHeader}>
                  <span style={s.typeLabel}>{BLOCK_LABELS[b.type]}</span>
                  <div style={s.blockActions}>
                    <button onClick={e => { e.stopPropagation(); moveBlock(b.id, -1); }} style={s.iconBtn}>↑</button>
                    <button onClick={e => { e.stopPropagation(); moveBlock(b.id, 1); }} style={s.iconBtn}>↓</button>
                    <button onClick={e => { e.stopPropagation(); updateBlock(b.id, x => ({ ...x, visible: !x.visible } as Block)); }} style={s.iconBtn}>
                      {b.visible ? '👁' : '🚫'}
                    </button>
                    <button onClick={e => { e.stopPropagation(); removeBlock(b.id); }} style={{ ...s.iconBtn, color: 'var(--danger)' }}>✕</button>
                  </div>
                </div>
                <div style={{ opacity: b.visible ? 1 : 0.3, pointerEvents: 'none' }}>
                  <BlockPreview block={b} />
                </div>
              </div>
            ))}
            {currentBlocks.length === 0 && <div style={s.empty}>当前区域还是空的，从左侧添加内容吧。</div>}
          </div>
        </main>

        <aside style={s.inspector}>
          {selected ? (
            <BlockInspector block={selected} onChange={u => updateBlock(selected.id, u)} />
          ) : (
            <div style={s.empty}>选择区块以编辑属性</div>
          )}
        </aside>
      </div>

      {showTemplates && (
        <div style={s.modalOverlay}>
          <div style={s.modalBox}>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '28px', fontWeight: 400, marginBottom: '32px' }}>选择模板</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px' }}>
              {Object.entries(getTemplates()).map(([key, t]) => (
                <div key={key} onClick={() => {
                  if (confirm('覆盖当前内容？')) {
                    commit(t.data.blocks, [], 'none');
                    setSelectedId(null);
                    setShowTemplates(false);
                  }
                }} style={s.tplCard}>
                  <div style={{ fontSize: '16px', fontWeight: 500, marginBottom: '8px' }}>{t.name}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{t.desc}</div>
                </div>
              ))}
            </div>
            <button onClick={() => setShowTemplates(false)} style={{ ...s.btnGhost, marginTop: '32px', width: '100%' }}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
}

function BlockPreview({ block }: { block: Block }) {
  switch (block.type) {
    case 'profile': return <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}><div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }} /><div><div style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)' }}>{block.props.name || '你的名字'}</div><div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>{block.props.bio}</div></div></div>;
    case 'markdown': return <div style={{ color: 'var(--text-secondary)', fontSize: '15px', lineHeight: 1.8 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(block.props.content || '') }} />;
    case 'links': return <div style={{ display: 'flex', gap: '12px' }}>{block.props.links.map((l, i) => <span key={i} style={{ padding: '8px 16px', border: '1px solid var(--border)', borderRadius: '99px', fontSize: '13px', color: 'var(--text-secondary)' }}>{l.label}</span>)}</div>;
    case 'music': return (
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'repeating-radial-gradient(#141414, #141414 1px, #242424 2px, #141414 3px)', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }} />
        <div>
          <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{block.props.title || 'Ambient Music'}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{block.props.artist || 'Unknown'}</div>
        </div>
      </div>
    );
    default: return <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>[{BLOCK_LABELS[block.type]} 自动渲染区域]</div>;
  }
}

function BlockInspector({ block, onChange }: { block: Block; onChange: (u: (b: Block) => Block) => void }) {
  const setProps = (patch: any) => onChange(b => ({ ...b, props: { ...(b as any).props, ...patch } } as Block));
  
  if (block.type === 'profile') return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Field label="名字"><input value={block.props.name || ''} onChange={e => setProps({ name: e.target.value })} style={s.input} /></Field>
      <Field label="状态"><input value={block.props.status || ''} onChange={e => setProps({ status: e.target.value })} style={s.input} /></Field>
      <Field label="简介"><textarea value={block.props.bio || ''} onChange={e => setProps({ bio: e.target.value })} rows={4} style={s.textarea} /></Field>
      <Field label="头像链接"><input value={block.props.avatar || ''} onChange={e => setProps({ avatar: e.target.value })} style={s.input} /></Field>
    </div>
  );
  if (block.type === 'markdown') return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Field label="Markdown 内容"><textarea value={block.props.content || ''} onChange={e => setProps({ content: e.target.value })} rows={16} style={s.textarea} /></Field>
    </div>
  );
  if (block.type === 'music') return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Field label="曲名"><input value={block.props.title || ''} onChange={e => setProps({ title: e.target.value })} style={s.input} /></Field>
      <Field label="作者"><input value={block.props.artist || ''} onChange={e => setProps({ artist: e.target.value })} style={s.input} /></Field>
      <Field label="音频链接（mp3/ogg，留空则只转唱片不放歌）"><input value={block.props.url || ''} onChange={e => setProps({ url: e.target.value })} style={s.input} /></Field>
    </div>
  );
  return <div style={s.empty}>此区块暂无可配置属性</div>;
}

function Field({ label, children }: any) {
  return <label style={{ display: 'block', marginBottom: '24px' }}><div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>{label}</div>{children}</label>;
}

const s = {
  root: { display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', color: 'var(--text-primary)' },
  topbar: { height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', borderBottom: '1px solid var(--border)' },
  brand: { display: 'flex', alignItems: 'center', gap: '12px' },
  topRight: { display: 'flex', alignItems: 'center', gap: '16px' },
  layout: { display: 'flex', flex: 1, overflow: 'hidden' },
  sidebar: { width: '240px', borderRight: '1px solid var(--border)', padding: '24px 20px', overflowY: 'auto' },
  areaTabs: { display: 'flex', gap: '4px', marginBottom: '24px', padding: '4px', background: 'var(--bg-elevated)', borderRadius: '10px' },
  areaTab: (active: boolean) => ({ flex: 1, padding: '7px 0', background: active ? 'var(--bg-surface)' : 'transparent', border: 'none', borderRadius: '7px', color: active ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: '12px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s' }),
  widthRow: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
  widthBtn: (active: boolean) => ({ padding: '6px 12px', background: active ? 'var(--text-primary)' : 'transparent', border: '1px solid var(--border)', borderRadius: '99px', color: active ? 'var(--bg)' : 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer', transition: 'all 0.15s' }),
  sectionTitle: { fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '16px' },
  blockList: { display: 'flex', flexDirection: 'column', gap: '8px' },
  typeBtn: { width: '100%', padding: '12px 16px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '12px', color: 'var(--text-secondary)', textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s', fontSize: '14px' },
  canvas: { flex: 1, padding: '48px', overflowY: 'auto', display: 'flex', justifyContent: 'center', background: 'var(--bg)' },
  previewWrap: { width: '100%', maxWidth: '720px' },
  blockCard: (sel: boolean) => ({ background: 'var(--bg-surface)', border: sel ? '1px solid var(--text-primary)' : '1px solid var(--border)', borderRadius: '16px', padding: '32px', marginBottom: '24px', cursor: 'pointer', transition: 'border-color 0.2s' }),
  blockHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: '24px' },
  typeLabel: { fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' },
  blockActions: { display: 'flex', gap: '12px' },
  iconBtn: { background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px', transition: 'color 0.2s' },
  inspector: { width: '320px', borderLeft: '1px solid var(--border)', padding: '32px 24px', overflowY: 'auto' },
  input: { width: '100%', padding: '12px 0', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text-primary)', outline: 'none', fontSize: '15px', transition: 'border-color 0.2s' },
  textarea: { width: '100%', padding: '12px 0', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text-primary)', outline: 'none', fontSize: '15px', resize: 'vertical', lineHeight: 1.6 },
  btnGhost: { padding: '8px 16px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '99px', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '13px', fontWeight: 500 },
  btnPrimary: { padding: '8px 24px', background: 'var(--text-primary)', color: 'var(--bg)', border: 'none', borderRadius: '99px', fontWeight: 500, fontSize: '13px', cursor: 'pointer' },
  empty: { color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center', marginTop: '40px' },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modalBox: { background: 'var(--bg-surface)', border: '1px solid var(--border)', padding: '48px', borderRadius: '24px', maxWidth: '800px', width: '90%' },
  tplCard: { padding: '32px 24px', border: '1px solid var(--border)', borderRadius: '16px', cursor: 'pointer', textAlign: 'center', background: 'var(--bg)' },
  saveStatus: (s: string) => ({ fontFamily: 'var(--font-mono)', fontSize: '12px', color: s === 'error' ? 'var(--danger)' : 'var(--text-muted)' })
} as const;
