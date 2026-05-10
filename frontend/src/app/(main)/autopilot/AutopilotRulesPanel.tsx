'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { CenterStage, Section } from '@/components/kloel';
import AutopilotDecisionLog from '@/components/kloel/autopilot/AutopilotDecisionLog';
import type {
  AutopilotActionLike,
  AutopilotImpactLike,
} from '@/components/kloel/autopilot/AutopilotDecisionLog';
import {
  Activity,
  BarChart3,
  DollarSign,
  Sparkles,
  TrendingUp,
} from 'lucide-react';

interface MoneyReportLike {
  totalRevenue?: number;
  totalCosts?: number;
  roi?: number;
  period?: string;
  conversions?: number;
  avgTicket?: number;
  revenueByDay?: Record<string, number>;
}

function formatCurrency(value?: number) {
  if (value == null) {
    return 'R$ 0';
  }
  return (
    'R$ ' + value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  trend,
  color = colors.brand.green,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
  color?: string;
}) {
  return (
    <div
      className="p-5 rounded-xl border transition-all hover:scale-[1.02]"
      style={{
        backgroundColor: colors.background.surface1,
        borderColor: colors.stroke,
      }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 rounded-lg" style={{ backgroundColor: `${color}20` }}>
          <Icon size={20} style={{ color }} />
        </div>
        <span className="text-sm font-medium" style={{ color: colors.text.secondary }}>
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold" style={{ color: colors.text.primary }}>
          {value}
        </span>
        {subValue && (
          <span className="text-sm" style={{ color: colors.text.muted }}>
            {subValue}
          </span>
        )}
        {trend && (
          <TrendingUp
            size={16}
            className={
              trend === 'up'
                ? 'text-green-500'
                : trend === 'down'
                  ? 'text-red-500'
                  : 'text-gray-500'
            }
            style={{ transform: trend === 'down' ? 'rotate(180deg)' : undefined }}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );
}

interface AutopilotRulesPanelProps {
  actions: AutopilotActionLike[];
  impact: AutopilotImpactLike | null;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  isLoading: boolean;
  isEnabled: boolean;
  moneyReport: MoneyReportLike | null;
  onRefresh: () => void;
  onExport: () => void;
}

export function AutopilotRulesPanel({
  actions,
  impact,
  statusFilter,
  setStatusFilter,
  isLoading,
  isEnabled,
  moneyReport,
  onRefresh,
  onExport,
}: AutopilotRulesPanelProps) {
  return (
    <>
      {/* Decision Log */}
      <Section spacing="lg">
        <CenterStage size="XL">
          <AutopilotDecisionLog
            actions={actions}
            impact={impact}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            onRefresh={() => { onRefresh(); }}
            onExport={() => { onExport(); }}
            isLoading={isLoading}
            isEnabled={isEnabled}
          />
        </CenterStage>
      </Section>

      {/* Money Report */}
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
              <div
                className="p-2 rounded-lg"
                style={{ backgroundColor: `${colors.brand.green}20` }}
              >
                <DollarSign size={20} style={{ color: colors.brand.green }} aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
                  {kloelT(`Relatório Financeiro`)}
                </h2>
                <p className="text-sm" style={{ color: colors.text.muted }}>
                  {kloelT(`Receita, custos e ROI gerados pelo Autopilot`)}
                </p>
              </div>
            </div>

            {moneyReport ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  icon={TrendingUp}
                  label={kloelT(`Receita Total`)}
                  value={formatCurrency(moneyReport.totalRevenue)}
                  color={colors.brand.green}
                />
                <StatCard
                  icon={Activity}
                  label={kloelT(`Custos`)}
                  value={formatCurrency(moneyReport.totalCosts)}
                  color="var(--app-error)"
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
                  label={kloelT(`Ticket Médio`)}
                  value={formatCurrency(moneyReport.avgTicket)}
                  color="var(--app-warning)"
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
                  {kloelT(`Nenhum dado financeiro disponível`)}
                </p>
              </div>
            )}
          </div>
        </CenterStage>
      </Section>
    </>
  );
}
