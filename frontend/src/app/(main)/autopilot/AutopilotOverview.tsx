'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { CenterStage, Section, StageHeadline } from '@/components/kloel';
import type { MissionCardData } from '@/components/kloel';
import AutopilotPlanInspector from '@/components/kloel/autopilot/AutopilotPlanInspector';
import type {
  AutopilotStatsLike,
  AutopilotImpactLike,
  AutopilotPipelineLike,
  SystemHealthLike,
} from '@/components/kloel/autopilot/AutopilotPlanInspector';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Pause,
  Play,
  TrendingUp,
  XCircle,
} from 'lucide-react';

interface OverviewStatus {
  enabled: boolean;
  billingSuspended?: boolean;
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

interface AutopilotOverviewProps {
  status: OverviewStatus | null;
  stats: AutopilotStatsLike | null;
  impact: AutopilotImpactLike | null;
  pipeline: AutopilotPipelineLike | null;
  systemHealth: SystemHealthLike | null;
  missionCards: MissionCardData[];
  isLoading: boolean;
  error: string | null;
  isToggling: boolean;
  handleToggle: () => void;
  onDismissError: () => void;
  onRefresh: () => void;
  onNavigate: (href: string) => void;
}

export function AutopilotOverview({
  status,
  stats,
  impact,
  pipeline,
  systemHealth,
  missionCards,
  isLoading,
  error,
  isToggling,
  handleToggle,
  onDismissError,
  onRefresh,
  onNavigate: _onNavigate,
}: AutopilotOverviewProps) {
  return (
    <>
      {/* Header */}
      <Section spacing="lg">
        <CenterStage size="XL">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <p
                className="text-xs font-medium tracking-widest mb-2"
                style={{ color: colors.brand.cyan }}
              >
                {kloelT(`VENDAS NO PILOTO AUTOMÁTICO`)}
              </p>
              <StageHeadline
                headline={kloelT(`Autopilot`)}
                highlight={kloelT(`Autopilot`)}
                subheadline={kloelT(`IA que responde, qualifica e converte leads 24/7`)}
              />
            </div>

            {/* Toggle Button */}
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={handleToggle}
                disabled={isToggling || status?.billingSuspended}
                className={`
                  relative w-32 h-16 rounded-full transition-all duration-300
                  ${isToggling ? 'opacity-50 cursor-wait' : 'cursor-pointer hover:scale-105'}
                  ${status?.billingSuspended ? 'opacity-50 cursor-not-allowed' : ''}
                `}
                style={{
                  backgroundColor: status?.enabled
                    ? colors.brand.green
                    : colors.background.surface2,
                  border: `2px solid ${status?.enabled ? colors.brand.green : colors.stroke}`,
                }}
              >
                <div
                  className={`
                    absolute top-1 w-12 h-12 rounded-full flex items-center justify-center
                    transition-all duration-300 shadow-lg
                  `}
                  style={{
                    backgroundColor: colors.background.surface1,
                    left: status?.enabled ? 'calc(100% - 52px)' : '4px',
                  }}
                >
                  {status?.enabled ? (
                    <Play size={20} style={{ color: colors.brand.green }} aria-hidden="true" />
                  ) : (
                    <Pause size={20} style={{ color: colors.text.muted }} aria-hidden="true" />
                  )}
                </div>
              </button>
              <span
                className="text-sm font-medium"
                style={{
                  color: status?.enabled ? colors.brand.green : colors.text.muted,
                }}
              >
                {isToggling ? 'Alterando...' : status?.enabled ? 'ATIVO' : 'PAUSADO'}
              </span>
              {status?.billingSuspended && (
                <span
                  className="text-xs flex items-center gap-1"
                  style={{
                    color:
                      colors.semantic.error,
                  }}
                >
                  <AlertCircle size={12} aria-hidden="true" />

                  {kloelT(`Cobrança pendente`)}
                </span>
              )}
            </div>
          </div>
        </CenterStage>
      </Section>

      {/* Error Alert */}
      {error && (
        <Section spacing="sm">
          <CenterStage size="XL">
            <div
              className="p-4 rounded-lg flex items-center gap-3"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
              }}
            >
              <AlertCircle
                size={20}
                style={{
                  color:
                    colors.semantic.error,
                }}
                aria-hidden="true"
              />
              <span
                style={{
                  color:
                    colors.semantic.error,
                }}
              >
                {error}
              </span>
              <button
                type="button"
                onClick={onDismissError}
                className="ml-auto text-sm underline"
                style={{ color: colors.text.muted }}
              >
                {kloelT(`Fechar`)}
              </button>
            </div>
          </CenterStage>
        </Section>
      )}

      <Section spacing="md">
        <CenterStage size="XL">
          <AutopilotPlanInspector
            stats={stats}
            impact={impact}
            pipeline={pipeline}
            systemHealth={systemHealth}
            missionCards={missionCards}
            isLoading={isLoading}
            onRefresh={onRefresh}
          />
        </CenterStage>
      </Section>

      {/* Secondary Stats */}
      <Section spacing="sm">
        <CenterStage size="XL">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard
              icon={Clock}
              label={kloelT(`Tempo Médio Resposta`)}
              value={impact?.avgReplyMinutes ? `${impact.avgReplyMinutes}min` : '—'}
              color={colors.brand.cyan}
            />
            <StatCard
              icon={CheckCircle2}
              label={kloelT(`Sucesso`)}
              value={
                (stats?.actionsByType && (stats.actionsByType.REPLY || stats.actionsByType.SEND_MESSAGE)) || 0
              }
              color={colors.brand.green}
            />
            <StatCard
              icon={AlertCircle}
              label={kloelT(`Erros`)}
              value={stats?.errorsLast7d || 0}
              color="var(--app-error)"
            />
            <StatCard
              icon={XCircle}
              label={kloelT(`Ignorados`)}
              value={stats?.skippedTotal || 0}
              color={colors.text.muted}
            />
            <StatCard
              icon={Calendar}
              label={kloelT(`Agendados`)}
              value={stats?.scheduledCount || 0}
              color="var(--app-warning)"
            />
          </div>
        </CenterStage>
      </Section>
    </>
  );
}
