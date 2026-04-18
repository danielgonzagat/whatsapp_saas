'use client';

import { type CSSProperties, type ReactNode, useState } from 'react';

interface CardProps {
  children: ReactNode;
  style?: CSSProperties;
  onClick?: () => void;
  className?: string;
}

export function Card({ children, style, onClick, className }: CardProps) {
  const [hovered, setHovered] = useState(false);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: role/tabIndex applied when onClick is provided; hover handlers are decorative and do not require keyboard parity
    <div
      className={className}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={{
        background: 'var(--app-bg-card)',
        border: `1px solid ${hovered ? '#333338' : '#222226'}`,
        borderRadius: 6,
        padding: 18,
        boxShadow: 'none',
        transition: 'all 150ms ease',
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          (e.currentTarget as HTMLElement).click();
        }
      }}
    >
      {children}
    </div>
  );
}

export default Card;
