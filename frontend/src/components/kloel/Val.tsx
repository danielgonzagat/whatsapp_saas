'use client';

import { ReactNode } from 'react';

interface ValProps {
  children: ReactNode;
  color?: string;
  size?: number;
}

export function Val({ children, color = '#E0DDD8', size = 24 }: ValProps) {
  return (
    <span
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: size,
        fontWeight: 600,
        letterSpacing: '-0.02em',
        color,
      }}
    >
      {children}
    </span>
  );
}

export default Val;
