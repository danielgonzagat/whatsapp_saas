'use client';

import { kloelT } from '@/lib/i18n/t';
import { Surface } from '@/components/kloel';
import { colors } from '@/lib/design-tokens';
import type { CiaInsight } from '@/lib/api/cia';

interface CiaInsightsProps {
  insights: CiaInsight[];
}

export function CiaInsights({ insights }: CiaInsightsProps) {
  if (!insights || insights.length === 0) {
    return null;
  }

  return (
    <Surface className="p-5">
      <p
        className="text-sm uppercase tracking-[0.18em] mb-4"
        style={{ color: colors.text.muted }}
      >
        {kloelT('Insights do Runtime')}
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {insights.map((insight, index) => (
          <div
            key={insight.id || index}
            className="rounded-xl p-4"
            style={{
              backgroundColor: colors.background.surface1,
              border: `1px solid ${colors.stroke}`,
            }}
          >
            <p className="text-sm font-semibold" style={{ color: colors.text.primary }}>
              {insight.title || insight.type}
            </p>
            <p className="text-sm mt-1" style={{ color: colors.text.secondary }}>
              {insight.description || 'Insight operacional disponivel.'}
            </p>
          </div>
        ))}
      </div>
    </Surface>
  );
}
