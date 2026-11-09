import { useEffect, useRef, useState } from 'react';
import interact from 'interactjs';
import { gsap } from 'gsap';
import { api } from '../lib/api';

interface CanvasElement {
  id: string;
  type: 'text' | 'image' | 'rect' | 'line' | 'music' | 'article_list';
  x: number; y: number; w: number; h: number;
  content?: string; src?: string; fontSize?: number; color?: string;
  borderRadius?: number; opacity?: number; bgColor?: string;
  songName?: string; artistName?: string; audioUrl?: string;
  animation?: 'none' | 'fade' | 'slideUp' | 'slideDown' | 'zoomIn';
  animDuration?: number; animDelay?: number; articleLimit?: number;
}

export default function EditorCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ x: 0, y: 0, scale: 1 });
  const saveTimeoutRef = useRef<number | null>(null);

  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [username, setUsername] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<'style' | 'anim'>('style');
  
  // 新增：保存云端文章列表
  const [cloudArticles, setCloudArticles] = useState<any[]>([]);

  useEffect(() => {
    const user = localStorage.getItem('ziji_user');
    const uid = localStorage.getItem('ziji_uid');
    if (!user || !uid) { window.location.href = '/login'; return; }
    setUsername(user);
    setUserId(uid);

    // 拉取画布草稿
    api.getPage(uid).then(res => {
      if (res && res.draft_data && res.draft_data.elements) {
        setElements(res.draft_data.elements);
      } else {
        setElements([{ id: 'el-1', type: 'text', x: 500, y: 350, w: 400, h: 100, content: '你好，我是' + user, fontSize: 36, color: '#18d1ff', opacity: 1, animation: 'fade', animDuration: 1, animDelay: 0 }]);
      }
    });

    // 拉取云端文章数据供聚合组件使用
    api.getFeed().then(res => {
      setCloudArticles(res.articles || []);
    });
  }, []);

  // ... (自动保存与手势逻辑保持不变) ...

  // ... (渲染逻辑) ...
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh', overflow: 'hidden', background: '#111' }}>
      {/* ... 顶栏和左侧 ... */}
        <div ref={containerRef} onClick={() => { setSelectedId(null); setEditingId(null); }} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <div ref={canvasRef} style={{ /* ... 样式 ... */ }}>
            {elements.map(el => {
              // ...
              return (
                <div key={el.id} data-id={el.id} className="canvas-element" /* ... */>
                  {/* ... 其他类型渲染 ... */}
                  
                  {el.type === 'article_list' && (
                    <div style={{ width: '100%', height: '100%', background: el.bgColor || '#111', display: 'flex', flexDirection: 'column', padding: '16px', gap: '12px', borderRadius: `${el.borderRadius ?? 12}px`, border: '1px solid #333', boxSizing: 'border-box', overflowY: 'auto' }}>
                      {cloudArticles.slice(0, el.articleLimit || 3).map((a, i) => (
                        <div key={i} style={{ borderBottom: '1px solid #333', paddingBottom: '8px' }}>
                          <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#18d1ff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</div>
                          <div style={{ fontSize: '12px', color: '#888', marginTop: '4px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{a.content}</div>
                        </div>
                      ))}
                      {cloudArticles.length === 0 && <div style={{ color: '#666', fontSize: '12px', textAlign: 'center', marginTop: '20px' }}>暂无文章</div>}
                    </div>
                  )}

                  {/* ... 音乐播放器等 ... */}
                </div>
              );
            })}
          </div>
          {/* ... 右侧属性面板 ... */}
        </div>
    </div>
  );
}