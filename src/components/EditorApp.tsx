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
    const uid = localStorage.getItem('ziji_uid');
    if (!user || !uid) { window.location.href = '/login'; return; }
    setUserId(uid); setUsername(user);
    
    getMyPage(uid).then(data => {
      let init = data?.blocks || [];
      // 如果还没内容，自动套用默认模板，保证一进来就有厚度
      if (init.length === 0) {
        init = getTemplates().blogger.data.blocks;
        scheduleSave(init); // 顺手保存一下
      }
      setBlocks(init);
      blocksRef.current = init;
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
      alert('发布成功！访问 /' + username + ' 查看');
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
        <div style={brand}>编辑器 · {username || '...'}</div>
        <div style={topRight}>
          <button onClick={() => setShowTemplates(true)} style={btnGhost}>使用模板</button>
          <span style={saveStatusStyle(saveStatus)}>
            {saveStatus === 'saving' && '保存中…'}
            {saveStatus === 'saved' && '已保存'}
            {saveStatus === 'error' && '保存失败'}
          </span>
          <a href={username ? '/' + username : '/'} target="_blank" style={btnGhost}>预览</a>
          <button onClick={handlePublish} disabled={publishing} style={btnPri}>
            {publishing ? '发布中…' : '发布'}
          </button>
        </div>
      </header>

      <div style={layout}>
        <aside style={sidebar}>
          <div style={sectionTitle}>添加内容区块</div>
          {BLOCK_TYPES.map(t => (
            <button key={t} onClick={() => addBlock(t)} style={typeBtn}>+ {BLOCK_LABELS[t]}</button>
          ))}
        </aside>

        <main style={canvas}>
          <div style={previewWrap}>
            {blocks.length === 0 && <div style={emptyState}>点击左侧添加第一个区块，或选择模板</div>}
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
          {selected ? <BlockInspector block={selected} onChange={u => updateBlock(selected.id, u)} /> : <div style={emptyState}>选择区块以编辑</div>}
        </aside>
      </div>

      {showTemplates && (
        <div style={modalOverlay}>
          <div style={modalBox}>
            <h2 style={{ margin: '0 0 24px', fontSize: '20px', color: '#fff' }}>选择起步模板</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
              {Object.entries(getTemplates()).map(([key, t]) => (
                <div key={key} onClick={() => applyTemplate(key)} style={tplCard}>
                  <div style={{ fontWeight: 600, color: '#fff', marginBottom: '8px' }}>{t.name}</div>
                  <div style={{ fontSize: '12px', color: '#888' }}>{t.desc}</div>
                </div>
              ))}
            </div>
            <button onClick={() => setShowTemplates(false)} style={{ ...btnGhost, marginTop: '24px' }}>关闭</button>
          </div>
        </div>
      )}
    </div>
  );
}

function BlockPreview({ block }: { block: Block }) {
  switch (block.type) {
    case 'profile': return <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}><div style={{ width: 60, height: 60, borderRadius: '50%', background: '#333' }} /><div><div style={{ color: '#fff', fontWeight: 600 }}>{block.props.name || '名字'}</div><div style={{ color: '#888', fontSize: '13px' }}>{block.props.bio}</div></div></div>;
    case 'markdown': return <div style={{ color: '#ddd', fontSize: '14px' }} dangerouslySetInnerHTML={{ __html: renderMarkdown(block.props.content || '') }} />;
    case 'links': return <div style={{ display: 'flex', gap: '8px' }}>{block.props.links.map((l, i) => <span key={i} style={{ padding: '4px 12px', border: '1px solid #444', borderRadius: '99px', fontSize: '12px' }}>{l.label}</span>)}</div>;
    default: return <div style={{ color: '#666', fontSize: '13px' }}>[{BLOCK_LABELS[block.type]} 内容渲染区]</div>;
  }
}

function BlockInspector({ block, onChange }: { block: Block; onChange: (u: (b: Block) => Block) => void }) {
  const setProps = (patch: any) => onChange(b => ({ ...b, props: { ...(b as any).props, ...patch } } as Block));
  
  if (block.type === 'profile') return (
    <div style={inspStack}>
      <Field label="名字"><input value={block.props.name || ''} onChange={e => setProps({ name: e.target.value })} style={input} /></Field>
      <Field label="状态"><input value={block.props.status || ''} onChange={e => setProps({ status: e.target.value })} style={input} /></Field>
      <Field label="简介"><textarea value={block.props.bio || ''} onChange={e => setProps({ bio: e.target.value })} rows={3} style={textarea} /></Field>
      <Field label="头像 URL"><input value={block.props.avatar || ''} onChange={e => setProps({ avatar: e.target.value })} style={input} /></Field>
    </div>
  );
  if (block.type === 'markdown') return (
    <div style={inspStack}>
      <Field label="Markdown 内容"><textarea value={block.props.content || ''} onChange={e => setProps({ content: e.target.value })} rows={12} style={textarea} /></Field>
    </div>
  );
  return <div style={emptyState}>此区块无需配置或暂未实现配置</div>;
}

function Field({ label, children }: any) {
  return <label style={{ display: 'block', marginBottom: '16px' }}><div style={{ fontSize: '12px', color: '#888', marginBottom: '6px' }}>{label}</div>{children}</label>;
}

const root: React.CSSProperties = { display: 'flex', flexDirection: 'column', height: '100vh', background: '#09090b', color: '#fafafa' };
const topbar: React.CSSProperties = { height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', borderBottom: '1px solid #27272a', background: '#18181b' };
const brand: React.CSSProperties = { fontWeight: 600, color: '#38bdf8' };
const topRight: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '16px' };
const layout: React.CSSProperties = { display: 'flex', flex: 1, overflow: 'hidden' };
const sidebar: React.CSSProperties = { width: '220px', borderRight: '1px solid #27272a', padding: '20px', overflowY: 'auto' };
const sectionTitle: React.CSSProperties = { fontSize: '12px', color: '#888', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' };
const typeBtn: React.CSSProperties = { width: '100%', padding: '10px', marginBottom: '8px', background: '#27272a', border: '1px solid transparent', borderRadius: '8px', color: '#e4e4e7', textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s' };
const canvas: React.CSSProperties = { 
    flex: 1, 
    padding: '40px', 
    overflowY: 'auto', 
    display: 'flex', 
    justifyContent: 'center',
    backgroundImage: 'radial-gradient(var(--line-soft) 1px, transparent 1px)',
    backgroundSize: '20px 20px',
    backgroundColor: '#0a0a0a'
  };
const previewWrap: React.CSSProperties = { width: '100%', maxWidth: '640px' };
const blockCard = (sel: boolean): React.CSSProperties => ({ background: '#18181b', border: (sel ? '1px solid #38bdf8' : '1px solid #27272a'), borderRadius: '12px', padding: '20px', marginBottom: '16px', cursor: 'pointer', transition: 'border 0.2s' });
const blockHeader: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', marginBottom: '16px' };
const typeLabel: React.CSSProperties = { fontSize: '12px', color: '#38bdf8', fontWeight: 600 };
const blockActions: React.CSSProperties = { display: 'flex', gap: '6px' };
const iconBtn: React.CSSProperties = { background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: '14px' };
const inspector: React.CSSProperties = { width: '300px', borderLeft: '1px solid #27272a', padding: '20px', overflowY: 'auto', background: '#0c0c0e' };
const input: React.CSSProperties = { width: '100%', padding: '10px', background: '#18181b', border: '1px solid #27272a', borderRadius: '6px', color: '#fff', outline: 'none' };
const textarea: React.CSSProperties = { ...input, resize: 'vertical' };
const inspStack: React.CSSProperties = { display: 'flex', flexDirection: 'column' };
const btnGhost: React.CSSProperties = { padding: '8px 16px', background: 'transparent', border: '1px solid #27272a', borderRadius: '6px', color: '#d4d4d8', cursor: 'pointer' };
const btnPri: React.CSSProperties = { padding: '8px 20px', background: '#38bdf8', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' };
const emptyState: React.CSSProperties = { color: '#555', textAlign: 'center', marginTop: '40px', fontSize: '14px' };
const modalOverlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modalBox: React.CSSProperties = { background: '#18181b', border: '1px solid #27272a', padding: '32px', borderRadius: '16px', maxWidth: '800px', width: '90%' };
const tplCard: React.CSSProperties = { padding: '20px', border: '1px solid #27272a', borderRadius: '12px', cursor: 'pointer', textAlign: 'center', background: '#0c0c0e' };
function saveStatusStyle(s: string): React.CSSProperties { return { fontSize: '12px', color: s === 'error' ? '#ef4444' : s === 'saved' ? '#22c55e' : '#888' }; }
