'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { CenterStage, Section } from '@/components/kloel';
import { DollarSign, Layers } from 'lucide-react';

interface PlanRevenueEvent {
  id?: string;
  type?: string;
  amount?: number;
  contactId?: string;
  contact?: string;
  phone?: string;
  reason?: string;
  createdAt: string;
  [key: string]: unknown;
}

function formatCurrency(value?: number) {
  if (value == null) {
    return 'R$ 0';
  }
  return (
    'R$ ' + value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return '—';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }
  return parsed.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface AutopilotPlanListProps {
  revenueEvents: PlanRevenueEvent[];
}

export function AutopilotPlanList({ revenueEvents }: AutopilotPlanListProps) {
  return (
    <Section spacing="lg">
      <CenterStage size="XL">
        <div
          className="p-5 rounded-xl border"
          style={{
            backgroundColor: colors.background.surface1,
            borderColor: colors.stroke,
          }}
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 rounded-lg" style={{ backgroundColor: `${colors.brand.cyan}20` }}>
              <Layers size={20} style={{ color: colors.brand.cyan }} aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
                {kloelT(`Eventos de Receita`)}
              </h2>
              <p className="text-sm" style={{ color: colors.text.muted }}>
                {kloelT(`Vendas e conversões atribuídas ao Autopilot`)}
              </p>
            </div>
          </div>

          {revenueEvents.length > 0 ? (
            <div className="space-y-2">
              {revenueEvents.map((event, idx) => {
                const eventColor =
                  event.type === 'sale'
                    ? colors.brand.green
                    : event.type === 'conversion'
                      ? colors.semantic.warning
                      : colors.brand.cyan;
                return (
                  <div
                    key={event.id || idx}
                    className="flex items-center gap-4 p-4 rounded-lg border transition-all hover:bg-white/5"
                    style={{
                      backgroundColor: colors.background.surface2,
                      borderColor: colors.stroke,
                    }}
                  >
                    <div
                      className="p-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: `${eventColor}20` }}
                    >
                      <DollarSign size={16} style={{ color: eventColor }} aria-hidden="true" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="font-medium truncate"
                          style={{ color: colors.text.primary }}
                        >
                          {event.contact ||
                            event.phone ||
                            event.contactId?.slice(0, 8) ||
                            'Contato'}
                        </span>
                        {event.type && (
                          <span
                            className="px-2 py-0.5 rounded text-xs font-medium"
                            style={{
                              backgroundColor: `${eventColor}20`,
                              color: eventColor,
                            }}
                          >
                            {event.type}
                          </span>
                        )}
                      </div>
                      {event.reason && (
                        <div className="text-sm truncate" style={{ color: colors.text.muted }}>
                          {event.reason}
                        </div>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div
                        className="font-semibold"
                        style={{
                          color: colors.text.primary,
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      >
                        {event.amount != null ? formatCurrency(event.amount) : '---'}
                      </div>
                      <div className="text-xs" style={{ color: colors.text.muted }}>
                        {formatDateTime(event.createdAt)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div
              className="p-6 rounded-lg text-center"
              style={{ backgroundColor: colors.background.surface2 }}
            >
              <Layers
                size={32}
                className="mx-auto mb-2"
                style={{ color: colors.text.muted }}
                aria-hidden="true"
              />
              <p className="text-sm" style={{ color: colors.text.muted }}>
                {kloelT(`Nenhum evento de receita registrado`)}
              </p>
            </div>
          )}
        </div>
      </CenterStage>
    </Section>
  );
}
