import { useEffect, useRef, useState } from 'react';

interface CanvasElement {
  id: string;
  type: 'text' | 'image';
  x: number;
  y: number;
  w: number;
  h: number;
  content?: string;
  src?: string;
  fontSize?: number;
  color?: string;
}

interface Props {
  elements: CanvasElement[];
  username: string;
}

export default function PublicCanvas({ elements, username }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // 计算屏幕自适应缩放比例
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current) return;
      const { clientWidth, clientHeight } = containerRef.current;
      // 画布基础尺寸 1440x900
      const scaleX = clientWidth / 1440;
      const scaleY = clientHeight / 900;
      // 取较小的比例，保证画布完整显示，同时留一点边距
      const newScale = Math.min(scaleX, scaleY) * 0.95;
      setScale(newScale);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: '#1b1b1b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative'
      }}
    >
      {/* 画布容器 */}
      <div
        style={{
          width: '1440px',
          height: '900px',
          background: '#242424',
          backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          boxShadow: '0 0 50px rgba(0,0,0,0.8)',
          borderRadius: '12px',
          border: '1px solid #444',
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {elements.map(el => (
          <div
            key={el.id}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: `${el.w}px`,
              height: `${el.h}px`,
              transform: `translate(${el.x}px, ${el.y}px)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              userSelect: 'none'
            }}
          >
            {el.type === 'text' ? (
              <div style={{ color: el.color, fontSize: `${el.fontSize}px`, width: '100%', textAlign: 'center', whiteSpace: 'pre-wrap' }}>
                {el.content}
              </div>
            ) : (
              <div style={{ width: '100%', height: '100%', background: '#333', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', overflow: 'hidden' }}>
                {el.src ? <img src={el.src} alt="Canvas element" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '图片占位'}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 右下角悬浮角标 (架构文档 21 节) */}
      <a
        href="/"
        style={{
          position: 'absolute',
          bottom: '24px',
          right: '24px',
          background: 'rgba(24, 209, 255, 0.1)',
          border: '1px solid rgba(24, 209, 255, 0.3)',
          color: '#18d1ff',
          padding: '8px 16px',
          borderRadius: '30px',
          fontSize: '12px',
          fontWeight: 'bold',
          textDecoration: 'none',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          transition: 'all 0.2s',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(24, 209, 255, 0.2)';
          e.currentTarget.style.transform = 'translateY(-2px)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(24, 209, 255, 0.1)';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
      >
        <span style={{ fontSize: '16px' }}>⚡</span> ziji.zh.kg
      </a>
    </div>
  );
}