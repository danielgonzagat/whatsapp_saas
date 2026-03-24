'use client';

import { useState } from 'react';

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
        background: hovered ? '#19191C' : '#111113',
        border: `1px solid ${hovered ? '#333338' : '#222226'}`,
        borderRadius: 6,
        padding: '18px 20px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 150ms ease',
      }}
    >
      {/* Badge */}
      {badge && (
        <span
          style={{
            position: 'absolute',
            top: 10,
            right: 12,
            fontFamily: "'Sora', sans-serif",
            fontSize: 9,
            fontWeight: 700,
            color: '#6E6E73',
            background: 'rgba(110, 110, 115, 0.1)',
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
          borderRadius: 6,
          background: '#111113',
          border: '1px solid #222226',
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
            color: '#E0DDD8',
            fontFamily: "'Sora', sans-serif",
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 12,
            color: '#3A3A3F',
            lineHeight: 1.4,
            marginTop: 2,
            fontFamily: "'Sora', sans-serif",
          }}
        >
          {desc}
        </div>
      </div>
    </div>
  );
}

export default ToolCard;
