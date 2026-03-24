'use client';

import { useState } from 'react';
import { colors, typography, motion } from '@/lib/design-tokens';

interface ToolCardProps {
  icon: string;
  title: string;
  desc: string;
  badge?: string;
  onClick?: () => void;
}

export function ToolCard({ icon, title, desc, badge, onClick }: ToolCardProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
        background: hovered ? colors.background.nebula : colors.background.space,
        border: `1px solid ${hovered ? colors.border.glow : colors.border.space}`,
        borderRadius: 12,
        padding: '18px 20px',
        cursor: onClick ? 'pointer' : 'default',
        transition: `all ${motion.duration.normal} ${motion.easing.gravity}`,
      }}
    >
      {/* Badge */}
      {badge && (
        <span
          style={{
            position: 'absolute',
            top: 10,
            right: 12,
            fontFamily: typography.fontFamily.display,
            fontSize: 9,
            fontWeight: 700,
            color: colors.accent.webb,
            background: 'rgba(78, 122, 224, 0.12)',
            padding: '2px 8px',
            borderRadius: 4,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {badge}
        </span>
      )}

      {/* Icon box */}
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: colors.background.stellar,
          border: `1px solid ${colors.border.space}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: colors.text.starlight,
            fontFamily: typography.fontFamily.display,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 12,
            color: colors.text.dust,
            lineHeight: 1.4,
            marginTop: 2,
            fontFamily: typography.fontFamily.sans,
          }}
        >
          {desc}
        </div>
      </div>
    </div>
  );
}

export default ToolCard;
