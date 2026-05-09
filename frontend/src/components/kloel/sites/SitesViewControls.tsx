'use client';
import { colors } from '@/lib/design-tokens';

import React from 'react';
import { SORA, BORDER, BG_CARD, EMBER, TEXT } from './SitesViewIcons';

export function Input({
  value,
  onChange,
  placeholder,
  style: extraStyle,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  ariaLabel?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel || placeholder}
      style={{
        fontFamily: SORA,
        fontSize: 13,
        padding: '8px 14px',
        borderRadius: 6,
        border: `1px solid ${BORDER}`,
        background: BG_CARD,
        color: TEXT,
        outline: 'none',
        width: '100%',
        ...extraStyle,
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = EMBER; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = BORDER; }}
    />
  );
}

export function ProgressBar({ value, max = 100, color = EMBER }: { value: number; max?: number; color?: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div style={{ width: '100%', height: 4, background: BORDER, borderRadius: 99, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width .4s' }} />
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
      <div style={{ width: 36, height: 20, borderRadius: 10, background: checked ? EMBER : BORDER, transition: 'all .2s', position: 'relative', padding: 2 }}>
        <div style={{ width: 16, height: 16, borderRadius: '50%', background: colors.text.silver, transform: checked ? 'translateX(16px)' : 'translateX(0)', transition: 'transform .2s' }} />
      </div>
      {label && <span style={{ fontFamily: SORA, fontSize: 12, color: TEXT }}>{label}</span>}
    </button>
  );
}
