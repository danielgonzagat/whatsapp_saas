'use client';

import type { ReactNode } from 'react';
import { colors } from '@/lib/design-tokens';

interface FormCardProps {
  children: ReactNode;
  title?: string;
  description?: string;
  className?: string;
}

export function FormCard({ children, title, description }: FormCardProps) {
  return (
    <div
      style={{
        background: colors.background.space,
        border: `1px solid ${colors.border.space}`,
        borderRadius: 12,
        padding: 24,
        marginBottom: 16,
      }}
    >
      {title && (
        <div style={{ marginBottom: 16 }}>
          <h4
            style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: 15,
              fontWeight: 600,
              color: colors.text.starlight,
              margin: 0,
            }}
          >
            {title}
          </h4>
          {description && (
            <p
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 12,
                color: colors.text.dust,
                margin: '4px 0 0',
              }}
            >
              {description}
            </p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
