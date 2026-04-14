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
    <div
      className={className}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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
    >
      {children}
    </div>
  );
}

export default Card;
