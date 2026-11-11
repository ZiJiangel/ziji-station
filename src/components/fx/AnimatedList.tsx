import { motion } from 'motion/react';

interface Props {
  children: React.ReactNode[];
  className?: string;
  stagger?: number;
}

export default function AnimatedList({ children, className = '', stagger = 0.06 }: Props) {
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduced) return <div className={className}>{children}</div>;

  return (
    <div className={className}>
      {children.map((child, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{
            duration: 0.5,
            delay: i * stagger,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          {child}
        </motion.div>
      ))}
    </div>
  );
}
