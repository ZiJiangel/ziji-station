import { useEffect, useRef } from 'react';

interface Props {
  children?: React.ReactNode;
  sparkColor?: string;
  sparkSize?: number;
  sparkRadius?: number;
  sparkCount?: number;
  duration?: number;
}

export default function ClickSpark({
  children,
  sparkColor,
  sparkSize = 10,
  sparkRadius = 18,
  sparkCount = 8,
  duration = 400,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const host = ref.current;
    if (!host) return;

    const color = sparkColor || getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#888';

    function onClick(e: MouseEvent) {
      const rect = host!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      for (let i = 0; i < sparkCount; i++) {
        const angle = (Math.PI * 2 * i) / sparkCount;
        const el = document.createElement('span');
        el.className = 'click-spark-dot';
        el.style.cssText = `
          position: fixed; left: ${e.clientX}px; top: ${e.clientY}px;
          width: ${sparkSize / 3}px; height: ${sparkSize / 3}px;
          border-radius: 50%; background: ${color};
          pointer-events: none; z-index: 9999;
          transform: translate(-50%, -50%);
        `;
        document.body.appendChild(el);
        const dx = Math.cos(angle) * sparkRadius;
        const dy = Math.sin(angle) * sparkRadius;
        el.animate(
          [
            { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
            { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0)`, opacity: 0 },
          ],
          { duration, easing: 'cubic-bezier(.22,1,.36,1)' }
        ).onfinish = () => el.remove();
      }
    }

    host.addEventListener('click', onClick);
    return () => host.removeEventListener('click', onClick);
  }, [sparkColor, sparkSize, sparkRadius, sparkCount, duration]);

  return <div ref={ref} style={{ display: 'contents' }}>{children}</div>;
}
