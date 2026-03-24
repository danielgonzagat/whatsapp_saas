'use client';

import type { ReactNode } from 'react';

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
        borderBottom: '1px solid #19191C',
      }}
    >
      {icon && (
        <div
          style={{
            width: 36,
            height: 36,
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
      )}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 16,
              fontWeight: 600,
              color: '#E0DDD8',
              margin: 0,
            }}
          >
            {title}
          </h3>
          {badge && (
            <span
              style={{
                fontFamily: "'Sora', sans-serif",
                fontSize: 9,
                fontWeight: 700,
                color: '#6E6E73',
                background: 'rgba(110, 110, 115, 0.1)',
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
              fontFamily: "'Sora', sans-serif",
              fontSize: 12,
              color: '#3A3A3F',
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
