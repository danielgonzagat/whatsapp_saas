'use client';

import { ReactNode } from 'react';
import { colors, typography } from '@/lib/design-tokens';

interface ValProps {
  children: ReactNode;
  color?: string;
  size?: number;
}

export function Val({ children, color = colors.text.starlight, size = 24 }: ValProps) {
  return (
    <span
      style={{
        fontFamily: typography.fontFamily.display,
        fontSize: size,
        fontWeight: 700,
        letterSpacing: '-0.01em',
        color,
      }}
    >
      {children}
    </span>
  );
}

export default Val;
