'use client';

import type { ReactNode } from 'react';

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
        background: '#111113',
        border: '1px solid #222226',
        borderRadius: 6,
        padding: 24,
        marginBottom: 16,
      }}
    >
      {title && (
        <div style={{ marginBottom: 16 }}>
          <h4
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 15,
              fontWeight: 600,
              color: '#E0DDD8',
              margin: 0,
            }}
          >
            {title}
          </h4>
          {description && (
            <p
              style={{
                fontFamily: "'Sora', sans-serif",
                fontSize: 12,
                color: '#3A3A3F',
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
