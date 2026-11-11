import { useEffect, useRef, useState } from 'react';

interface Props {
  text: string;
  delay?: number;
  stepDuration?: number;
  className?: string;
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span';
}

export default function BlurText({
  text,
  delay = 60,
  stepDuration = 0.35,
  className = '',
  as: Tag = 'span',
}: Props) {
  const ref = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (!ref.current) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setInView(true); io.disconnect(); } },
      { threshold: 0.1 }
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  const words = text.split(' ');

  return (
    <Tag ref={ref as any} className={`blur-text ${className}`} aria-label={text}>
      {words.map((w, i) => (
        <span
          key={i}
          className="blur-word"
          aria-hidden="true"
          style={{
            animationDelay: `${i * delay}ms`,
            animationDuration: `${stepDuration}s`,
            animationPlayState: inView && !reduced ? 'running' : 'paused',
            opacity: reduced ? 1 : undefined,
            filter: reduced ? 'none' : undefined,
          }}
        >
          {w}
          {i < words.length - 1 ? '\u00A0' : ''}
        </span>
      ))}
      <style>{`
        .blur-text { display: inline; }
        .blur-word {
          display: inline-block;
          opacity: 0;
          filter: blur(8px);
          transform: translateY(6px);
          animation-name: blurIn;
          animation-fill-mode: forwards;
          animation-timing-function: cubic-bezier(.22, 1, .36, 1);
          will-change: opacity, filter, transform;
        }
        @keyframes blurIn {
          to { opacity: 1; filter: blur(0); transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .blur-word { animation: none; opacity: 1; filter: none; transform: none; }
        }
      `}</style>
    </Tag>
  );
}
