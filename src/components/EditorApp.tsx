import { useEffect, useState, useRef, useCallback } from 'react';
import interact from 'interactjs';
import { gsap } from 'gsap';
import type { CanvasElement, PageData } from '../lib/canvas';
import { DEFAULT_TEMPLATE, createElement, TEMPLATES } from '../lib/canvas';
import { getMyPage, saveDraft, publishPage } from '../lib/api';

const CANVAS_W = 1440;
const CANVAS_H = 900;
const GRID = 10;

export default function EditorApp() {
  const [data, setData] = useState<PageData>(DEFAULT_TEMPLATE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [scale, setScale] = useState(1);
  const [showLayers, setShowLayers] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<'style' | 'anim'>('style');
  const [openAccordion, setOpenAccordion] = useState<string | null>('basic');
  
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<number | null>(null);
  const dataRef = useRef<PageData>(DEFAULT_TEMPLATE);

  // 初始化加载数据
  useEffect(() => {
    const user = localStorage.getItem('ziji_user');
    const uid = localStorage.getItem('ziji_uid');
    if (!user || !uid) { window.location.href = '/login'; return; }
    setUserId(uid); setUsername(user);

    getMyPage(uid).then(res => {
      if (res && res.elements && res.elements.length > 0) {
        setData(res); dataRef.current = res;
      } else {
        setData(DEFAULT_TEMPLATE); dataRef.current = DEFAULT_TEMPLATE;
      }
    }).catch(console.error);
  }, []);

  // 计算自适应缩放
  useEffect(() => {
    const calcScale = () => {
      if (!containerRef.current) return;
      const { clientWidth, clientHeight } = containerRef.current;
      const s = Math.min(clientWidth / CANVAS_W, clientHeight / CANVAS_H) * 0.95;
      setScale(s);
    };
    calcScale();
    window.addEventListener('resize', calcScale);
    return () => window.removeEventListener('resize', calcScale);
  }, []);

  // 自动保存
  const scheduleSave = useCallback((newData: PageData) => {
    dataRef.current = newData;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      if (!userId) return;
      setSaveStatus('saving');
      try {
        await saveDraft(userId, dataRef.current);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 1500);
      } catch (err) {
        console.error(err);
        setSaveStatus('error');
      }
    }, 1200);
  }, [userId]);

  const updateData = (updater: (d: PageData) => PageData) => {
    setData(prev => {
      const next = updater(prev);
      scheduleSave(next);
      return next;
    });
  };

  const updateEl = (id: string, patch: Partial<CanvasElement>) => {
    updateData(d => ({ ...d, elements: d.elements.map(el => el.id === id ? { ...el, ...patch } : el) }));
  };

  // interact.js 拖拽与缩放绑定
  useEffect(() => {
    if (!canvasRef.current) return;
    
    interact('.resize-drag').unset();
    interact('.resize-drag')
      .draggable({
        modifiers: [
          interact.modifiers.snap({
            targets: [interact.snappers.grid({ x: GRID, y: GRID })],
            range: Infinity,
            relativePoints: [{ x: 0, y: 0 }]
          })
        ],
        listeners: {
          move(event) {
            const target = event.target as HTMLElement;
            const id = target.getAttribute('data-id')!;
            const x = (parseFloat(target.getAttribute('data-x') || '0')) + event.dx;
            const y = (parseFloat(target.getAttribute('data-y') || '0')) + event.dy;
            target.style.transform = `translate(${x}px, ${y}px)`;
            target.setAttribute('data-x', x.toString());
            target.setAttribute('data-y', y.toString());
          },
          end(event) {
            const target = event.target as HTMLElement;
            const id = target.getAttribute('data-id')!;
            const x = parseFloat(target.getAttribute('data-x') || '0');
            const y = parseFloat(target.getAttribute('data-y') || '0');
            updateEl(id, { x, y });
          }
        }
      })
      .resizable({
        edges: { left: true, right: true, bottom: true, top: true },
        listeners: {
          move(event) {
            const target = event.target as HTMLElement;
            const id = target.getAttribute('data-id')!;
            let x = parseFloat(target.getAttribute('data-x') || '0');
            let y = parseFloat(target.getAttribute('data-y') || '0');
            
            x += event.deltaRect.left;
            y += event.deltaRect.top;

            target.style.width = `${event.rect.width}px`;
            target.style.height = `${event.rect.height}px`;
            target.style.transform = `translate(${x}px, ${y}px)`;

            target.setAttribute('data-x', x.toString());
            target.setAttribute('data-y', y.toString());
          },
          end(event) {
            const target = event.target as HTMLElement;
            const id = target.getAttribute('data-id')!;
            updateEl(id, {
              x: parseFloat(target.getAttribute('data-x') || '0'),
              y: parseFloat(target.getAttribute('data-y') || '0'),
              w: Math.round(event.rect.width),
              h: Math.round(event.rect.height)
            });
          }
        },
        modifiers: [
          interact.modifiers.restrictSize({ min: { width: 20, height: 20 } })
        ]
      });
  }, [data.elements.length]); // 元素增减时重新绑定

  
  const moveLayer = (id: string, action: 'up' | 'down' | 'top' | 'bottom') => {
    updateData(d => {
      const els = [...d.elements].sort((a, b) => a.zIndex - b.zIndex);
      const idx = els.findIndex(e => e.id === id);
      if (idx === -1) return d;
      
      if (action === 'top') {
        els[idx].zIndex = Math.max(...els.map(e => e.zIndex)) + 1;
      } else if (action === 'bottom') {
        els[idx].zIndex = Math.min(...els.map(e => e.zIndex)) - 1;
      } else if (action === 'up' && idx < els.length - 1) {
        const temp = els[idx].zIndex;
        els[idx].zIndex = els[idx + 1].zIndex;
        els[idx + 1].zIndex = temp;
      } else if (action === 'down' && idx > 0) {
        const temp = els[idx].zIndex;
        els[idx].zIndex = els[idx - 1].zIndex;
        els[idx - 1].zIndex = temp;
      }
      return { ...d, elements: els };
    });
  };

  const handlePublish = async () => {
    if (!userId) return;
    try {
      await saveDraft(userId, dataRef.current);
      await publishPage(userId, dataRef.current);
      alert('发布成功！访问 /' + username + ' 查看');
    } catch (e: any) {
      alert('发布失败: ' + e.message);
    }
  };

  // 渲染单个画布元素
  const renderElement = (el: CanvasElement) => {
    const isSelected = selectedId === el.id;
    const isEditing = editingId === el.id;
    
    return (
      <div
        key={el.id}
        data-id={el.id}
        className="resize-drag"
        data-x={el.x}
        data-y={el.y}
        style={{
          position: 'absolute', top: 0, left: 0,
          width: el.w, height: el.h,
          transform: `translate(${el.x}px, ${el.y}px)`,
          zIndex: el.zIndex,
          opacity: el.opacity,
          borderRadius: el.borderRadius,
          outline: isSelected ? '2px solid var(--accent)' : 'none',
          cursor: isEditing ? 'text' : 'move',
          userSelect: 'none'
        }}
        onClick={(e) => { e.stopPropagation(); setSelectedId(el.id); }}
        onDoubleClick={(e) => { e.stopPropagation(); if(el.type === 'text') setEditingId(el.id); }}
      >
        {/* 元素内容渲染 */}
        {el.type === 'text' && (
          isEditing ? (
            <textarea
              autoFocus
              value={el.content}
              onChange={(e) => updateEl(el.id, { content: e.target.value })}
              onBlur={() => setEditingId(null)}
              style={{ width: '100%', height: '100%', background: 'transparent', border: 'none', outline: 'none', resize: 'none', fontFamily: 'inherit', fontSize: el.fontSize, color: el.color, textAlign: 'center', lineHeight: 1.2 }}
            />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: el.fontSize, color: el.color, whiteSpace: 'pre-wrap', lineHeight: 1.2 }}>
              {el.content}
            </div>
          )
        )}
        {el.type === 'rect' && <div style={{ width: '100%', height: '100%', background: el.bgColor, borderRadius: el.borderRadius }} />}
        {el.type === 'image' && (
          el.src ? <img src={el.src} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: el.borderRadius }} draggable={false} /> 
          : <div style={{ width: '100%', height: '100%', background: 'var(--paper-2)', borderRadius: el.borderRadius, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>双击选图</div>
        )}
        {el.type === 'article_list' && (
          <div style={{ width: '100%', height: '100%', background: el.bgColor, borderRadius: el.borderRadius, padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px', overflow: 'hidden' }}>
            <h3 style={{ fontFamily: 'var(--font-round)', color: 'var(--ink)', marginBottom: '10px' }}>最新文章</h3>
            <div style={{ color: 'var(--muted)', fontSize: '13px' }}>（连接数据库后自动拉取）</div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh', background: 'var(--paper-2)' }}>
      {/* 顶部工具栏 */}
      <header style={{ height: '56px', background: 'var(--card)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', padding: '0 20px', justifyContent: 'space-between', zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontFamily: 'var(--font-round)', fontWeight: 800, color: 'var(--ink)' }}>画布编辑器 · {username}</span>
          <button onClick={() => setShowLayers(!showLayers)} className="ak-btn ak-btn--line ak-btn--sm">图层面板</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '12px', color: saveStatus === 'error' ? 'red' : 'var(--muted)' }}>
            {saveStatus === 'saving' ? '保存中…' : saveStatus === 'saved' ? '已保存' : saveStatus === 'error' ? '保存失败' : ''}
          </span>
          <a href={'/' + username} target="_blank" className="ak-btn ak-btn--line">预览</a>
          <button onClick={handlePublish} className="ak-btn ak-btn--pri">发布</button>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* 左侧模块（手风琴） */}
        <aside style={{ width: '240px', background: 'var(--card)', borderRight: '1px solid var(--line)', overflowY: 'auto', padding: '16px' }}>
          <h4 style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '12px' }}>一键模板</h4>
          <select 
            onChange={(e) => {
              const tpl = TEMPLATES[e.target.value];
              if (tpl && confirm('应用模板将覆盖当前画布，确定吗？')) {
                updateData(() => tpl.data);
              }
            }}
            className="ak-btn ak-btn--soft" 
            style={{ width: '100%', marginBottom: '24px' }}
          >
            <option value="">选择高质量模板…</option>
            {Object.entries(TEMPLATES).map(([key, t]) => <option key={key} value={key}>{t.name}</option>)}
          </select>
          
          {/* 手风琴：基础元素 */}
          <div style={{ borderBottom: '1px solid var(--line-soft)' }}>
            <button onClick={() => setOpenAccordion(openAccordion === 'basic' ? null : 'basic')} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
              基础元素 <span>{openAccordion === 'basic' ? '−' : '+'}</span>
            </button>
            {openAccordion === 'basic' && (
              <div style={{ padding: '0 0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button onClick={() => updateData(d => ({ ...d, elements: [...d.elements, createElement('text')] }))} className="ak-btn ak-btn--line" style={{ justifyContent: 'flex-start' }}>+ 文本</button>
                <button onClick={() => updateData(d => ({ ...d, elements: [...d.elements, createElement('rect')] }))} className="ak-btn ak-btn--line" style={{ justifyContent: 'flex-start' }}>+ 形状</button>
                <button onClick={() => updateData(d => ({ ...d, elements: [...d.elements, createElement('image')] }))} className="ak-btn ak-btn--line" style={{ justifyContent: 'flex-start' }}>+ 图片</button>
              </div>
            )}
          </div>

          {/* 手风琴：聚合组件 */}
          <div style={{ borderBottom: '1px solid var(--line-soft)' }}>
            <button onClick={() => setOpenAccordion(openAccordion === 'agg' ? null : 'agg')} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
              聚合组件 <span>{openAccordion === 'agg' ? '−' : '+'}</span>
            </button>
            {openAccordion === 'agg' && (
              <div style={{ padding: '0 0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button onClick={() => updateData(d => ({ ...d, elements: [...d.elements, createElement('article_list')] }))} className="ak-btn ak-btn--line" style={{ justifyContent: 'flex-start' }}>+ 文章列表</button>
              </div>
            )}
          </div>
        </aside>

        {/* 中间画布 */}
        <main ref={containerRef} style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--paper-3)' }} onClick={() => { setSelectedId(null); setEditingId(null); }}>
          <div 
            ref={canvasRef}
            style={{
              width: CANVAS_W, height: CANVAS_H,
              background: data.background,
              boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
              transform: `scale(${scale})`,
              transformOrigin: 'center center',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            {data.elements.map(renderElement)}
          </div>
        </main>

        {/* 右侧属性面板 */}
        <aside style={{ width: '300px', background: 'var(--card)', borderLeft: '1px solid var(--line)', overflowY: 'auto' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--line)' }}>
            <button onClick={() => setInspectorTab('style')} style={{ flex: 1, padding: '14px', fontSize: '13px', fontWeight: inspectorTab==='style'?700:400, borderBottom: inspectorTab==='style'?'2px solid var(--accent)':'none', color: inspectorTab==='style'?'var(--ink)':'var(--muted)' }}>样式</button>
            <button onClick={() => setInspectorTab('anim')} style={{ flex: 1, padding: '14px', fontSize: '13px', fontWeight: inspectorTab==='anim'?700:400, borderBottom: inspectorTab==='anim'?'2px solid var(--accent)':'none', color: inspectorTab==='anim'?'var(--ink)':'var(--muted)' }}>动效</button>
          </div>
          <div style={{ padding: '20px' }}>
            {!selectedId ? <p style={{ color: 'var(--muted)', fontSize: '13px', textAlign: 'center', marginTop: '40px' }}>选中画布元素以编辑</p> : (
              <InspectorPanel 
                el={data.elements.find(e => e.id === selectedId)!} 
                onChange={(patch) => updateEl(selectedId, patch)}
                tab={inspectorTab}
              />
            )}
          </div>
        </aside>
      </div>
      
      {/* 图层面板（覆盖在最上层） */}
      {showLayers && (
        <div style={{ position: 'absolute', top: '56px', left: '20px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', width: '200px', padding: '10px', zIndex: 200 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '12px', color: 'var(--muted)' }}>
            <span>图层</span><button onClick={() => setShowLayers(false)}>✕</button>
          </div>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {[...data.elements].sort((a,b) => b.zIndex - a.zIndex).map(el => (
              <div key={el.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: selectedId === el.id ? 'var(--accent-soft)' : 'transparent', borderRadius: '6px', marginBottom: '4px' }}>
                <div onClick={() => setSelectedId(el.id)} style={{ flex: 1, cursor: 'pointer', fontSize: '12px' }}>
                  {el.type} <span style={{ opacity: 0.5 }}>#{el.zIndex}</span>
                </div>
                <div style={{ display: 'flex', gap: '2px' }}>
                  <button onClick={() => moveLayer(el.id, 'top')} style={{ padding: '2px 4px', fontSize: '10px' }} title="置顶">⤒</button>
                  <button onClick={() => moveLayer(el.id, 'up')} style={{ padding: '2px 4px', fontSize: '10px' }} title="上移">↑</button>
                  <button onClick={() => moveLayer(el.id, 'down')} style={{ padding: '2px 4px', fontSize: '10px' }} title="下移">↓</button>
                  <button onClick={() => moveLayer(el.id, 'bottom')} style={{ padding: '2px 4px', fontSize: '10px' }} title="置底">⤓</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InspectorPanel({ el, onChange, tab }: { el: CanvasElement, onChange: (p: Partial<CanvasElement>) => void, tab: 'style' | 'anim' }) {
  if (tab === 'style') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {el.type === 'text' && (
          <>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
              字号
              <input type="range" min="12" max="80" value={el.fontSize} onChange={e => onChange({ fontSize: Number(e.target.value) })} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
              颜色
              <input type="color" value={el.color?.startsWith('#') ? el.color : '#333'} onChange={e => onChange({ color: e.target.value })} style={{ height: '30px' }} />
            </label>
          </>
        )}
        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
          透明度
          <input type="range" min="0" max="1" step="0.1" value={el.opacity} onChange={e => onChange({ opacity: Number(e.target.value) })} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
          层级 (Z-index)
          <input type="number" value={el.zIndex} onChange={e => onChange({ zIndex: Number(e.target.value) })} />
        </label>
      </div>
    );
  }
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
        入场动画
        <select value={el.animation || 'none'} onChange={e => onChange({ animation: e.target.value as any })} className="ak-btn ak-btn--line" style={{ height: 'auto', padding: '8px' }}>
          <option value="none">无</option>
          <option value="fade">淡入</option>
          <option value="slideUp">上滑</option>
          <option value="zoomIn">放大</option>
        </select>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
        动画时长 (秒)
        <input type="number" step="0.1" value={el.animDuration} onChange={e => onChange({ animDuration: Number(e.target.value) })} />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
        延迟 (秒)
        <input type="number" step="0.1" value={el.animDelay} onChange={e => onChange({ animDelay: Number(e.target.value) })} />
      </label>
    </div>
  );
}
