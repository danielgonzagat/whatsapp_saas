'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  Bot,
  Power,
  Activity,
  TrendingUp,
  Users,
  MessageSquare,
  Zap,
  RefreshCw,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  BarChart3,
  Settings2,
  Play,
  Pause,
  ArrowUpRight,
  Sparkles,
  Calendar,
  Filter,
} from 'lucide-react';
import {
  CenterStage,
  Section,
  StageHeadline,
  MissionCards,
  Button,
  type MissionCardData,
} from '@/components/kloel';
import { colors } from '@/lib/design-tokens';
import { useWorkspaceId } from '@/hooks/useWorkspaceId';

interface AutopilotStatus {
  workspaceId: string;
  enabled: boolean;
  billingSuspended?: boolean;
}

interface AutopilotStats {
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

interface AutopilotImpact {
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

interface AutopilotAction {
  id: string;
  createdAt: string;
  contactId: string;
  contact?: string;
  intent: string;
  action: string;
  status: string;
  reason?: string;
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
        <div
          className="p-2 rounded-lg"
          style={{ backgroundColor: `${color}20` }}
        >
          <Icon size={20} style={{ color }} />
        </div>
        <span
          className="text-sm font-medium"
          style={{ color: colors.text.secondary }}
        >
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className="text-2xl font-bold"
          style={{ color: colors.text.primary }}
        >
          {value}
        </span>
        {subValue && (
          <span
            className="text-sm"
            style={{ color: colors.text.muted }}
          >
            {subValue}
          </span>
        )}
        {trend && (
          <TrendingUp
            size={16}
            className={trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-gray-500'}
            style={{ transform: trend === 'down' ? 'rotate(180deg)' : undefined }}
          />
        )}
      </div>
    </div>
  );
}

function ActionRow({ action }: { action: AutopilotAction }) {
  const statusColors: Record<string, string> = {
    success: colors.brand.green,
    error: '#EF4444',
    skipped: colors.brand.cyan,
    scheduled: '#F59E0B',
  };

  const statusIcons: Record<string, React.ElementType> = {
    success: CheckCircle2,
    error: XCircle,
    skipped: Clock,
    scheduled: Calendar,
  };

  const StatusIcon = statusIcons[action.status] || Activity;
  const statusColor = statusColors[action.status] || colors.text.muted;

  return (
    <div
      className="flex items-center gap-4 p-4 rounded-lg border transition-all hover:bg-white/5"
      style={{
        backgroundColor: colors.background.surface2,
        borderColor: colors.stroke,
      }}
    >
      <div
        className="p-2 rounded-full"
        style={{ backgroundColor: `${statusColor}20` }}
      >
        <StatusIcon size={16} style={{ color: statusColor }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="font-medium truncate"
            style={{ color: colors.text.primary }}
          >
            {action.contact || action.contactId?.slice(0, 8)}
          </span>
          <span
            className="px-2 py-0.5 rounded text-xs font-medium"
            style={{
              backgroundColor: `${colors.brand.cyan}20`,
              color: colors.brand.cyan,
            }}
          >
            {action.intent}
          </span>
        </div>
        <div
          className="text-sm truncate"
          style={{ color: colors.text.muted }}
        >
          {action.action}
          {action.reason && ` — ${action.reason}`}
        </div>
      </div>
      <div
        className="text-xs whitespace-nowrap"
        style={{ color: colors.text.muted }}
      >
        {new Date(action.createdAt).toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </div>
    </div>
  );
}

export default function AutopilotPage() {
  const { data: session } = useSession();
  const workspaceId = useWorkspaceId();
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [status, setStatus] = useState<AutopilotStatus | null>(null);
  const [stats, setStats] = useState<AutopilotStats | null>(null);
  const [impact, setImpact] = useState<AutopilotImpact | null>(null);
  const [actions, setActions] = useState<AutopilotAction[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);

  const token = (session as any)?.accessToken;

  const fetchAutopilotData = useCallback(async () => {
    if (!workspaceId || !token) return;

    try {
      setIsLoading(true);
      setError(null);

      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };

      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

      const [statusRes, statsRes, impactRes, actionsRes] = await Promise.all([
        fetch(`${baseUrl}/autopilot/status?workspaceId=${workspaceId}`, { headers }),
        fetch(`${baseUrl}/autopilot/stats?workspaceId=${workspaceId}`, { headers }),
        fetch(`${baseUrl}/autopilot/impact?workspaceId=${workspaceId}`, { headers }),
        fetch(`${baseUrl}/autopilot/actions?workspaceId=${workspaceId}&limit=50`, { headers }),
      ]);

      if (statusRes.ok) {
        setStatus(await statusRes.json());
      }
      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
      if (impactRes.ok) {
        setImpact(await impactRes.json());
      }
      if (actionsRes.ok) {
        setActions(await actionsRes.json());
      }
    } catch (err) {
      console.error('Error fetching autopilot data:', err);
      setError('Erro ao carregar dados do Autopilot');
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, token]);

  useEffect(() => {
    fetchAutopilotData();
    // Refresh every 30 seconds
    const interval = setInterval(fetchAutopilotData, 30000);
    return () => clearInterval(interval);
  }, [fetchAutopilotData]);

  const handleToggle = async () => {
    if (!workspaceId || !token || !status) return;

    try {
      setIsToggling(true);
      setError(null);

      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const res = await fetch(`${baseUrl}/autopilot/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          workspaceId,
          enabled: !status.enabled,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Erro ao alterar status');
      }

      const data = await res.json();
      setStatus((prev) => prev ? { ...prev, enabled: data.enabled } : null);
      
      // Refresh stats
      await fetchAutopilotData();
    } catch (err: any) {
      console.error('Error toggling autopilot:', err);
      setError(err.message || 'Erro ao alterar status do Autopilot');
    } finally {
      setIsToggling(false);
    }
  };

  const filteredActions = actions.filter((a) =>
    statusFilter === 'all' ? true : a.status === statusFilter
  );

  const missionCards: MissionCardData[] = [
    {
      id: 'auto-responses',
      title: 'Respostas Automáticas',
      description: 'IA responde leads em segundos',
      icon: MessageSquare,
      status: status?.enabled ? 'completed' : 'pending',
      action: () => window.location.href = '/whatsapp',
    },
    {
      id: 'lead-qualification',
      title: 'Qualificação de Leads',
      description: 'Identifica intenção de compra',
      icon: Users,
      status: stats?.actionsLast7d ? 'completed' : 'pending',
      action: () => window.location.href = '/crm',
    },
    {
      id: 'sales-flows',
      title: 'Fluxos de Vendas',
      description: 'Direciona para conversão',
      icon: Zap,
      status: 'completed',
      action: () => window.location.href = '/flow',
    },
    {
      id: 'analytics',
      title: 'Analytics',
      description: 'Métricas em tempo real',
      icon: BarChart3,
      status: 'completed',
      action: () => window.location.href = '/analytics',
    },
  ];

  if (isLoading && !stats) {
    return (
      <div
        className="min-h-full flex items-center justify-center"
        style={{ backgroundColor: colors.background.obsidian }}
      >
        <div className="flex flex-col items-center gap-4">
          <RefreshCw
            size={32}
            className="animate-spin"
            style={{ color: colors.brand.green }}
          />
          <span style={{ color: colors.text.muted }}>
            Carregando Autopilot...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-full pb-20"
      style={{ backgroundColor: colors.background.obsidian }}
    >
      {/* Header */}
      <Section spacing="lg">
        <CenterStage size="XL">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <p className="text-xs font-medium tracking-widest mb-2" style={{ color: colors.brand.cyan }}>
                VENDAS NO PILOTO AUTOMÁTICO
              </p>
              <StageHeadline
                headline="Autopilot"
                highlight="Autopilot"
                subheadline="IA que responde, qualifica e converte leads 24/7"
              />
            </div>

            {/* Toggle Button */}
            <div className="flex flex-col items-center gap-2">
              <button
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
                    <Play size={20} style={{ color: colors.brand.green }} />
                  ) : (
                    <Pause size={20} style={{ color: colors.text.muted }} />
                  )}
                </div>
              </button>
              <span
                className="text-sm font-medium"
                style={{
                  color: status?.enabled ? colors.brand.green : colors.text.muted,
                }}
              >
                {isToggling
                  ? 'Alterando...'
                  : status?.enabled
                  ? 'ATIVO'
                  : 'PAUSADO'}
              </span>
              {status?.billingSuspended && (
                <span
                  className="text-xs flex items-center gap-1"
                  style={{ color: '#EF4444' }}
                >
                  <AlertCircle size={12} />
                  Cobrança pendente
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
              <AlertCircle size={20} style={{ color: '#EF4444' }} />
              <span style={{ color: '#EF4444' }}>{error}</span>
              <button
                onClick={() => setError(null)}
                className="ml-auto text-sm underline"
                style={{ color: colors.text.muted }}
              >
                Fechar
              </button>
            </div>
          </CenterStage>
        </Section>
      )}

      {/* Stats Grid */}
      <Section spacing="md">
        <CenterStage size="XL">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon={Activity}
              label="Ações (7 dias)"
              value={stats?.actionsLast7d || 0}
              color={colors.brand.green}
            />
            <StatCard
              icon={Users}
              label="Contatos"
              value={stats?.contactsTracked || 0}
              color={colors.brand.cyan}
            />
            <StatCard
              icon={TrendingUp}
              label="Taxa de Resposta"
              value={impact ? `${Math.round(impact.replyRate * 100)}%` : '—'}
              subValue={impact?.repliedContacts ? `${impact.repliedContacts} resp.` : undefined}
              color={colors.brand.green}
            />
            <StatCard
              icon={Sparkles}
              label="Conversões"
              value={stats?.conversionsLast7d || 0}
              subValue={
                stats?.conversionsAmountLast7d
                  ? `R$ ${stats.conversionsAmountLast7d.toLocaleString('pt-BR')}`
                  : undefined
              }
              color="#F59E0B"
            />
          </div>
        </CenterStage>
      </Section>

      {/* Secondary Stats */}
      <Section spacing="sm">
        <CenterStage size="XL">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard
              icon={Clock}
              label="Tempo Médio Resposta"
              value={impact?.avgReplyMinutes ? `${impact.avgReplyMinutes}min` : '—'}
              color={colors.brand.cyan}
            />
            <StatCard
              icon={CheckCircle2}
              label="Sucesso"
              value={stats?.actionsByType?.REPLY || stats?.actionsByType?.['SEND_MESSAGE'] || 0}
              color={colors.brand.green}
            />
            <StatCard
              icon={AlertCircle}
              label="Erros"
              value={stats?.errorsLast7d || 0}
              color="#EF4444"
            />
            <StatCard
              icon={XCircle}
              label="Ignorados"
              value={stats?.skippedTotal || 0}
              subValue={stats?.skippedOptin ? `${stats.skippedOptin} opt-in` : undefined}
              color={colors.text.muted}
            />
            <StatCard
              icon={Calendar}
              label="Agendados"
              value={stats?.scheduledCount || 0}
              color="#F59E0B"
            />
          </div>
        </CenterStage>
      </Section>

      {/* Mission Cards */}
      <Section spacing="lg">
        <CenterStage size="XL">
          <h2
            className="text-lg font-semibold mb-4"
            style={{ color: colors.text.primary }}
          >
            Recursos Ativos
          </h2>
          <MissionCards missions={missionCards} />
        </CenterStage>
      </Section>

      {/* Recent Actions */}
      <Section spacing="lg">
        <CenterStage size="XL">
          <div className="flex items-center justify-between mb-4">
            <h2
              className="text-lg font-semibold"
              style={{ color: colors.text.primary }}
            >
              Ações Recentes
            </h2>
            <div className="flex items-center gap-2">
              <Filter size={16} style={{ color: colors.text.muted }} />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 rounded-lg text-sm border outline-none"
                style={{
                  backgroundColor: colors.background.surface2,
                  borderColor: colors.stroke,
                  color: colors.text.primary,
                }}
              >
                <option value="all">Todos</option>
                <option value="success">Sucesso</option>
                <option value="error">Erros</option>
                <option value="skipped">Ignorados</option>
                <option value="scheduled">Agendados</option>
              </select>
              <button
                onClick={fetchAutopilotData}
                disabled={isLoading}
                className="p-2 rounded-lg transition-colors hover:bg-white/5"
                style={{ color: colors.text.muted }}
              >
                <RefreshCw
                  size={16}
                  className={isLoading ? 'animate-spin' : ''}
                />
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {filteredActions.length === 0 ? (
              <div
                className="p-8 rounded-xl text-center"
                style={{
                  backgroundColor: colors.background.surface1,
                  border: `1px solid ${colors.stroke}`,
                }}
              >
                <Bot
                  size={48}
                  className="mx-auto mb-4"
                  style={{ color: colors.text.muted }}
                />
                <p style={{ color: colors.text.muted }}>
                  {statusFilter === 'all'
                    ? 'Nenhuma ação registrada ainda'
                    : `Nenhuma ação com status "${statusFilter}"`}
                </p>
                {!status?.enabled && (
                  <p
                    className="mt-2 text-sm"
                    style={{ color: colors.text.muted }}
                  >
                    Ative o Autopilot para começar a automatizar
                  </p>
                )}
              </div>
            ) : (
              filteredActions.map((action) => (
                <ActionRow key={action.id} action={action} />
              ))
            )}
          </div>

          {actions.length >= 50 && (
            <div className="mt-4 text-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  // TODO: Implement pagination or export
                  window.open(
                    `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/autopilot/actions/export?workspaceId=${workspaceId}`,
                    '_blank'
                  );
                }}
              >
                <ArrowUpRight size={16} className="mr-2" />
                Exportar todas as ações
              </Button>
            </div>
          )}
        </CenterStage>
      </Section>

      {/* Impact Samples */}
      {impact && impact.samples.length > 0 && (
        <Section spacing="lg">
          <CenterStage size="XL">
            <h2
              className="text-lg font-semibold mb-4"
              style={{ color: colors.text.primary }}
            >
              Exemplos de Impacto
            </h2>
            <div
              className="p-4 rounded-xl"
              style={{
                backgroundColor: colors.background.surface1,
                border: `1px solid ${colors.stroke}`,
              }}
            >
              <div className="space-y-3">
                {impact.samples.map((sample, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 rounded-lg"
                    style={{ backgroundColor: colors.background.surface2 }}
                  >
                    <div>
                      <span
                        className="font-medium"
                        style={{ color: colors.text.primary }}
                      >
                        {sample.contact}
                      </span>
                      <span
                        className="text-sm ml-2"
                        style={{ color: colors.text.muted }}
                      >
                        respondeu em {sample.delayMinutes} min
                      </span>
                    </div>
                    <span
                      className="text-xs"
                      style={{ color: colors.text.muted }}
                    >
                      {new Date(sample.replyAt).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CenterStage>
        </Section>
      )}

      {/* Help Section */}
      <Section spacing="lg">
        <CenterStage size="XL">
          <div
            className="p-6 rounded-xl text-center"
            style={{
              background: `linear-gradient(135deg, ${colors.brand.green}10, ${colors.brand.cyan}10)`,
              border: `1px solid ${colors.stroke}`,
            }}
          >
            <Bot
              size={40}
              className="mx-auto mb-4"
              style={{ color: colors.brand.green }}
            />
            <h3
              className="text-lg font-semibold mb-2"
              style={{ color: colors.text.primary }}
            >
              Precisa de ajuda com o Autopilot?
            </h3>
            <p
              className="text-sm mb-4 max-w-md mx-auto"
              style={{ color: colors.text.muted }}
            >
              O Autopilot usa IA para responder automaticamente, qualificar leads
              e direcionar para conversão. Configure fluxos personalizados para
              maximizar resultados.
            </p>
            <div className="flex justify-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => (window.location.href = '/flow')}
              >
                <Settings2 size={16} className="mr-2" />
                Configurar Fluxos
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => (window.location.href = '/chat')}
              >
                <MessageSquare size={16} className="mr-2" />
                Falar com KLOEL
              </Button>
            </div>
          </div>
        </CenterStage>
      </Section>
    </div>
  );
}
