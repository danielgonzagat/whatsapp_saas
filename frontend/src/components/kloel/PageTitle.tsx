'use client';

import { ReactNode } from 'react';

interface PageTitleProps {
  title: string;
  sub?: string;
  right?: ReactNode;
}

export function PageTitle({ title, sub, right }: PageTitleProps) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 24,
      }}
    >
      <div>
        <h1
          style={{
            fontFamily: "'Sora', sans-serif",
            fontSize: 20,
            fontWeight: 600,
            color: '#E0DDD8',
            margin: 0,
            letterSpacing: '-0.01em',
          }}
        >
          {title}
        </h1>
        {sub && (
          <p
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 13,
              color: '#3A3A3F',
              margin: '4px 0 0 0',
            }}
          >
            {sub}
          </p>
        )}
      </div>
      {right && <div>{right}</div>}
    </div>
  );
}

export default PageTitle;
