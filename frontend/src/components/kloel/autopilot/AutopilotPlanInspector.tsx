'use client';

import { kloelT } from '@/lib/i18n/t';
import type { MissionCardData } from '@/components/kloel';
import { MissionCards } from '@/components/kloel';
import { colors } from '@/lib/design-tokens';
import {
  Activity,
  AlertCircle,
  MessageSquare,
  RotateCw,
  Send,
  Sparkles,
  Stethoscope,
  TrendingUp,
  Users,
  Workflow,
  XCircle,
} from 'lucide-react';

export interface AutopilotStatsLike {
  workspaceId: string;
  enabled: boolean;
  billingSuspended?: boolean;
  contactsTracked: number;
  actionsLast7d: number;
  actionsByType: Record<string, number>;
  lastActionAt: string | null;
  errorsLast7d: number;
  lastErrorAt: string | null;
  errorReasons: Record<string, number>;
  scheduledCount: number;
  nextRetryAt: string | null;
  conversionsLast7d: number;
  lastConversionAt: string | null;
  conversionsAmountLast7d: number;
  skippedTotal: number;
  skippedOptin: number;
  skipped24h: number;
  timeline: Record<string, number>;
}

export interface AutopilotImpactLike {
  workspaceId: string;
  actionsAnalyzed: number;
  repliedContacts: number;
  totalReplies: number;
  replyRate: number;
  conversions: number;
  conversionRate: number;
  avgReplyMinutes: number | null;
  samples: Array<{
    contactId: string;
    contact: string;
    replyAt: string;
    delayMinutes: number;
  }>;
}

export interface AutopilotPipelineLike {
  workspaceId: string;
  workspaceName?: string | null;
  windowHours?: number;
  autonomy?: {
    autopilotEnabled?: boolean;
    whatsappStatus?: string;
    connected?: boolean;
  };
  messages?: {
    received?: number;
    responded?: number;
    unansweredEstimate?: number;
    lastInbound?: { content?: string; createdAt?: string } | null;
    lastOutbound?: { content?: string; createdAt?: string } | null;
  };
  autopilot?: {
    executed?: number;
    skipped?: number;
    failed?: number;
    lastEvent?: { status?: string; reason?: string | null; createdAt?: string } | null;
    recentFailures?: Array<{ status?: string; reason?: string | null; createdAt?: string }>;
  };
  queue?: { waiting?: number; active?: number; delayed?: number; failed?: number };
}

export interface SystemHealthLike {
  status: string;
  details?: Record<string, { status?: string; error?: string; missing?: string[] }>;
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

function statusTone(status?: string) {
  const normalized = String(status || '').toUpperCase();
  if (['UP', 'CONFIGURED', 'COMPLETED'].includes(normalized)) {
    return { color: colors.brand.green, bg: `${colors.brand.green}20` };
  }
  if (['DEGRADED', 'PARTIAL', 'QUEUED', 'PROCESSING'].includes(normalized)) {
    return { color: colors.semantic.warning, bg: 'rgba(245, 158, 11, 0.15)' };
  }
  if (['DOWN', 'FAILED', 'ERROR', 'SKIPPED', 'DISABLED', 'BILLING_SUSPENDED', 'MISSING'].includes(normalized)) {
    return { color: colors.semantic.error, bg: 'rgba(239, 68, 68, 0.12)' };
  }
  return { color: colors.brand.cyan, bg: `${colors.brand.cyan}18` };
}

function StatusPill({ label, status }: { label: string; status?: string | undefined }) {
  const tone = statusTone(status);
  return (
    <div
      className="px-3 py-2 rounded-lg border text-sm flex items-center justify-between gap-3"
      style={{
        backgroundColor: colors.background.surface2,
        borderColor: colors.stroke,
      }}
    >
      <span style={{ color: colors.text.secondary }}>{label}</span>
      <span
        className="px-2 py-1 rounded-md text-xs font-semibold uppercase tracking-wide"
        style={{ color: tone.color, backgroundColor: tone.bg }}
      >
        {status || 'unknown'}
      </span>
    </div>
  );
}

export default function AutopilotPlanInspector({
  stats,
  impact,
  pipeline,
  systemHealth,
  missionCards,
  isLoading,
  onRefresh,
}: {
  stats: AutopilotStatsLike | null;
  impact: AutopilotImpactLike | null;
  pipeline: AutopilotPipelineLike | null;
  systemHealth: SystemHealthLike | null;
  missionCards: MissionCardData[];
  isLoading: boolean;
  onRefresh: () => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={Activity}
          label={kloelT(`Ações (7 dias)`)}
          value={stats?.actionsLast7d || 0}
          color={colors.brand.green}
        />
        <StatCard
          icon={Users}
          label={kloelT(`Contatos`)}
          value={stats?.contactsTracked || 0}
          color={colors.brand.cyan}
        />
        <StatCard
          icon={TrendingUp}
          label={kloelT(`Taxa de Resposta`)}
          value={impact ? `${Math.round(impact.replyRate * 100)}%` : '—'}
          color={colors.brand.green}
        />
        <StatCard
          icon={Sparkles}
          label={kloelT(`Conversões`)}
          value={stats?.conversionsLast7d || 0}
          color={colors.semantic.warning}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-0">
        <div
          className="p-5 rounded-xl border"
          style={{ backgroundColor: colors.background.surface1, borderColor: colors.stroke }}
        >
          <div className="flex items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-3">
              <Workflow size={20} style={{ color: colors.brand.green }} aria-hidden="true" />
              <div>
                <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
                  {kloelT(`Pipeline em Tempo Real`)}
                </h2>
                <p className="text-sm" style={{ color: colors.text.muted }}>
                  {kloelT(`Meta Cloud API → DB → fila → worker → OpenAI`)}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              aria-label="Atualizar dados"
              className="p-2 rounded-lg transition-colors hover:bg-white/5"
              style={{ color: colors.text.muted }}
            >
              <RotateCw size={16} className={isLoading ? 'animate-pulse' : ''} aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <StatCard icon={MessageSquare} label={kloelT(`Recebidas (24h)`)} value={pipeline?.messages?.received || 0} color={colors.brand.cyan} />
            <StatCard icon={Send} label={kloelT(`Respondidas (24h)`)} value={pipeline?.messages?.responded || 0} color={colors.brand.green} />
            <StatCard icon={AlertCircle} label={kloelT(`Pendentes`)} value={pipeline?.messages?.unansweredEstimate || 0} color={colors.semantic.warning} />
            <StatCard icon={XCircle} label={kloelT(`Falhas`)} value={pipeline?.autopilot?.failed || 0} color={colors.semantic.error} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <StatusPill label={kloelT(`Autonomia`)} status={pipeline?.autonomy?.autopilotEnabled ? 'UP' : 'DOWN'} />
            <StatusPill label={kloelT(`WhatsApp`)} status={pipeline?.autonomy?.whatsappStatus} />
            <StatusPill label={kloelT(`Fila waiting`)} status={String(pipeline?.queue?.waiting ?? 0)} />
            <StatusPill label={kloelT(`Fila active`)} status={String(pipeline?.queue?.active ?? 0)} />
          </div>

          <div className="space-y-3 text-sm">
            <div className="p-3 rounded-lg" style={{ backgroundColor: colors.background.surface2 }}>
              <div className="flex items-center justify-between gap-3 mb-1">
                <span style={{ color: colors.text.secondary }}>{kloelT(`Última inbound`)}</span>
                <span style={{ color: colors.text.muted }}>
                  {formatDateTime(pipeline?.messages?.lastInbound?.createdAt)}
                </span>
              </div>
              <p style={{ color: colors.text.primary }}>
                {pipeline?.messages?.lastInbound?.content || 'Nenhuma mensagem inbound registrada'}
              </p>
            </div>
            <div className="p-3 rounded-lg" style={{ backgroundColor: colors.background.surface2 }}>
              <div className="flex items-center justify-between gap-3 mb-1">
                <span style={{ color: colors.text.secondary }}>{kloelT(`Último evento do Autopilot`)}</span>
                <span style={{ color: colors.text.muted }}>
                  {formatDateTime(pipeline?.autopilot?.lastEvent?.createdAt)}
                </span>
              </div>
              <p style={{ color: colors.text.primary }}>
                {pipeline?.autopilot?.lastEvent?.status || 'Sem eventos recentes'}
                {pipeline?.autopilot?.lastEvent?.reason ? ` — ${pipeline.autopilot.lastEvent.reason}` : ''}
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
                {kloelT(`Saúde Real do Sistema`)}
              </h2>
              <p className="text-sm" style={{ color: colors.text.muted }}>
                {kloelT(`Dependências obrigatórias para o Kloel não ficar silencioso.`)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <StatusPill label={kloelT(`Sistema`)} status={systemHealth?.status} />
            <StatusPill label={kloelT(`Banco`)} status={systemHealth?.details?.database?.status} />
            <StatusPill label={kloelT(`Redis`)} status={systemHealth?.details?.redis?.status} />
            <StatusPill label={kloelT(`Meta Cloud`)} status={systemHealth?.details?.whatsapp?.status} />
            <StatusPill label={kloelT(`Worker`)} status={systemHealth?.details?.worker?.status} />
            <StatusPill label={kloelT(`Config crítica`)} status={systemHealth?.details?.config?.status} />
            <StatusPill label={kloelT(`OpenAI`)} status={systemHealth?.details?.openai?.status} />
            <StatusPill label={kloelT(`Google Auth`)} status={systemHealth?.details?.googleAuth?.status} />
          </div>

          {Array.isArray(systemHealth?.details?.config?.missing) &&
            systemHealth.details.config.missing.length > 0 && (
              <div
                className="mt-4 p-3 rounded-lg text-sm"
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.18)',
                  color: colors.semantic.errorText,
                }}
              >
                {kloelT(`Configurações ausentes:`)} {systemHealth.details.config.missing.join(', ')}
              </div>
            )}
        </div>
      </div>

      <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
        {kloelT(`Recursos Ativos`)}
      </h2>
      <MissionCards missions={missionCards} />
    </>
  );
}
