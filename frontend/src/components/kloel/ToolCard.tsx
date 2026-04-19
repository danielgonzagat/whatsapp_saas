'use client';

import { useState } from 'react';
import { resolveBadgeLabel, resolveCursor, triggerClickOnActivation } from './ToolCard.helpers';

interface ToolCardProps {
  icon: string;
  title: string;
  desc: string;
  badge?: string;
  disabled?: boolean;
  onClick?: () => void;
}

export function ToolCard({ icon, title, desc, badge, disabled, onClick }: ToolCardProps) {
  const [hovered, setHovered] = useState(false);
  const effectiveBadge = resolveBadgeLabel(badge, disabled);
  const interactive = typeof onClick === 'function';
  const isHot = hovered && interactive;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: role/tabIndex applied when interactive; hover handlers are decorative and do not require keyboard parity
    <div
      onClick={interactive ? onClick : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-disabled={disabled || undefined}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
        background: isHot ? '#19191C' : '#111113',
        border: `1px solid ${isHot ? '#333338' : '#222226'}`,
        borderRadius: 6,
        padding: '18px 20px',
        cursor: resolveCursor(interactive, disabled),
        opacity: disabled ? 0.72 : 1,
        transition: 'all 150ms ease',
      }}
      onKeyDown={interactive ? triggerClickOnActivation : undefined}
    >
      {/* Badge */}
      {effectiveBadge && (
        <span
          style={{
            position: 'absolute',
            top: 10,
            right: 12,
            fontFamily: "'Sora', sans-serif",
            fontSize: 9,
            fontWeight: 700,
            color: disabled ? '#E85D30' : '#6E6E73',
            background: disabled ? 'rgba(232, 93, 48, 0.1)' : 'rgba(110, 110, 115, 0.1)',
            padding: '2px 8px',
            borderRadius: 4,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {effectiveBadge}
        </span>
      )}

      {/* Icon box */}
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 6,
          background: 'var(--app-bg-card)',
          border: '1px solid var(--app-border-primary)',
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
            color: 'var(--app-text-primary)',
            fontFamily: "'Sora', sans-serif",
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--app-text-tertiary)',
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
