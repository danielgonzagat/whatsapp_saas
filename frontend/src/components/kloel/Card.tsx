'use client';

import { useState, CSSProperties, ReactNode } from 'react';
import { colors, motion } from '@/lib/design-tokens';

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
        background: colors.background.space,
        border: `1px solid ${hovered ? colors.border.glow : colors.border.space}`,
        borderRadius: 12,
        padding: 20,
        boxShadow: hovered ? '0 0 20px rgba(78, 122, 224, 0.04)' : 'none',
        transition: `all ${motion.duration.normal} ${motion.easing.gravity}`,
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export default Card;
