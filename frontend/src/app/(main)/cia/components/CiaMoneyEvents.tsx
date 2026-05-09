'use client';

import { kloelT } from '@/lib/i18n/t';
import { Surface } from '@/components/kloel';
import { colors } from '@/lib/design-tokens';
import { Zap } from 'lucide-react';

type MoneyEvent = {
  type: string;
  message: string;
  ts?: string;
};

interface CiaMoneyEventsProps {
  events: MoneyEvent[];
}

export function CiaMoneyEvents({ events }: CiaMoneyEventsProps) {
  if (events.length === 0) {
    return null;
  }

  return (
    <Surface className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Zap size={16} style={{ color: colors.brand.green }} aria-hidden="true" />
        <p className="text-sm font-medium" style={{ color: colors.text.secondary }}>
          {kloelT('Dinheiro em tempo real')}
        </p>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {events
          .slice(-6)
          .reverse()
          .map((event, index) => (
            <div
              key={`${event.ts || index}-${event.message}`}
              className="rounded-xl px-4 py-3"
              style={{
                backgroundColor: `${colors.brand.green}10`,
                border: `1px solid ${colors.stroke}`,
              }}
            >
              <p className="text-sm font-medium" style={{ color: colors.brand.green }}>
                {event.type === 'sale' ? 'Venda' : 'Pagamento'}
              </p>
              <p className="text-sm mt-1" style={{ color: colors.text.primary }}>
                {event.message}
              </p>
            </div>
          ))}
      </div>
    </Surface>
  );
}
