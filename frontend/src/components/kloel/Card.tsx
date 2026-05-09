'use client';
import { colors } from '@/lib/design-tokens';

import { type CSSProperties, type ReactNode, useState } from 'react';

interface CardProps {
  children: ReactNode;
  style?: CSSProperties | undefined;
  onClick?: (() => void) | undefined;
  className?: string | undefined;
}

/** Card. */
export function Card({ children, style, onClick, className }: CardProps) {
  const [hovered, setHovered] = useState(false);
  const interactive = typeof onClick === 'function';
  const sharedStyle: CSSProperties = {
    background: 'var(--app-bg-card)',
    border: `1px solid ${hovered ? colors.border.glow : colors.background.border}`,
    borderRadius: 6,
    padding: 18,
    boxShadow: 'none',
    transition: 'all 150ms ease',
    cursor: interactive ? 'pointer' : undefined,
    ...style,
  };

  if (interactive) {
    return (
      <button
        type="button"
        className={className}
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={sharedStyle}
      >
        {children}
      </button>
    );
  }

  return (
    <div
      className={className}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={sharedStyle}
    >
      {children}
    </div>
  );
}

export default Card;
