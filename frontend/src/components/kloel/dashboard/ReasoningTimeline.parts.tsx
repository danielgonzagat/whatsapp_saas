'use client';

import { Check, Clock, FileText } from 'lucide-react';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { E, DIVIDER } from './KloelDashboard.subcomponents';

const TERTIARY = KLOEL_THEME.textTertiary;
const NESTED = KLOEL_THEME.bgSecondary;

export function formatDuration(ms: number): string {
  if (ms < 950) {
    return `${Math.max(1, Math.round(ms / 100) * 100 === 0 ? ms : ms)}ms`;
  }
  const seconds = ms / 1000;
  return seconds >= 10 ? `${Math.round(seconds)}s` : `${seconds.toFixed(1)}s`;
}

export function StepDot({ kind }: { kind: 'thinking' | 'tool' | 'done' }) {
  const base = {
    position: 'absolute' as const,
    left: 0,
    top: 1,
    width: 21,
    height: 21,
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: KLOEL_THEME.bgPrimary,
    color: kind === 'done' ? E : TERTIARY,
  };
  if (kind === 'tool') {
    return (
      <span
        style={{ ...base, borderRadius: 6, background: NESTED, border: `1px solid ${DIVIDER}` }}
      >
        <FileText size={11} strokeWidth={1.9} aria-hidden="true" />
      </span>
    );
  }
  return (
    <span style={base}>
      {kind === 'done' ? (
        <Check size={13} strokeWidth={2} aria-hidden="true" />
      ) : (
        <Clock size={13} strokeWidth={1.9} aria-hidden="true" />
      )}
    </span>
  );
}

export function ThinkingDots() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}>
      {[0, 1, 2].map((dot) => (
        <span
          key={dot}
          style={{
            width: 5,
            height: 5,
            borderRadius: 6,
            background: TERTIARY,
            animation: `rtl-bounce 1.2s ${dot * 0.16}s infinite`,
          }}
        />
      ))}
    </span>
  );
}
