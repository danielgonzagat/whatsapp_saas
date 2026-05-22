'use client';

import { kloelT } from '@/lib/i18n/t';
import { Surface } from '@/components/kloel';
import { colors } from '@/lib/design-tokens';
import { formatPhaseLabel } from '../utils';

type ActivityEvent = {
  type: string;
  message: string;
  phase?: string | null;
  ts?: string;
  meta?: Record<string, unknown>;
};

interface CiaActivityFeedProps {
  events: ActivityEvent[];
}

export function CiaActivityFeed({ events }: CiaActivityFeedProps) {
  return (
    <Surface className="p-5">
      <p
        className="text-sm uppercase tracking-[0.18em] mb-4"
        style={{ color: colors.text.muted }}
      >
        {kloelT('Atividade Recente')}
      </p>
      <div className="space-y-3">
        {events
          .slice()
          .reverse()
          .map((event, index) => (
            <div
              key={`${event.ts || index}-${event.message}`}
              className="rounded-xl p-3"
              style={{
                backgroundColor: colors.background.surface1,
                border: `1px solid ${colors.stroke}`,
              }}
            >
              <p className="text-sm" style={{ color: colors.text.primary }}>
                {event.message}
              </p>
              <p className="text-xs mt-1" style={{ color: colors.text.muted }}>
                {formatPhaseLabel(event.phase) || 'Atividade'}
              </p>
            </div>
          ))}
      </div>
    </Surface>
  );
}
