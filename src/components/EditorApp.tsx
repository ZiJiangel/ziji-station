import { useEffect, useState, useCallback, useRef } from 'react';
import type { Block, BlockType, PageData } from '../lib/blocks';
import { createDefaultBlock, BLOCK_LABELS } from '../lib/blocks';
import { getMyPage, saveDraft, publishPage } from '../lib/api';
import { supabase } from '../lib/supabase';
import { renderMarkdown } from '../lib/sanitize';

const BLOCK_TYPES: BlockType[] = ['profile', 'markdown', 'links', 'articles', 'moments', 'gallery'];

function uid() {
  return 'b-' + Math.random().toString(36).slice(2, 10);
}

export default function EditorApp() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [publishing, setPublishing] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const blocksRef = useRef<Block[]>([]);

  useEffect(() => {
    const init = async () => {
      const user = localStorage.getItem('ziji_user');
      const uid = localStorage.getItem('ziji_uid');
      if (!user || !uid) { window.location.href = '/login'; return; }

      // 校验 Supabase 会话是否仍然存在
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = '/login';
        return;
      }

      setUserId(uid);
      setUsername(user);

      try {
        const data = await getMyPage(uid);
        const initial = data?.blocks?.length ? data.blocks : [createDefaultBlock('profile', Math.random().toString(36).slice(2, 10))];
        setBlocks(initial);
        blocksRef.current = initial;
      } catch (e) {
        console.error('获取草稿失败:', e);
        setSaveStatus('error');
      }
    };
    init();
  }, []);

  // 自动保存（防抖 1.2s）
  const scheduleSave = useCallback((next: Block[]) => {
    blocksRef.current = next;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      if (!userId) return;
      setSaveStatus('saving');
      try {
        await saveDraft(userId, { blocks: blocksRef.current });
        setSaveStatus('saved');
        window.setTimeout(() => setSaveStatus('idle'), 1500);
      } catch (e) {
        console.error('自动保存失败:', e);
        setSaveStatus('error');
      }
    }, 1200);
  }, [userId]);

  const updateBlocks = (updater: (prev: Block[]) => Block[]) => {
    setBlocks((prev) => {
      const next = updater(prev);
      scheduleSave(next);
      return next;
    });
  };

  const addBlock = (type: BlockType) => {
    const b = createDefaultBlock(type, uid());
    updateBlocks((prev) => [...prev, b]);
    setSelectedId(b.id);
  };

  const removeBlock = (id: string) => {
    updateBlocks((prev) => prev.filter((b) => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const moveBlock = (id: string, dir: -1 | 1) => {
    updateBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === id);
      if (idx < 0) return prev;
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const updateBlock = (id: string, updater: (b: Block) => Block) => {
    updateBlocks((prev) => prev.map((b) => (b.id === id ? updater(b) : b)));
  };

  const handlePublish = async () => {
    if (!userId) return;
    setPublishing(true);
    try {
      await saveDraft(userId, { blocks: blocksRef.current });
      await publishPage(userId, { blocks: blocksRef.current });
      alert('发布成功！访问 /' + username + ' 查看');
    } catch (e: any) {
      alert('发布失败：' + e.message);
    } finally {
      setPublishing(false);
    }
  };

  const selected = blocks.find((b) => b.id === selectedId);

  return (
    <div style={root}>
      <header style={topbar}>
        <div style={brand}>编辑器 · {username || '...'}</div>
        <div style={topRight}>
          <span style={saveStatusStyle(saveStatus)}>
            {saveStatus === 'saving' && '保存中…'}
            {saveStatus === 'saved' && '已保存'}
            {saveStatus === 'error' && '保存失败'}
          </span>
          <a href={username ? '/' + username : '/'} target="_blank" rel="noopener" style={linkBtn}>
            预览
          </a>
          <button onClick={handlePublish} disabled={publishing} style={primaryBtn}>
            {publishing ? '发布中…' : '发布'}
          </button>
        </div>
      </header>

      <div style={layout}>
        {/* 左侧：区块类型 */}
        <aside style={sidebar}>
          <div style={asideTitle}>添加区块</div>
          {BLOCK_TYPES.map((t) => (
            <button key={t} onClick={() => addBlock(t)} style={typeBtn}>
              + {BLOCK_LABELS[t]}
            </button>
          ))}
        </aside>

        {/* 中间：区块列表预览 */}
        <main style={canvas}>
          <div style={previewWrap}>
            {blocks.length === 0 && (
              <p style={{ color: '#555', textAlign: 'center', padding: '60px 0' }}>
                从左侧添加第一个区块
              </p>
            )}
            {blocks.map((b) => (
              <div
                key={b.id}
                onClick={() => setSelectedId(b.id)}
                style={blockCard(b.id === selectedId)}
              >
                <div style={blockHeader}>
                  <span style={typeLabel}>{BLOCK_LABELS[b.type]}</span>
                  <div style={blockActions}>
                    <button onClick={(e) => { e.stopPropagation(); moveBlock(b.id, -1); }} style={iconBtn}>↑</button>
                    <button onClick={(e) => { e.stopPropagation(); moveBlock(b.id, 1); }} style={iconBtn}>↓</button>
                    <button onClick={(e) => { e.stopPropagation(); updateBlock(b.id, (x) => ({ ...x, visible: !x.visible } as Block)); }} style={iconBtn}>
                      {b.visible ? '👁' : '🚫'}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); removeBlock(b.id); }} style={{ ...iconBtn, color: '#ff4d4d' }}>✕</button>
                  </div>
                </div>
                <div style={{ opacity: b.visible ? 1 : 0.4 }}>
                  <BlockPreview block={b} />
                </div>
              </div>
            ))}
          </div>
        </main>

        {/* 右侧：属性面板 */}
        <aside style={inspector}>
          {selected ? (
            <BlockInspector block={selected} onChange={(u) => updateBlock(selected.id, u)} />
          ) : (
            <p style={{ color: '#555', fontSize: '13px' }}>选择区块以编辑属性</p>
          )}
        </aside>
      </div>
    </div>
  );
}

/** 区块预览（只读，简单渲染） */
function BlockPreview({ block }: { block: Block }) {
  switch (block.type) {
    case 'profile':
      return (
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#2a2a2a', flexShrink: 0, backgroundImage: block.props.avatar ? 'url(' + block.props.avatar + ')' : undefined, backgroundSize: 'cover' }} />
          <div>
            <div style={{ fontWeight: 700, color: '#fff' }}>{block.props.name || '（未填名字）'}</div>
            {block.props.status && <div style={{ fontSize: '12px', color: '#18d1ff' }}>{block.props.status}</div>}
            {block.props.bio && <div style={{ fontSize: '13px', color: '#888', marginTop: '4px' }}>{block.props.bio}</div>}
          </div>
        </div>
      );
    case 'markdown':
      return <div style={{ fontSize: '14px', color: '#d2d2d2' }} dangerouslySetInnerHTML={{ __html: renderMarkdown(block.props.content || '') }} />;
    case 'links':
      return (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {block.props.links.map((l, i) => (
            <span key={i} style={{ padding: '4px 12px', border: '1px solid #333', borderRadius: '999px', fontSize: '12px' }}>{l.label || '（空）'}</span>
          ))}
        </div>
      );
    case 'articles':
      return <div style={{ fontSize: '13px', color: '#888' }}>文章列表 · 显示 {block.props.limit} 篇 · {block.props.layout === 'card' ? '卡片' : '列表'}</div>;
    case 'moments':
      return <div style={{ fontSize: '13px', color: '#888' }}>碎碎念 · 显示 {block.props.limit} 条</div>;
    case 'gallery':
      return <div style={{ fontSize: '13px', color: '#888' }}>相册 · {block.props.images.length} 张图 · {block.props.columns} 列</div>;
  }
}

/** 属性面板 */
function BlockInspector({ block, onChange }: { block: Block; onChange: (u: (b: Block) => Block) => void }) {
  const setProps = (patch: Record<string, unknown>) =>
    onChange((b) => ({ ...b, props: { ...(b as any).props, ...patch } } as Block));

  switch (block.type) {
    case 'profile':
      return (
        <div style={inspectorStack}>
          <Field label="名字"><input value={block.props.name || ''} onChange={(e) => setProps({ name: e.target.value })} style={input} /></Field>
          <Field label="状态"><input value={block.props.status || ''} onChange={(e) => setProps({ status: e.target.value })} style={input} placeholder="如：在写代码" /></Field>
          <Field label="简介"><textarea value={block.props.bio || ''} onChange={(e) => setProps({ bio: e.target.value })} rows={3} style={textarea} /></Field>
          <Field label="头像 URL"><input value={block.props.avatar || ''} onChange={(e) => setProps({ avatar: e.target.value })} style={input} placeholder="https://..." /></Field>
        </div>
      );
    case 'markdown':
      return (
        <div style={inspectorStack}>
          <Field label="Markdown 内容">
            <textarea value={block.props.content || ''} onChange={(e) => setProps({ content: e.target.value })} rows={14} style={textarea} />
          </Field>
        </div>
      );
    case 'links':
      return (
        <div style={inspectorStack}>
          <Field label="链接列表">
            {block.props.links.map((l, i) => (
              <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                <input value={l.label} onChange={(e) => {
                  const next = [...block.props.links];
                  next[i] = { ...next[i], label: e.target.value };
                  setProps({ links: next });
                }} style={{ ...input, flex: '0 0 40%' }} placeholder="标签" />
                <input value={l.url} onChange={(e) => {
                  const next = [...block.props.links];
                  next[i] = { ...next[i], url: e.target.value };
                  setProps({ links: next });
                }} style={{ ...input, flex: 1 }} placeholder="https://..." />
                <button onClick={() => setProps({ links: block.props.links.filter((_, j) => j !== i) })} style={iconBtn}>✕</button>
              </div>
            ))}
            <button onClick={() => setProps({ links: [...block.props.links, { label: '', url: '' }] })} style={typeBtn}>+ 添加链接</button>
          </Field>
        </div>
      );
    case 'articles':
      return (
        <div style={inspectorStack}>
          <Field label="显示条数">
            <input type="number" min={1} max={20} value={block.props.limit} onChange={(e) => setProps({ limit: Number(e.target.value) || 5 })} style={input} />
          </Field>
          <Field label="布局">
            <select value={block.props.layout} onChange={(e) => setProps({ layout: e.target.value })} style={input}>
              <option value="list">列表</option>
              <option value="card">卡片</option>
            </select>
          </Field>
        </div>
      );
    case 'moments':
      return (
        <div style={inspectorStack}>
          <Field label="显示条数">
            <input type="number" min={1} max={30} value={block.props.limit} onChange={(e) => setProps({ limit: Number(e.target.value) || 10 })} style={input} />
          </Field>
        </div>
      );
    case 'gallery':
      return (
        <div style={inspectorStack}>
          <Field label="列数">
            <input type="number" min={1} max={4} value={block.props.columns} onChange={(e) => setProps({ columns: Number(e.target.value) || 3 })} style={input} />
          </Field>
          <Field label="图片列表">
            {block.props.images.map((img, i) => (
              <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                <input value={img.url} onChange={(e) => {
                  const next = [...block.props.images];
                  next[i] = { ...next[i], url: e.target.value };
                  setProps({ images: next });
                }} style={{ ...input, flex: 1 }} placeholder="https://..." />
                <button onClick={() => setProps({ images: block.props.images.filter((_, j) => j !== i) })} style={iconBtn}>✕</button>
              </div>
            ))}
            <button onClick={() => setProps({ images: [...block.props.images, { url: '' }] })} style={typeBtn}>+ 添加图片</button>
          </Field>
        </div>
      );
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: '14px' }}>
      <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      {children}
    </label>
  );
}

// ---- styles ----
const root: React.CSSProperties = { width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: '#0d0d0d' };
const topbar: React.CSSProperties = { height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', borderBottom: '1px solid #2a2a2a', background: '#141414', flexShrink: 0 };
const brand: React.CSSProperties = { fontSize: '14px', color: '#18d1ff', fontWeight: 600 };
const topRight: React.CSSProperties = { display: 'flex', gap: '12px', alignItems: 'center' };
const layout: React.CSSProperties = { flex: 1, display: 'flex', overflow: 'hidden' };
const sidebar: React.CSSProperties = { width: '180px', borderRight: '1px solid #2a2a2a', padding: '16px 12px', overflowY: 'auto', flexShrink: 0 };
const asideTitle: React.CSSProperties = { fontSize: '11px', color: '#666', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' };
const typeBtn: React.CSSProperties = { width: '100%', padding: '10px 12px', marginBottom: '6px', background: '#1b1b1b', border: '1px solid #2a2a2a', borderRadius: '8px', color: '#d2d2d2', fontSize: '13px', cursor: 'pointer', textAlign: 'left' };
const canvas: React.CSSProperties = { flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', justifyContent: 'center' };
const previewWrap: React.CSSProperties = { width: '100%', maxWidth: '640px' };
const blockHeader: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' };
const typeLabel: React.CSSProperties = { fontSize: '11px', color: '#18d1ff', textTransform: 'uppercase', letterSpacing: '0.08em' };
const blockActions: React.CSSProperties = { display: 'flex', gap: '4px' };
const iconBtn: React.CSSProperties = { padding: '3px 7px', background: 'transparent', border: '1px solid #2a2a2a', borderRadius: '4px', color: '#888', fontSize: '11px', cursor: 'pointer' };
const inspector: React.CSSProperties = { width: '300px', borderLeft: '1px solid #2a2a2a', padding: '20px 16px', overflowY: 'auto', flexShrink: 0 };
const inspectorStack: React.CSSProperties = {};
const input: React.CSSProperties = { width: '100%', padding: '8px 10px', background: '#111', border: '1px solid #2a2a2a', borderRadius: '6px', color: '#d2d2d2', fontSize: '13px', outline: 'none' };
const textarea: React.CSSProperties = { ...input, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 };
const linkBtn: React.CSSProperties = { padding: '6px 14px', background: 'transparent', border: '1px solid #2a2a2a', borderRadius: '999px', color: '#d2d2d2', fontSize: '12px', textDecoration: 'none' };
const primaryBtn: React.CSSProperties = { padding: '6px 16px', background: '#18d1ff', color: '#000', border: 'none', borderRadius: '999px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' };

function blockCard(selected: boolean): React.CSSProperties {
  return {
    padding: '16px',
    background: '#1b1b1b',
    border: '1px solid ' + (selected ? '#18d1ff' : '#2a2a2a'),
    borderRadius: '12px',
    marginBottom: '12px',
    cursor: 'pointer',
    transition: 'border-color 0.15s',
  };
}
function saveStatusStyle(s: string): React.CSSProperties {
  return {
    fontSize: '11px',
    color: s === 'error' ? '#ff4d4d' : s === 'saved' ? '#4ade80' : s === 'saving' ? '#18d1ff' : '#666',
    minWidth: '60px',
    textAlign: 'right',
  };
}
