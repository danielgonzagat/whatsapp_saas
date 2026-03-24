'use client';

import { ReactNode } from 'react';
import { colors, typography } from '@/lib/design-tokens';

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
        marginBottom: 28,
      }}
    >
      <div>
        <h1
          style={{
            fontFamily: typography.fontFamily.display,
            fontSize: 22,
            fontWeight: 600,
            color: colors.text.starlight,
            margin: 0,
            letterSpacing: '0.02em',
          }}
        >
          {title}
        </h1>
        {sub && (
          <p
            style={{
              fontFamily: typography.fontFamily.sans,
              fontSize: 13,
              color: colors.text.dust,
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
