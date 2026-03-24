'use client';

import type { ReactNode } from 'react';
import { colors } from '@/lib/design-tokens';

interface SectionHeaderProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  badge?: string;
}

export function SectionHeader({ title, description, icon, badge }: SectionHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 16,
        paddingBottom: 12,
        borderBottom: `1px solid ${colors.border.void}`,
      }}
    >
      {icon && (
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: colors.background.nebula,
            border: `1px solid ${colors.border.void}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      )}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3
            style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: 16,
              fontWeight: 600,
              color: colors.text.starlight,
              letterSpacing: '0.02em',
              margin: 0,
            }}
          >
            {title}
          </h3>
          {badge && (
            <span
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: 9,
                fontWeight: 700,
                color: colors.accent.webb,
                background: 'rgba(78, 122, 224, 0.12)',
                padding: '2px 8px',
                borderRadius: 4,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              {badge}
            </span>
          )}
        </div>
        {description && (
          <p
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              color: colors.text.dust,
              margin: '2px 0 0',
            }}
          >
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
