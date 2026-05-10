'use client';
import { colors } from '@/lib/design-tokens';

import { kloelT } from '@/lib/i18n/t';
import { TrendingUp } from 'lucide-react';

interface ContactScoreSentimentSectionProps {
  score: number;
  sentiment: 'positive' | 'neutral' | 'negative';
}

const C = {
  elevated: colors.background.elevated,
  accent: colors.ember.primary,
  text: colors.text.silver,
  muted: colors.text.muted,
  mono: "var(--font-jetbrains), 'JetBrains Mono', monospace",
} as const;

const sentimentColors: Record<string, { bg: string; text: string }> = {
  positive: { bg: 'rgba(52,199,89,0.15)', text: colors.semantic.success },
  neutral: { bg: 'rgba(110,110,115,0.15)', text: colors.text.muted },
  negative: { bg: 'rgba(255,69,58,0.15)', text: colors.semantic.error },
};

export function ContactScoreSentimentSection({
  score,
  sentiment,
}: ContactScoreSentimentSectionProps) {
  const sentimentStyle = sentimentColors[sentiment] ?? sentimentColors.neutral;

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 12,
            marginBottom: 4,
          }}
        >
          <span style={{ color: C.muted }}>{kloelT('Lead Score')}</span>
          <span style={{ fontFamily: C.mono, color: C.text }}>{score}</span>
        </div>
        <div
          style={{
            height: 6,
            borderRadius: 3,
            background: C.elevated,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${Math.min(score, 100)}%`,
              height: '100%',
              borderRadius: 3,
              background: C.accent,
              transition: 'width .3s ease',
            }}
          />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <TrendingUp size={14} style={{ color: C.muted }} aria-hidden="true" />
        <span style={{ fontSize: 12, color: C.muted }}>{kloelT('Sentimento:')}</span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: '2px 10px',
            borderRadius: 20,
            background: sentimentStyle.bg,
            color: sentimentStyle.text,
          }}
        >
          {sentiment}
        </span>
      </div>
    </>
  );
}
