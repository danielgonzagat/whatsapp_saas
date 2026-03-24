'use client';

import { ReactNode } from 'react';
import { colors, typography } from '@/lib/design-tokens';

interface LblProps {
  children: ReactNode;
}

export function Lbl({ children }: LblProps) {
  return (
    <span
      style={{
        fontFamily: typography.fontFamily.display,
        fontSize: 11,
        fontWeight: 600,
        color: colors.text.dust,
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
