interface Props { size?: number; label?: string; }

export default function LatticeLoader({ size = 28, label = '加载中' }: Props) {
  return (
    <span className="lattice-loader" role="status" aria-label={label}>
      {Array.from({ length: 9 }).map((_, i) => (
        <span key={i} style={{ animationDelay: `${(i % 3) * 0.15 + Math.floor(i / 3) * 0.15}s` }} />
      ))}
      <style>{`
        .lattice-loader {
          display: inline-grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 3px;
          width: ${size}px; height: ${size}px;
        }
        .lattice-loader span {
          background: var(--accent);
          border-radius: 2px;
          opacity: 0.2;
          animation: latticePulse 1.2s var(--ease-in-out) infinite;
        }
        @keyframes latticePulse {
          0%, 100% { opacity: 0.15; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .lattice-loader span { animation: none; opacity: 0.5; }
        }
      `}</style>
    </span>
  );
}
