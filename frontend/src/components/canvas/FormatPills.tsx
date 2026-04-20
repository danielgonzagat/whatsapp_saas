'use client';

import { HOME_PILLS } from '@/lib/canvas-formats';
import { useState } from 'react';

const S = "var(--font-sora), 'Sora', sans-serif";

interface FormatPillsProps {
  onPillClick?: () => void;
}

/** Format pills. */
export function FormatPills({ onPillClick }: FormatPillsProps) {
  const [hp, setHp] = useState<string | null>(null);

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 4,
        marginBottom: 32,
        flexWrap: 'wrap',
      }}
    >
      {HOME_PILLS.map((p) => (
        <button
          type="button"
          key={p.id}
          onMouseEnter={() => setHp(p.id)}
          onMouseLeave={() => setHp(null)}
          onClick={onPillClick}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 5,
            padding: '8px 8px',
            background: hp === p.id ? '#151517' : 'transparent',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            transition: 'all 0.2s',
            minWidth: 62,
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 6,
              background: hp === p.id ? `linear-gradient(135deg,${p.c[0]},${p.c[1]})` : '#111113',
              border: `1px solid ${hp === p.id ? `${p.c[0]}50` : '#1C1C1F'}`,
              transition: 'all 0.3s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: hp === p.id ? `0 4px 14px ${p.c[0]}25` : 'none',
            }}
          >
            {hp === p.id ? (
              <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{p.l.charAt(0)}</span>
            ) : (
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  background: `linear-gradient(135deg,${p.c[0]}50,${p.c[1]}50)`,
                }}
              />
            )}
          </div>
          <span
            style={{
              fontSize: 9,
              fontWeight: 500,
              color: hp === p.id ? '#E0DDD8' : '#6E6E73',
              fontFamily: S,
              transition: 'color 0.15s',
            }}
          >
            {p.l}
          </span>
        </button>
      ))}
    </div>
  );
}
