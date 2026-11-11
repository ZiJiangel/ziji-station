import { useRef, useState } from 'react';

interface Props {
  children: React.ReactNode;
  padding?: number;
  strength?: number;
  className?: string;
  as?: 'div' | 'span';
}

export default function Magnet({
  children,
  padding = 60,
  strength = 0.35,
  className = '',
  as: Tag = 'div',
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [t, setT] = useState({ x: 0, y: 0 });

  function onMove(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);
    const maxDist = Math.max(r.width, r.height) / 2 + padding;
    if (dist < maxDist) {
      setT({ x: dx * strength, y: dy * strength });
    } else {
      setT({ x: 0, y: 0 });
    }
  }

  return (
    <Tag
      ref={ref as any}
      className={className}
      onMouseMove={onMove}
      onMouseLeave={() => setT({ x: 0, y: 0 })}
      style={{
        transform: `translate3d(${t.x}px, ${t.y}px, 0)`,
        transition: 'transform 0.28s cubic-bezier(.22,1,.36,1)',
        display: 'inline-flex',
        willChange: 'transform',
      }}
    >
      {children}
    </Tag>
  );
}
