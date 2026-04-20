'use client';

import type { ReactNode } from 'react';

interface LblProps {
  children: ReactNode;
}

/** Lbl. */
export function Lbl({ children }: LblProps) {
  return (
    <span
      style={{
        fontFamily: "'Sora', sans-serif",
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--app-text-secondary)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        display: 'block',
        marginBottom: 6,
      }}
    >
      {children}
    </span>
  );
}

export default Lbl;
