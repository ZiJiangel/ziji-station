import { useEffect, useState, useCallback, useRef } from 'react';
import type { Block, BlockType, PageData } from '../lib/blocks';
import { createDefaultBlock, BLOCK_LABELS, getTemplates } from '../lib/blocks';
import { getMyPage, saveDraft, publishPage } from '../lib/api';
import { renderMarkdown } from '../lib/sanitize';

const BLOCK_TYPES: BlockType[] = ['profile', 'markdown', 'links', 'articles', 'moments', 'gallery'];

function uid() { return 'b-' + Math.random().toString(36).slice(2, 9); }

export default function EditorApp() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [publishing, setPublishing] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  
  const saveTimer = useRef<number | null>(null);
  const blocksRef = useRef<Block[]>([]);

  useEffect(() => {
    const user = localStorage.getItem('ziji_user');
    const uidStr = localStorage.getItem('ziji_uid');
    if (!user || !uidStr) { window.location.href = '/login'; return; }
    setUserId(uidStr); setUsername(user);
    
    getMyPage(uidStr).then(data => {
      let init = data?.blocks || [];
      if (init.length === 0) {
        init = getTemplates().blogger.data.blocks;
        setBlocks(init);
        blocksRef.current = init;
        saveDraft(uidStr, { blocks: init });
      } else {
        setBlocks(init);
        blocksRef.current = init;
      }
    });
  }, []);

  const scheduleSave = useCallback((next: Block[]) => {
    blocksRef.current = next;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      if (!userId) return;
      setSaveStatus('saving');
      try {
        await saveDraft(userId, { blocks: blocksRef.current });
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 1500);
      } catch { setSaveStatus('error'); }
    }, 1000);
  }, [userId]);

  const updateBlocks = (updater: (prev: Block[]) => Block[]) => {
    setBlocks(prev => {
      const next = updater(prev);
      scheduleSave(next);
      return next;
    });
  };

  const addBlock = (type: BlockType) => {
    const b = createDefaultBlock(type, uid());
    updateBlocks(prev => [...prev, b]);
    setSelectedId(b.id);
  };

  const removeBlock = (id: string) => {
    updateBlocks(prev => prev.filter(b => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const moveBlock = (id: string, dir: -1 | 1) => {
    updateBlocks(prev => {
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
    updateBlocks(prev => prev.map(b => b.id === id ? updater(b) : b));
  };

  const handlePublish = async () => {
    if (!userId) return;
    setPublishing(true);
    try {
      await saveDraft(userId, { blocks: blocksRef.current });
      await publishPage(userId, { blocks: blocksRef.current });
      alert('发布成功！');
    } catch (e: any) {
      alert('发布失败: ' + e.message);
    } finally { setPublishing(false); }
  };

  const applyTemplate = (tplName: string) => {
    const tpl = getTemplates()[tplName];
    if (tpl && confirm('应用模板将覆盖当前内容，确定吗？')) {
      updateBlocks(() => tpl.data.blocks);
      setShowTemplates(false);
    }
  };

  const selected = blocks.find(b => b.id === selectedId);

  return (
    <div style={root}>
      <header style={topbar}>
        <div style={brand}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: 'linear-gradient(135deg, var(--accent), #818cf8)', display: 'grid', placeItems: 'center', fontSize: 14, color: '#000', fontWeight: 'bold' }}>z</div>
          编辑器 · {username}
        </div>
        <div style={topRight}>
          <button onClick={() => setShowTemplates(true)} style={btnGhost}>使用模板</button>
          <span style={saveStatusStyle(saveStatus)}>
            {saveStatus === 'saving' ? '保存中…' : saveStatus === 'saved' ? '已保存' : saveStatus === 'error' ? '保存失败' : ''}
          </span>
          <a href={username ? '/' + username : '/'} target="_blank" style={btnGhost}>预览</a>
          <button onClick={handlePublish} disabled={publishing} style={btnPri}>
            {publishing ? '发布中…' : '发布'}
          </button>
        </div>
      </header>

      <div style={layout}>
        <aside style={sidebar}>
          <div style={sectionTitle}>内容区块</div>
          {BLOCK_TYPES.map(t => (
            <button key={t} onClick={() => addBlock(t)} style={typeBtn}>
              <span style={{ opacity: 0.5 }}>+</span> {BLOCK_LABELS[t]}
            </button>
          ))}
        </aside>

        <main style={canvas}>
          <div style={previewWrap}>
            {blocks.map(b => (
              <div key={b.id} onClick={() => setSelectedId(b.id)} style={blockCard(b.id === selectedId)}>
                <div style={blockHeader}>
                  <span style={typeLabel}>{BLOCK_LABELS[b.type]}</span>
                  <div style={blockActions}>
                    <button onClick={e => { e.stopPropagation(); moveBlock(b.id, -1); }} style={iconBtn}>↑</button>
                    <button onClick={e => { e.stopPropagation(); moveBlock(b.id, 1); }} style={iconBtn}>↓</button>
                    <button onClick={e => { e.stopPropagation(); updateBlock(b.id, x => ({ ...x, visible: !x.visible } as Block)); }} style={iconBtn}>
                      {b.visible ? '👁' : '🚫'}
                    </button>
                    <button onClick={e => { e.stopPropagation(); removeBlock(b.id); }} style={{ ...iconBtn, color: '#ef4444' }}>✕</button>
                  </div>
                </div>
                <div style={{ opacity: b.visible ? 1 : 0.3, pointerEvents: 'none' }}>
                  <BlockPreview block={b} />
                </div>
              </div>
            ))}
          </div>
        </main>

        <aside style={inspector}>
          {selected ? <BlockInspector block={selected} onChange={u => updateBlock(selected.id, u)} /> : <div style={emptyState}>← 选择区块以编辑</div>}
        </aside>
      </div>

      {showTemplates && (
        <div style={modalOverlay}>
          <div style={modalBox}>
            <h2 style={{ margin: '0 0 24px', fontSize: '20px', color: 'var(--text-primary)' }}>选择起步模板</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
              {Object.entries(getTemplates()).map(([key, t]) => (
                <div key={key} onClick={() => applyTemplate(key)} style={tplCard}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>{t.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{t.desc}</div>
                </div>
              ))}
            </div>
            <button onClick={() => setShowTemplates(false)} style={{ ...btnGhost, marginTop: '24px', width: '100%' }}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
}

function BlockPreview({ block }: { block: Block }) {
  switch (block.type) {
    case 'profile': return <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}><div style={{ width: 60, height: 60, borderRadius: '50%', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }} /><div><div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '16px' }}>{block.props.name || '名字'}</div><div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: 4 }}>{block.props.bio}</div></div></div>;
    case 'markdown': return <div style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(block.props.content || '') }} />;
    case 'links': return <div style={{ display: 'flex', gap: '8px' }}>{block.props.links.map((l, i) => <span key={i} style={{ padding: '4px 12px', border: '1px solid var(--border)', borderRadius: '99px', fontSize: '12px', color: 'var(--text-secondary)' }}>{l.label}</span>)}</div>;
    default: return <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>[{BLOCK_LABELS[block.type]} 数据区块]</div>;
  }
}

function BlockInspector({ block, onChange }: { block: Block; onChange: (u: (b: Block) => Block) => void }) {
  const setProps = (patch: any) => onChange(b => ({ ...b, props: { ...(b as any).props, ...patch } } as Block));
  
  if (block.type === 'profile') return (
    <div style={inspStack}>
      <Field label="名字"><input value={block.props.name || ''} onChange={e => setProps({ name: e.target.value })} style={input} /></Field>
      <Field label="状态"><input value={block.props.status || ''} onChange={e => setProps({ status: e.target.value })} style={input} placeholder="在写代码..." /></Field>
      <Field label="简介"><textarea value={block.props.bio || ''} onChange={e => setProps({ bio: e.target.value })} rows={3} style={textarea} /></Field>
      <Field label="头像 URL"><input value={block.props.avatar || ''} onChange={e => setProps({ avatar: e.target.value })} style={input} placeholder="https://..." /></Field>
    </div>
  );
  if (block.type === 'markdown') return (
    <div style={inspStack}>
      <Field label="Markdown 内容"><textarea value={block.props.content || ''} onChange={e => setProps({ content: e.target.value })} rows={12} style={textarea} /></Field>
    </div>
  );
  return <div style={emptyState}>此区块暂无需配置项</div>;
}

function Field({ label, children }: any) {
  return <label style={{ display: 'block', marginBottom: '16px' }}><div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>{label}</div>{children}</label>;
}

const root: React.CSSProperties = { display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)' };
const topbar: React.CSSProperties = { height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' };
const brand: React.CSSProperties = { fontWeight: 600, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '10px' };
const topRight: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '16px' };
const layout: React.CSSProperties = { display: 'flex', flex: 1, overflow: 'hidden' };
const sidebar: React.CSSProperties = { width: '220px', borderRight: '1px solid var(--border)', padding: '24px 16px', overflowY: 'auto', background: 'var(--bg-surface)' };
const sectionTitle: React.CSSProperties = { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 };
const typeBtn: React.CSSProperties = { width: '100%', padding: '10px 12px', marginBottom: '8px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s', fontSize: '13px', fontWeight: 500 };
const canvas: React.CSSProperties = { flex: 1, padding: '40px', overflowY: 'auto', display: 'flex', justifyContent: 'center', backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)', backgroundSize: '24px 24px', backgroundColor: 'var(--bg-base)' };
const previewWrap: React.CSSProperties = { width: '100%', maxWidth: '640px' };
const blockCard = (sel: boolean): React.CSSProperties => ({ background: 'var(--bg-surface)', border: sel ? '1px solid var(--accent)' : '1px solid var(--border)', borderRadius: '12px', padding: '24px', marginBottom: '16px', cursor: 'pointer', transition: 'border-color 0.2s', boxShadow: sel ? '0 0 0 1px var(--accent)' : 'none' });
const blockHeader: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', marginBottom: '16px' };
const typeLabel: React.CSSProperties = { fontSize: '12px', color: 'var(--accent)', fontWeight: 600 };
const blockActions: React.CSSProperties = { display: 'flex', gap: '8px' };
const iconBtn: React.CSSProperties = { background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px', transition: 'color 0.2s' };
const inspector: React.CSSProperties = { width: '300px', borderLeft: '1px solid var(--border)', padding: '24px', overflowY: 'auto', background: 'var(--bg-surface)' };
const input: React.CSSProperties = { width: '100%', padding: '10px 12px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-primary)', outline: 'none', fontSize: '13px', transition: 'border 0.2s' };
const textarea: React.CSSProperties = { ...input, resize: 'vertical', lineHeight: 1.6 };
const inspStack: React.CSSProperties = { display: 'flex', flexDirection: 'column' };
const btnGhost: React.CSSProperties = { padding: '8px 16px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '99px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px', fontWeight: 500, transition: 'all 0.2s' };
const btnPri: React.CSSProperties = { padding: '8px 20px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '99px', fontWeight: 600, fontSize: '13px', cursor: 'pointer', boxShadow: '0 0 16px var(--accent-glow)' };
const emptyState: React.CSSProperties = { color: 'var(--text-muted)', textAlign: 'center', marginTop: '40px', fontSize: '13px' };
const modalOverlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modalBox: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border)', padding: '32px', borderRadius: '16px', maxWidth: '800px', width: '90%', boxShadow: 'var(--shadow-lg)' };
const tplCard: React.CSSProperties = { padding: '24px', border: '1px solid var(--border)', borderRadius: '12px', cursor: 'pointer', textAlign: 'center', background: 'var(--bg-base)', transition: 'all 0.2s' };
function saveStatusStyle(s: string): React.CSSProperties { return { fontSize: '12px', color: s === 'error' ? '#ef4444' : s === 'saved' ? '#10b981' : 'var(--text-muted)', fontWeight: 500 }; }
