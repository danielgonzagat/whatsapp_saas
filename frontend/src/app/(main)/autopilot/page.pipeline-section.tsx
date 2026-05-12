'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import {
  CenterStage,
  type MissionCardData,
  MissionCards,
  Section,
  StageHeadline,
} from '@/components/kloel';
import {
  Activity,
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  MessageSquare,
  Pause,
  Play,
  RefreshCw,
  Send,
  Sparkles,
  Stethoscope,
  TrendingUp,
  Users,
  Workflow,
  XCircle,
} from 'lucide-react';
import type {
  AutopilotPipeline,
  AutopilotStats,
  AutopilotStatus,
  AutopilotImpact,
  SystemHealth,
} from './page.ui';
import { StatCard, StatusPill, formatDateTime } from './page.ui';

interface PipelineSectionProps {
  status: AutopilotStatus | null;
  isToggling: boolean;
  onToggle: () => void;
  stats: AutopilotStats | null;
  impact: AutopilotImpact | null;
  pipeline: AutopilotPipeline | null;
  systemHealth: SystemHealth | null;
  missionCards: MissionCardData[];
  isLoading: boolean;
  onRefresh: () => void;
}

export function PipelineSection({
  status,
  isToggling,
  onToggle,
  stats,
  impact,
  pipeline,
  systemHealth,
  missionCards,
  isLoading,
  onRefresh,
}: PipelineSectionProps) {
  return (
    <>
      <Section spacing="lg">
        <CenterStage size="XL">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <p
                className="text-xs font-medium tracking-widest mb-2"
                style={{ color: colors.brand.cyan }}
              >
                {kloelT('VENDAS NO PILOTO AUTOMÁTICO')}
              </p>
              <StageHeadline
                headline={kloelT('Autopilot')}
                highlight={kloelT('Autopilot')}
                subheadline={kloelT('IA que responde, qualifica e converte leads 24/7')}
              />
            </div>

            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={onToggle}
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
                  className="absolute top-1 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg"
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
                style={{ color: status?.enabled ? colors.brand.green : colors.text.muted }}
              >
                {isToggling ? 'Alterando...' : status?.enabled ? 'ATIVO' : 'PAUSADO'}
              </span>
              {status?.billingSuspended && (
                <span
                  className="text-xs flex items-center gap-1"
                  style={{ color: colors.state.error }}
                >
                  <AlertCircle size={12} aria-hidden="true" />
                  {kloelT('Cobrança pendente')}
                </span>
              )}
            </div>
          </div>
        </CenterStage>
      </Section>

      <Section spacing="md">
        <CenterStage size="XL">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon={Activity}
              label={kloelT('Ações (7 dias)')}
              value={stats?.actionsLast7d || 0}
              color={colors.brand.green}
            />
            <StatCard
              icon={Users}
              label={kloelT('Contatos')}
              value={stats?.contactsTracked || 0}
              color={colors.brand.cyan}
            />
            <StatCard
              icon={TrendingUp}
              label={kloelT('Taxa de Resposta')}
              value={impact ? `${Math.round(impact.replyRate * 100)}%` : '—'}
              subValue={impact?.repliedContacts ? `${impact.repliedContacts} resp.` : undefined}
              color={colors.brand.green}
            />
            <StatCard
              icon={Sparkles}
              label={kloelT('Conversões')}
              value={stats?.conversionsLast7d || 0}
              subValue={
                stats?.conversionsAmountLast7d
                  ? `R$ ${stats.conversionsAmountLast7d.toLocaleString('pt-BR')}`
                  : undefined
              }
              color={colors.state.warning}
            />
          </div>
        </CenterStage>
      </Section>

      <Section spacing="md">
        <CenterStage size="XL">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div
              className="p-5 rounded-xl border"
              style={{ backgroundColor: colors.background.surface1, borderColor: colors.stroke }}
            >
              <div className="flex items-center justify-between gap-3 mb-5">
                <div className="flex items-center gap-3">
                  <Workflow size={20} style={{ color: colors.brand.green }} aria-hidden="true" />
                  <div>
                    <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
                      {kloelT('Pipeline em Tempo Real')}
                    </h2>
                    <p className="text-sm" style={{ color: colors.text.muted }}>
                      {kloelT('Meta Cloud API → DB → fila → worker → OpenAI')}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={isLoading}
                  className="p-2 rounded-lg transition-colors hover:bg-white/5"
                  style={{ color: colors.text.muted }}
                >
                  <RefreshCw size={16} aria-hidden="true" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <StatCard
                  icon={MessageSquare}
                  label={kloelT('Recebidas (24h)')}
                  value={pipeline?.messages?.received || 0}
                  color={colors.brand.cyan}
                />
                <StatCard
                  icon={Send}
                  label={kloelT('Respondidas (24h)')}
                  value={pipeline?.messages?.responded || 0}
                  color={colors.brand.green}
                />
                <StatCard
                  icon={AlertCircle}
                  label={kloelT('Pendentes')}
                  value={pipeline?.messages?.unansweredEstimate || 0}
                  color={colors.state.warning}
                />
                <StatCard
                  icon={XCircle}
                  label={kloelT('Falhas')}
                  value={pipeline?.autopilot?.failed || 0}
                  color={colors.state.error}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <StatusPill
                  label={kloelT('Autonomia')}
                  status={pipeline?.autonomy?.autopilotEnabled ? 'UP' : 'DOWN'}
                />
                <StatusPill
                  label={kloelT('WhatsApp')}
                  status={pipeline?.autonomy?.whatsappStatus}
                />
                <StatusPill
                  label={kloelT('Fila waiting')}
                  status={String(pipeline?.queue?.waiting ?? 0)}
                />
                <StatusPill
                  label={kloelT('Fila active')}
                  status={String(pipeline?.queue?.active ?? 0)}
                />
              </div>

              <div className="space-y-3 text-sm">
                <div
                  className="p-3 rounded-lg"
                  style={{ backgroundColor: colors.background.surface2 }}
                >
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span style={{ color: colors.text.secondary }}>{kloelT('Última inbound')}</span>
                    <span style={{ color: colors.text.muted }}>
                      {formatDateTime(pipeline?.messages?.lastInbound?.createdAt)}
                    </span>
                  </div>
                  <p style={{ color: colors.text.primary }}>
                    {pipeline?.messages?.lastInbound?.content ||
                      'Nenhuma mensagem inbound registrada'}
                  </p>
                </div>
                <div
                  className="p-3 rounded-lg"
                  style={{ backgroundColor: colors.background.surface2 }}
                >
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span style={{ color: colors.text.secondary }}>
                      {kloelT('Último evento do Autopilot')}
                    </span>
                    <span style={{ color: colors.text.muted }}>
                      {formatDateTime(pipeline?.autopilot?.lastEvent?.createdAt)}
                    </span>
                  </div>
                  <p style={{ color: colors.text.primary }}>
                    {pipeline?.autopilot?.lastEvent?.status || 'Sem eventos recentes'}
                    {pipeline?.autopilot?.lastEvent?.reason
                      ? ` — ${pipeline.autopilot.lastEvent.reason}`
                      : ''}
                  </p>
                </div>
              </div>
            </div>

            <div
              className="p-5 rounded-xl border"
              style={{ backgroundColor: colors.background.surface1, borderColor: colors.stroke }}
            >
              <div className="flex items-center gap-3 mb-5">
                <Stethoscope size={20} style={{ color: colors.brand.cyan }} aria-hidden="true" />
                <div>
                  <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
                    {kloelT('Saúde Real do Sistema')}
                  </h2>
                  <p className="text-sm" style={{ color: colors.text.muted }}>
                    {kloelT('Dependências obrigatórias para o Kloel não ficar silencioso.')}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <StatusPill label={kloelT('Sistema')} status={systemHealth?.status} />
                <StatusPill
                  label={kloelT('Banco')}
                  status={systemHealth?.details?.database?.status}
                />
                <StatusPill label={kloelT('Redis')} status={systemHealth?.details?.redis?.status} />
                <StatusPill
                  label={kloelT('Meta Cloud')}
                  status={systemHealth?.details?.whatsapp?.status}
                />
                <StatusPill
                  label={kloelT('Worker')}
                  status={systemHealth?.details?.worker?.status}
                />
                <StatusPill
                  label={kloelT('Config crítica')}
                  status={systemHealth?.details?.config?.status}
                />
                <StatusPill
                  label={kloelT('OpenAI')}
                  status={systemHealth?.details?.openai?.status}
                />
                <StatusPill
                  label={kloelT('Google Auth')}
                  status={systemHealth?.details?.googleAuth?.status}
                />
              </div>

              {Array.isArray(systemHealth?.details?.config?.missing) &&
                systemHealth.details.config.missing.length > 0 && (
                  <div
                    className="mt-4 p-3 rounded-lg text-sm"
                    style={{
                      backgroundColor: `${colors.state.error}14`,
                      border: `1px solid ${colors.state.error}2E`,
                      color: colors.state.error,
                    }}
                  >
                    {kloelT('Configurações ausentes:')}{' '}
                    {systemHealth.details.config.missing.join(', ')}
                  </div>
                )}
            </div>
          </div>
        </CenterStage>
      </Section>

      <Section spacing="sm">
        <CenterStage size="XL">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard
              icon={Clock}
              label={kloelT('Tempo Médio Resposta')}
              value={impact?.avgReplyMinutes ? `${impact.avgReplyMinutes}min` : '—'}
              color={colors.brand.cyan}
            />
            <StatCard
              icon={CheckCircle2}
              label={kloelT('Sucesso')}
              value={stats?.actionsByType?.REPLY || stats?.actionsByType?.SEND_MESSAGE || 0}
              color={colors.brand.green}
            />
            <StatCard
              icon={AlertCircle}
              label={kloelT('Erros')}
              value={stats?.errorsLast7d || 0}
              color={colors.state.error}
            />
            <StatCard
              icon={XCircle}
              label={kloelT('Ignorados')}
              value={stats?.skippedTotal || 0}
              subValue={stats?.skippedOptin ? `${stats.skippedOptin} opt-in` : undefined}
              color={colors.text.muted}
            />
            <StatCard
              icon={Calendar}
              label={kloelT('Agendados')}
              value={stats?.scheduledCount || 0}
              color={colors.state.warning}
            />
          </div>
        </CenterStage>
      </Section>

      <Section spacing="lg">
        <CenterStage size="XL">
          <h2 className="text-lg font-semibold mb-4" style={{ color: colors.text.primary }}>
            {kloelT('Recursos Ativos')}
          </h2>
          <MissionCards missions={missionCards} />
        </CenterStage>
      </Section>
    </>
  );
}
