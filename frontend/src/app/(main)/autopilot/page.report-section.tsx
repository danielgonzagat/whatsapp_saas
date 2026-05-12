'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { CenterStage, Section } from '@/components/kloel';
import { Activity, BarChart3, DollarSign, Layers, Sparkles, TrendingUp } from 'lucide-react';
import type { MoneyReport, RevenueEvent } from './page.ui';
import { StatCard, formatCurrency, formatDateTime } from './page.ui';

interface MoneyReportSectionProps {
  moneyReport: MoneyReport | null;
}

export function MoneyReportSection({ moneyReport }: MoneyReportSectionProps) {
  return (
    <Section spacing="lg">
      <CenterStage size="XL">
        <div
          className="p-5 rounded-xl border"
          style={{ backgroundColor: colors.background.surface1, borderColor: colors.stroke }}
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 rounded-lg" style={{ backgroundColor: `${colors.brand.green}20` }}>
              <DollarSign size={20} style={{ color: colors.brand.green }} aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
                {kloelT('Relatório Financeiro')}
              </h2>
              <p className="text-sm" style={{ color: colors.text.muted }}>
                {kloelT('Receita, custos e ROI gerados pelo Autopilot')}
              </p>
            </div>
          </div>

          {moneyReport ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                icon={TrendingUp}
                label={kloelT('Receita Total')}
                value={formatCurrency(moneyReport.totalRevenue)}
                color={colors.brand.green}
              />
              <StatCard
                icon={Activity}
                label={kloelT('Custos')}
                value={formatCurrency(moneyReport.totalCosts)}
                color={colors.state.error}
              />
              <StatCard
                icon={BarChart3}
                label="ROI"
                value={moneyReport.roi != null ? `${Math.round(moneyReport.roi * 100)}%` : '---'}
                color={colors.brand.cyan}
                trend={
                  moneyReport.roi != null && moneyReport.roi > 0
                    ? 'up'
                    : moneyReport.roi != null && moneyReport.roi < 0
                      ? 'down'
                      : 'neutral'
                }
              />
              <StatCard
                icon={Sparkles}
                label={kloelT('Ticket Médio')}
                value={formatCurrency(moneyReport.avgTicket)}
                color={colors.state.warning}
              />
            </div>
          ) : (
            <div
              className="p-6 rounded-lg text-center"
              style={{ backgroundColor: colors.background.surface2 }}
            >
              <DollarSign
                size={32}
                className="mx-auto mb-2"
                style={{ color: colors.text.muted }}
                aria-hidden="true"
              />
              <p className="text-sm" style={{ color: colors.text.muted }}>
                {kloelT('Nenhum dado financeiro disponível')}
              </p>
            </div>
          )}
        </div>
      </CenterStage>
    </Section>
  );
}

interface RevenueEventsSectionProps {
  revenueEvents: RevenueEvent[];
}

export function RevenueEventsSection({ revenueEvents }: RevenueEventsSectionProps) {
  return (
    <Section spacing="lg">
      <CenterStage size="XL">
        <div
          className="p-5 rounded-xl border"
          style={{ backgroundColor: colors.background.surface1, borderColor: colors.stroke }}
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 rounded-lg" style={{ backgroundColor: `${colors.brand.cyan}20` }}>
              <Layers size={20} style={{ color: colors.brand.cyan }} aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
                {kloelT('Eventos de Receita')}
              </h2>
              <p className="text-sm" style={{ color: colors.text.muted }}>
                {kloelT('Vendas e conversões atribuídas ao Autopilot')}
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
                      ? colors.state.warning
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
                            style={{ backgroundColor: `${eventColor}20`, color: eventColor }}
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
                {kloelT('Nenhum evento de receita registrado')}
              </p>
            </div>
          )}
        </div>
      </CenterStage>
    </Section>
  );
}
