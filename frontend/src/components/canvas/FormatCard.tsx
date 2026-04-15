'use client';

import type { FormatItem } from '@/lib/canvas-formats';
import { useState } from 'react';
import { MockupMap, SquareSVG } from './MockupSVGs';

const S = "var(--font-sora), 'Sora', sans-serif";
const M = "var(--font-jetbrains), 'JetBrains Mono', monospace";

interface FormatCardProps {
  item: FormatItem;
  onClick?: (item: FormatItem) => void;
}

export function FormatCard({ item, onClick }: FormatCardProps) {
  const [h, setH] = useState(false);
  const c = item.c;

  return (
    <button
      type="button"
      onClick={() => onClick?.(item)}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        background: h ? '#151517' : '#111113',
        border: `1px solid ${h ? `${c[0]}35` : '#1C1C1F'}`,
        borderRadius: 6,
        padding: 0,
        cursor: 'pointer',
        transition: 'all 0.25s',
        overflow: 'hidden',
        textAlign: 'left',
        boxShadow: h ? `0 6px 20px ${c[0]}12` : 'none',
        transform: h ? 'translateY(-1px)' : 'none',
      }}
    >
      <div
        style={{
          height: 105,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: h ? `${c[0]}05` : '#0D0D0F',
          transition: 'all 0.3s',
        }}
      >
        {MockupMap[item.m]?.(c) || <SquareSVG c1={c[0]} c2={c[1]} />}
      </div>
      <div style={{ padding: '7px 10px 9px' }}>
        <p
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: '#E0DDD8',
            fontFamily: S,
            marginBottom: 1,
          }}
        >
          {item.l}
        </p>
        {item.s && <p style={{ fontSize: 9, color: '#3A3A3F', fontFamily: M }}>{item.s}</p>}
      </div>
    </button>
  );
}
