import { useRef, useState } from 'react';

interface Props {
  children: React.ReactNode;
  className?: string;
  spotlightColor?: string;
}

export default function SpotlightCard({ children, className = '', spotlightColor }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  function onMove(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  }

  const color = spotlightColor || 'oklch(var(--accent-L) var(--chroma-accent) var(--hue) / 0.10)';

  return (
    <div
      ref={ref}
      className={`spotlight-card ${className}`}
      onMouseMove={onMove}
      onMouseEnter={() => setOpacity(1)}
      onMouseLeave={() => setOpacity(0)}
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          opacity,
          transition: 'opacity 0.3s var(--ease-out)',
          background: `radial-gradient(220px circle at ${pos.x}px ${pos.y}px, ${color}, transparent 70%)`,
        }}
      />
      <div style={{ position: 'relative', zIndex: 1, display: 'contents' }}>{children}</div>
    </div>
  );
}
