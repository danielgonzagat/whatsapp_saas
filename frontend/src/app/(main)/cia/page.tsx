'use client';

export const dynamic = 'force-dynamic';

import {
  ActionCard,
  Badge,
  Button,
  CenterStage,
  Grid,
  Section,
  StageHeadline,
  StatCard,
  Surface,
} from '@/components/kloel';
import { useWorkspace } from '@/hooks/useWorkspaceId';
import {
  type CiaAccountApproval,
  type CiaAccountRuntime,
  type CiaCapabilityRegistry,
  type CiaConversationActionRegistry,
  type CiaHumanTask,
  type CiaInputSession,
  type CiaProof,
  type CiaSurfaceResponse,
  type CiaWorkItem,
  autostartCia,
  ciaApi,
  getWhatsAppStatus,
  tokenStorage,
} from '@/lib/api';
import { colors } from '@/lib/design-tokens';
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Loader2,
  RefreshCw,
  Shield,
  Sparkles,
  Wallet,
  XCircle,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

type StreamEvent = {
  type: string;
  message: string;
  phase?: string | null;
  ts?: string;
  meta?: Record<string, any>;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatPhaseLabel(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw === 'streaming_token') return '';

  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatTs(ts?: string | null) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

function workItemStateBadgeVariant(
  state: string,
): 'success' | 'warning' | 'error' | 'info' | undefined {
  switch (state) {
    case 'COMPLETED':
      return 'success';
    case 'WAITING_APPROVAL':
    case 'WAITING_INPUT':
      return 'warning';
    case 'BLOCKED':
      return 'error';
    default:
      return 'info';
  }
}

export default function CiaPage() {
  const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const autoStartRef = useRef(false);
  const [surface, setSurface] = useState<CiaSurfaceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [taskPendingId, setTaskPendingId] = useState<string | null>(null);
  const [taskDrafts, setTaskDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Advanced endpoint state
  const [accountRuntime, setAccountRuntime] = useState<CiaAccountRuntime | null>(null);
  const [approvals, setApprovals] = useState<CiaAccountApproval[]>([]);
  const [inputSessions, setInputSessions] = useState<CiaInputSession[]>([]);
  const [workItems, setWorkItems] = useState<CiaWorkItem[]>([]);
  const [accountProof, setAccountProof] = useState<CiaProof | null>(null);
  const [cycleProof, setCycleProof] = useState<CiaProof | null>(null);
  const [capabilityRegistry, setCapabilityRegistry] = useState<CiaCapabilityRegistry | null>(null);
  const [conversationActionRegistry, setConversationActionRegistry] =
    useState<CiaConversationActionRegistry | null>(null);
  const [approvalPendingId, setApprovalPendingId] = useState<string | null>(null);
  const [sessionPendingId, setSessionPendingId] = useState<string | null>(null);
  const [sessionAnswers, setSessionAnswers] = useState<Record<string, string>>({});
  const [registriesExpanded, setRegistriesExpanded] = useState(false);

  async function loadSurface() {
    if (!workspaceId) return;
    setLoading((current) => (surface ? current : true));
    const res = await ciaApi.getSurface(workspaceId);
    if (res.error) {
      setError(res.error);
    } else if (res.data) {
      setSurface(res.data);
      setError(null);
    }
    setLoading(false);
  }

  async function loadAdvancedData() {
    if (!workspaceId) return;

    const [
      runtimeRes,
      approvalsRes,
      inputSessionsRes,
      workItemsRes,
      accountProofRes,
      cycleProofRes,
      capabilityRes,
      actionRes,
    ] = await Promise.all([
      ciaApi.getAccountRuntime(workspaceId),
      ciaApi.getAccountApprovals(workspaceId),
      ciaApi.getAccountInputSessions(workspaceId),
      ciaApi.getAccountWorkItems(workspaceId),
      ciaApi.getAccountProof(workspaceId),
      ciaApi.getCycleProof(workspaceId),
      ciaApi.getCapabilityRegistry(),
      ciaApi.getConversationActionRegistry(),
    ]);

    if (runtimeRes.data) setAccountRuntime(runtimeRes.data);
    if (approvalsRes.data) setApprovals(Array.isArray(approvalsRes.data) ? approvalsRes.data : []);
    if (inputSessionsRes.data)
      setInputSessions(Array.isArray(inputSessionsRes.data) ? inputSessionsRes.data : []);
    if (workItemsRes.data) setWorkItems(Array.isArray(workItemsRes.data) ? workItemsRes.data : []);
    if (accountProofRes.data) setAccountProof(accountProofRes.data);
    if (cycleProofRes.data) setCycleProof(cycleProofRes.data);
    if (capabilityRes.data) setCapabilityRegistry(capabilityRes.data);
    if (actionRes.data) setConversationActionRegistry(actionRes.data);
  }

  useEffect(() => {
    if (!workspaceId) return;
    void loadSurface();
    void loadAdvancedData();
    const interval = setInterval(() => {
      void loadSurface();
      void loadAdvancedData();
    }, 15000);
    return () => clearInterval(interval);
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId || workspaceLoading || !surface || autoStartRef.current) return;

    const mode = String(surface.autonomy?.mode || 'OFF');
    const reason = String(surface.autonomy?.reason || '');
    const isActive = ['LIVE', 'BACKLOG', 'FULL'].includes(mode);
    if (isActive || reason === 'manual_pause') return;

    autoStartRef.current = true;

    void (async () => {
      try {
        const status = await getWhatsAppStatus(workspaceId);
        const connected = !!status.connected;

        if (!connected) {
          autoStartRef.current = false;
          return;
        }

        await autostartCia(workspaceId);
        await loadSurface();
      } catch {
        autoStartRef.current = false;
      }
    })();
  }, [surface, workspaceId, workspaceLoading]);

  useEffect(() => {
    if (!workspaceId) return;
    const token = tokenStorage.getToken();
    if (!token) return;

    let cancelled = false;

    async function stream() {
      try {
        const response = await fetch('/api/whatsapp-api/agent/stream', {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-workspace-id': workspaceId,
            Accept: 'text/event-stream',
          },
        });

        if (!response.ok || !response.body) return;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split('\n\n');
          buffer = chunks.pop() || '';

          for (const chunk of chunks) {
            const payload = chunk
              .split('\n')
              .filter((line) => line.startsWith('data: '))
              .map((line) => line.slice(6))
              .join('');
            if (!payload) continue;

            const event = JSON.parse(payload) as StreamEvent;
            if (event.type === 'heartbeat' && !event.message) continue;

            setSurface((current) => {
              if (!current) return current;
              const recent = [...(current.recent || []), event].slice(-12);
              return {
                ...current,
                now: {
                  message: event.message,
                  phase: event.phase || null,
                  type: event.type,
                  ts: event.ts,
                },
                recent,
              };
            });
          }
        }
      } catch {
        // mantém polling como fallback
      }
    }

    void stream();

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  async function handleAutopilotTotal() {
    if (!workspaceId) return;
    setActivating(true);
    const res = await ciaApi.activateAutopilotTotal(workspaceId);
    if (res.error) {
      setError(res.error);
    } else {
      await loadSurface();
    }
    setActivating(false);
  }

  async function handleApproveTask(task: CiaHumanTask) {
    if (!workspaceId) return;
    setTaskPendingId(task.id);
    const res = await ciaApi.approveHumanTask(workspaceId, task.id, {
      message: taskDrafts[task.id] || task.suggestedReply,
      resume: true,
    });
    if (res.error) {
      setError(res.error);
    } else {
      await loadSurface();
    }
    setTaskPendingId(null);
  }

  async function handleRejectTask(task: CiaHumanTask) {
    if (!workspaceId) return;
    setTaskPendingId(task.id);
    const res = await ciaApi.rejectHumanTask(workspaceId, task.id);
    if (res.error) {
      setError(res.error);
    } else {
      await loadSurface();
    }
    setTaskPendingId(null);
  }

  async function handleResumeTask(task: CiaHumanTask) {
    if (!workspaceId || !task.conversationId) return;
    setTaskPendingId(task.id);
    const res = await ciaApi.resumeConversation(workspaceId, task.conversationId);
    if (res.error) {
      setError(res.error);
    } else {
      await loadSurface();
    }
    setTaskPendingId(null);
  }

  async function handleApproveApproval(approval: CiaAccountApproval) {
    if (!workspaceId) return;
    setApprovalPendingId(approval.id);
    const res = await ciaApi.approveAccountApproval(workspaceId, approval.id);
    if (res.error) {
      setError(res.error);
    } else {
      await loadAdvancedData();
    }
    setApprovalPendingId(null);
  }

  async function handleRejectApproval(approval: CiaAccountApproval) {
    if (!workspaceId) return;
    setApprovalPendingId(approval.id);
    const res = await ciaApi.rejectAccountApproval(workspaceId, approval.id);
    if (res.error) {
      setError(res.error);
    } else {
      await loadAdvancedData();
    }
    setApprovalPendingId(null);
  }

  async function handleRespondToSession(session: CiaInputSession) {
    if (!workspaceId) return;
    const answer = sessionAnswers[session.id] || '';
    if (!answer.trim()) return;
    setSessionPendingId(session.id);
    const res = await ciaApi.respondToInputSession(workspaceId, session.id, answer);
    if (res.error) {
      setError(res.error);
    } else {
      setSessionAnswers((prev) => {
        const next = { ...prev };
        delete next[session.id];
        return next;
      });
      await loadAdvancedData();
    }
    setSessionPendingId(null);
  }

  const moneyEvents = useMemo(
    () =>
      (surface?.recent || []).filter((event) => event.type === 'sale' || event.type === 'payment'),
    [surface],
  );

  const openApprovals = approvals.filter((a) => a.status === 'OPEN');
  const pendingSessions = inputSessions.filter((s) => s.status !== 'COMPLETED');
  const activeWorkItems = workItems.filter((w) => w.state !== 'COMPLETED');

  return (
    <CenterStage size="XL">
      <Section spacing="lg">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <StageHeadline
              headline={surface?.title || 'KLOEL'}
              subheadline={surface?.subtitle || 'Trabalhando no seu WhatsApp'}
            />
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <Badge>{surface?.workspaceName || 'Workspace'}</Badge>
              <Badge variant="info">{surface?.state || 'CARREGANDO'}</Badge>
              {surface?.runtime?.lastError ? (
                <Badge variant="error">Erro recente</Badge>
              ) : (
                <Badge variant="success">Operação observável</Badge>
              )}
              {accountRuntime && (
                <Badge variant={accountRuntime.noLegalActions ? 'warning' : 'info'}>
                  {accountRuntime.mode}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                void loadSurface();
                void loadAdvancedData();
              }}
              leftIcon={<RefreshCw size={16} aria-hidden="true" />}
              disabled={workspaceLoading}
            >
              Atualizar
            </Button>
            <Button
              onClick={() => void handleAutopilotTotal()}
              isLoading={activating}
              leftIcon={<Zap size={16} aria-hidden="true" />}
              disabled={workspaceLoading || !workspaceId}
            >
              Autopilot Total
            </Button>
          </div>
        </div>

        {/* Stats */}
        <Grid cols={3} gap={4}>
          <StatCard
            label="Vendido Hoje"
            value={formatCurrency(surface?.today?.soldAmount || 0)}
            icon={Wallet}
          />
          <StatCard
            label="Conversas Ativas"
            value={surface?.today?.activeConversations || 0}
            icon={Activity}
          />
          <StatCard
            label="Pagamentos Pendentes"
            value={surface?.today?.pendingPayments || 0}
            icon={Bot}
          />
        </Grid>

        {/* Now */}
        <Surface className="p-6">
          <div className="flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${colors.brand.green}18` }}
            >
              {loading ? (
                <Loader2
                  className="animate-spin"
                  size={22}
                  style={{ color: colors.brand.green }}
                  aria-hidden="true"
                />
              ) : (
                <Sparkles size={22} style={{ color: colors.brand.green }} aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0">
              <p
                className="text-sm uppercase tracking-[0.18em] mb-2"
                style={{ color: colors.text.muted }}
              >
                Agora
              </p>
              <p
                className="text-2xl md:text-3xl font-semibold leading-tight"
                style={{ color: colors.text.primary }}
              >
                {surface?.now?.message ||
                  'Estou observando o WhatsApp e preparando a próxima ação segura.'}
              </p>
              {surface?.now?.phase && (
                <p className="mt-3 text-sm" style={{ color: colors.text.secondary }}>
                  Fase atual: {surface.now.phase}
                </p>
              )}
              {error && (
                <p className="mt-3 text-sm" style={{ color: colors.state.error }}>
                  {error}
                </p>
              )}
            </div>
          </div>
        </Surface>

        {/* Money events */}
        {moneyEvents.length > 0 && (
          <Surface className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Zap size={16} style={{ color: colors.brand.green }} aria-hidden="true" />
              <p className="text-sm font-medium" style={{ color: colors.text.secondary }}>
                Dinheiro em tempo real
              </p>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {moneyEvents
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
        )}

        {/* Activity + Cognitive + Human tasks */}
        <Grid cols={2} gap={4}>
          <Surface className="p-5">
            <p
              className="text-sm uppercase tracking-[0.18em] mb-4"
              style={{ color: colors.text.muted }}
            >
              Atividade Recente
            </p>
            <div className="space-y-3">
              {(surface?.recent || [])
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

          <div className="space-y-4">
            <Surface className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Bot size={16} style={{ color: colors.brand.green }} aria-hidden="true" />
                <p
                  className="text-sm uppercase tracking-[0.18em]"
                  style={{ color: colors.text.muted }}
                >
                  Estado Cognitivo
                </p>
              </div>

              {(surface?.cognition || []).length === 0 ? (
                <div
                  className="rounded-xl p-4"
                  style={{
                    backgroundColor: colors.background.surface1,
                    border: `1px solid ${colors.stroke}`,
                  }}
                >
                  <p className="text-sm font-medium" style={{ color: colors.text.primary }}>
                    Ainda estou consolidando o contexto comercial dos contatos
                  </p>
                  <p className="text-sm mt-1" style={{ color: colors.text.secondary }}>
                    Assim que eu fechar intenção, estágio e próxima melhor ação, isso aparece aqui.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(surface?.cognition || []).slice(0, 4).map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl p-4"
                      style={{
                        backgroundColor: colors.background.surface1,
                        border: `1px solid ${colors.stroke}`,
                      }}
                    >
                      <p className="text-sm font-medium" style={{ color: colors.text.primary }}>
                        {item.summary}
                      </p>
                      <p className="text-xs mt-2" style={{ color: colors.text.muted }}>
                        {item.phone ? `${item.phone} • ` : ''}
                        {item.intent ? `${item.intent} • ` : ''}
                        {item.stage ? `${item.stage} • ` : ''}
                        {item.nextBestAction || item.outcome || 'observando'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Surface>
            <Surface className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle
                  size={16}
                  style={{ color: colors.state.warning }}
                  aria-hidden="true"
                />
                <p
                  className="text-sm uppercase tracking-[0.18em]"
                  style={{ color: colors.text.muted }}
                >
                  Exceções Humanas
                </p>
              </div>
              {(surface?.humanTasks || []).length === 0 ? (
                <div
                  className="rounded-xl p-4"
                  style={{
                    backgroundColor: colors.background.surface1,
                    border: `1px solid ${colors.stroke}`,
                  }}
                >
                  <p className="text-sm font-medium" style={{ color: colors.text.primary }}>
                    Nenhuma exceção humana urgente
                  </p>
                  <p className="text-sm mt-1" style={{ color: colors.text.secondary }}>
                    O CIA está resolvendo sozinho o que cabe à zona segura.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(surface?.humanTasks || []).map((task) => (
                    <div
                      key={task.id}
                      className="rounded-xl p-4"
                      style={{
                        backgroundColor: colors.background.surface1,
                        border: `1px solid ${colors.stroke}`,
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p
                            className="text-sm font-semibold"
                            style={{ color: colors.text.primary }}
                          >
                            {task.reason}
                          </p>
                          <p className="text-xs mt-1" style={{ color: colors.text.muted }}>
                            {task.urgency} {task.phone ? `• ${task.phone}` : ''}{' '}
                            {task.businessImpact ? `• ${task.businessImpact}` : ''}
                          </p>
                        </div>
                        <Badge variant={task.urgency === 'CRITICAL' ? 'error' : 'warning'}>
                          {task.urgency}
                        </Badge>
                      </div>

                      <textarea
                        value={taskDrafts[task.id] ?? task.suggestedReply ?? ''}
                        onChange={(event) =>
                          setTaskDrafts((current) => ({
                            ...current,
                            [task.id]: event.target.value,
                          }))
                        }
                        placeholder="Editar resposta antes de aprovar"
                        className="mt-3 w-full rounded-xl border px-3 py-2 text-sm outline-none"
                        style={{
                          backgroundColor: colors.background.base,
                          color: colors.text.primary,
                          borderColor: colors.stroke,
                        }}
                        rows={3}
                      />

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          onClick={() => void handleApproveTask(task)}
                          isLoading={taskPendingId === task.id}
                          disabled={workspaceLoading}
                        >
                          Aprovar
                        </Button>
                        {task.conversationId ? (
                          <Button
                            variant="secondary"
                            onClick={() => void handleResumeTask(task)}
                            disabled={taskPendingId === task.id || workspaceLoading}
                          >
                            Retomar autonomia
                          </Button>
                        ) : null}
                        <Button
                          variant="secondary"
                          onClick={() => void handleRejectTask(task)}
                          disabled={taskPendingId === task.id || workspaceLoading}
                        >
                          Dispensar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Surface>
            <ActionCard
              title={
                surface?.marketSignals?.[0]?.normalizedKey
                  ? `Sinal dominante: ${surface.marketSignals[0].normalizedKey}`
                  : 'Sem sinal dominante ainda'
              }
              description={
                surface?.marketSignals?.[0]
                  ? `${surface.marketSignals[0].frequency} ocorrências recentes`
                  : 'O CIA está agregando objeções e demanda em tempo real.'
              }
              icon={Sparkles}
              actionLabel="Inteligência de mercado"
              accent="cyan"
            />
          </div>
        </Grid>

        {/* Insights */}
        {!!surface?.insights?.length && (
          <Surface className="p-5">
            <p
              className="text-sm uppercase tracking-[0.18em] mb-4"
              style={{ color: colors.text.muted }}
            >
              Insights do Runtime
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {surface?.insights?.map((insight: any, index: number) => (
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
                    {insight.description || 'Insight operacional disponível.'}
                  </p>
                </div>
              ))}
            </div>
          </Surface>
        )}

        {/* ─── ACCOUNT RUNTIME PANEL ─── */}
        {accountRuntime && (
          <Surface className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity size={16} style={{ color: colors.brand.amber }} aria-hidden="true" />
                <p
                  className="text-sm uppercase tracking-[0.18em]"
                  style={{ color: colors.text.muted }}
                >
                  Agent Runtime
                </p>
              </div>
              <Badge variant={accountRuntime.noLegalActions ? 'warning' : 'success'}>
                {accountRuntime.mode}
              </Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Aprovações abertas', value: accountRuntime.openApprovalCount },
                { label: 'Inputs pendentes', value: accountRuntime.pendingInputCount },
                { label: 'Work items ativos', value: accountRuntime.openWorkItemCount },
                { label: 'Aprovações concluídas', value: accountRuntime.completedApprovalCount },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded p-3"
                  style={{
                    backgroundColor: colors.background.surface1,
                    border: `1px solid ${colors.stroke}`,
                  }}
                >
                  <p
                    className="text-2xl font-bold font-mono"
                    style={{ color: colors.text.primary }}
                  >
                    {stat.value}
                  </p>
                  <p className="text-xs mt-1" style={{ color: colors.text.muted }}>
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
            {accountRuntime.noLegalActions && (
              <div
                className="mt-4 rounded p-3"
                style={{
                  backgroundColor: `${colors.state.warning}12`,
                  border: `1px solid ${colors.state.warning}40`,
                }}
              >
                <p className="text-sm" style={{ color: colors.state.warning }}>
                  Universo de ações esgotado — nenhuma ação legal disponível no momento.
                </p>
              </div>
            )}
          </Surface>
        )}

        {/* ─── ACCOUNT APPROVALS PANEL ─── */}
        <Surface className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle size={16} style={{ color: colors.brand.amber }} aria-hidden="true" />
            <p className="text-sm uppercase tracking-[0.18em]" style={{ color: colors.text.muted }}>
              Aprovações de Conta
            </p>
            {openApprovals.length > 0 && (
              <Badge variant="warning">{openApprovals.length} abertas</Badge>
            )}
          </div>

          {approvals.length === 0 ? (
            <div
              className="rounded p-4"
              style={{
                backgroundColor: colors.background.surface1,
                border: `1px solid ${colors.stroke}`,
              }}
            >
              <p className="text-sm font-medium" style={{ color: colors.text.primary }}>
                Nenhuma aprovação pendente
              </p>
              <p className="text-sm mt-1" style={{ color: colors.text.secondary }}>
                O agente não detectou lacunas no catálogo que exijam criação de produto.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {approvals.map((approval) => (
                <div
                  key={approval.id}
                  className="rounded p-4"
                  style={{
                    backgroundColor: colors.background.surface1,
                    border: `1px solid ${colors.stroke}`,
                  }}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold" style={{ color: colors.text.primary }}>
                        {approval.requestedProductName}
                      </p>
                      <p className="text-xs mt-1" style={{ color: colors.text.muted }}>
                        {approval.operatorPrompt}
                      </p>
                      {approval.phone && (
                        <p className="text-xs mt-1" style={{ color: colors.text.muted }}>
                          {approval.phone}
                          {approval.contactName ? ` • ${approval.contactName}` : ''}
                        </p>
                      )}
                      <p className="text-xs mt-1" style={{ color: colors.text.muted }}>
                        Detectado: {formatTs(approval.firstDetectedAt)}
                      </p>
                    </div>
                    <Badge
                      variant={
                        approval.status === 'OPEN'
                          ? 'warning'
                          : approval.status === 'APPROVED'
                            ? 'success'
                            : approval.status === 'COMPLETED'
                              ? 'info'
                              : 'error'
                      }
                    >
                      {approval.status}
                    </Badge>
                  </div>

                  {approval.status === 'OPEN' && (
                    <div className="mt-3 flex gap-2">
                      <Button
                        onClick={() => void handleApproveApproval(approval)}
                        isLoading={approvalPendingId === approval.id}
                        disabled={workspaceLoading}
                        leftIcon={<CheckCircle size={14} aria-hidden="true" />}
                      >
                        Aprovar criação
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => void handleRejectApproval(approval)}
                        disabled={approvalPendingId === approval.id || workspaceLoading}
                        leftIcon={<XCircle size={14} aria-hidden="true" />}
                      >
                        Rejeitar
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Surface>

        {/* ─── INPUT SESSIONS PANEL ─── */}
        <Surface className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <ClipboardList size={16} style={{ color: colors.brand.amber }} aria-hidden="true" />
            <p className="text-sm uppercase tracking-[0.18em]" style={{ color: colors.text.muted }}>
              Coleta de Informações
            </p>
            {pendingSessions.length > 0 && (
              <Badge variant="warning">{pendingSessions.length} aguardando</Badge>
            )}
          </div>

          {inputSessions.length === 0 ? (
            <div
              className="rounded p-4"
              style={{
                backgroundColor: colors.background.surface1,
                border: `1px solid ${colors.stroke}`,
              }}
            >
              <p className="text-sm font-medium" style={{ color: colors.text.primary }}>
                Nenhuma sessão de input ativa
              </p>
              <p className="text-sm mt-1" style={{ color: colors.text.secondary }}>
                Quando o agente precisar de informações para criar um produto, as sessões aparecem
                aqui.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {inputSessions.map((session) => (
                <div
                  key={session.id}
                  className="rounded p-4"
                  style={{
                    backgroundColor: colors.background.surface1,
                    border: `1px solid ${colors.stroke}`,
                  }}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold" style={{ color: colors.text.primary }}>
                        {session.productName}
                      </p>
                      {session.currentPrompt && (
                        <p className="text-sm mt-2" style={{ color: colors.text.secondary }}>
                          {session.currentPrompt}
                        </p>
                      )}
                      {session.phone && (
                        <p className="text-xs mt-1" style={{ color: colors.text.muted }}>
                          {session.phone}
                          {session.contactName ? ` • ${session.contactName}` : ''}
                        </p>
                      )}
                    </div>
                    <Badge variant={session.status === 'COMPLETED' ? 'success' : 'warning'}>
                      {session.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>

                  {session.status !== 'COMPLETED' && (
                    <div className="mt-3">
                      <textarea
                        value={sessionAnswers[session.id] ?? ''}
                        onChange={(e) =>
                          setSessionAnswers((prev) => ({
                            ...prev,
                            [session.id]: e.target.value,
                          }))
                        }
                        placeholder="Sua resposta..."
                        className="w-full rounded border px-3 py-2 text-sm outline-none"
                        style={{
                          backgroundColor: colors.background.base,
                          color: colors.text.primary,
                          borderColor: colors.stroke,
                        }}
                        rows={3}
                      />
                      <Button
                        className="mt-2"
                        onClick={() => void handleRespondToSession(session)}
                        isLoading={sessionPendingId === session.id}
                        disabled={workspaceLoading || !sessionAnswers[session.id]?.trim()}
                      >
                        Responder
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Surface>

        {/* ─── WORK ITEMS PANEL ─── */}
        <Surface className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <ClipboardList size={16} style={{ color: colors.brand.amber }} aria-hidden="true" />
            <p className="text-sm uppercase tracking-[0.18em]" style={{ color: colors.text.muted }}>
              Work Items do Agente
            </p>
            {activeWorkItems.length > 0 && (
              <Badge variant="info">{activeWorkItems.length} ativos</Badge>
            )}
          </div>

          {workItems.length === 0 ? (
            <div
              className="rounded p-4"
              style={{
                backgroundColor: colors.background.surface1,
                border: `1px solid ${colors.stroke}`,
              }}
            >
              <p className="text-sm font-medium" style={{ color: colors.text.primary }}>
                Nenhum work item no momento
              </p>
              <p className="text-sm mt-1" style={{ color: colors.text.secondary }}>
                O agente não possui tarefas pendentes no universo atual.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {workItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded p-3 flex items-start justify-between gap-3"
                  style={{
                    backgroundColor: colors.background.surface1,
                    border: `1px solid ${colors.stroke}`,
                  }}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium" style={{ color: colors.text.primary }}>
                      {item.title}
                    </p>
                    <p className="text-xs mt-1" style={{ color: colors.text.muted }}>
                      {item.summary}
                    </p>
                    <p className="text-xs mt-1" style={{ color: colors.text.muted }}>
                      {item.entityType} • prioridade {item.priority}
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    <Badge variant={workItemStateBadgeVariant(item.state)}>
                      {item.state.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Surface>

        {/* ─── PROOF PANELS ─── */}
        <Grid cols={2} gap={4}>
          {/* Cycle Proof */}
          <Surface className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Shield size={16} style={{ color: colors.brand.amber }} aria-hidden="true" />
              <p
                className="text-sm uppercase tracking-[0.18em]"
                style={{ color: colors.text.muted }}
              >
                Prova do Ciclo
              </p>
            </div>
            {!cycleProof ? (
              <div
                className="rounded p-4"
                style={{
                  backgroundColor: colors.background.surface1,
                  border: `1px solid ${colors.stroke}`,
                }}
              >
                <p className="text-sm font-medium" style={{ color: colors.text.primary }}>
                  Nenhuma prova de ciclo disponível
                </p>
                <p className="text-sm mt-1" style={{ color: colors.text.secondary }}>
                  Gerada após o primeiro ciclo completo do agente.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {cycleProof.summary && (
                  <div
                    className="rounded p-3"
                    style={{
                      backgroundColor: colors.background.surface1,
                      border: `1px solid ${colors.stroke}`,
                    }}
                  >
                    <p
                      className="text-xs uppercase tracking-widest mb-1"
                      style={{ color: colors.text.muted }}
                    >
                      Sumário
                    </p>
                    <p className="text-sm" style={{ color: colors.text.primary }}>
                      {cycleProof.summary}
                    </p>
                  </div>
                )}
                {cycleProof.guaranteeReport && (
                  <div
                    className="rounded p-3"
                    style={{
                      backgroundColor: colors.background.surface1,
                      border: `1px solid ${colors.stroke}`,
                    }}
                  >
                    <p
                      className="text-xs uppercase tracking-widest mb-1"
                      style={{ color: colors.text.muted }}
                    >
                      Garantia
                    </p>
                    <pre
                      className="text-xs whitespace-pre-wrap break-words"
                      style={{ color: colors.text.secondary }}
                    >
                      {typeof cycleProof.guaranteeReport === 'string'
                        ? cycleProof.guaranteeReport
                        : JSON.stringify(cycleProof.guaranteeReport, null, 2)}
                    </pre>
                  </div>
                )}
                <p className="text-xs" style={{ color: colors.text.muted }}>
                  Gerado em: {formatTs(cycleProof.generatedAt)}
                </p>
              </div>
            )}
          </Surface>

          {/* Account Proof */}
          <Surface className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Shield size={16} style={{ color: colors.brand.amber }} aria-hidden="true" />
              <p
                className="text-sm uppercase tracking-[0.18em]"
                style={{ color: colors.text.muted }}
              >
                Prova de Conta
              </p>
            </div>
            {!accountProof ? (
              <div
                className="rounded p-4"
                style={{
                  backgroundColor: colors.background.surface1,
                  border: `1px solid ${colors.stroke}`,
                }}
              >
                <p className="text-sm font-medium" style={{ color: colors.text.primary }}>
                  Nenhuma prova de conta disponível
                </p>
                <p className="text-sm mt-1" style={{ color: colors.text.secondary }}>
                  Gerada após o agente processar o universo completo de contatos.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {accountProof.summary && (
                  <div
                    className="rounded p-3"
                    style={{
                      backgroundColor: colors.background.surface1,
                      border: `1px solid ${colors.stroke}`,
                    }}
                  >
                    <p
                      className="text-xs uppercase tracking-widest mb-1"
                      style={{ color: colors.text.muted }}
                    >
                      Sumário
                    </p>
                    <p className="text-sm" style={{ color: colors.text.primary }}>
                      {accountProof.summary}
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Candidatos', value: accountProof.candidateCount },
                    { label: 'Elegíveis', value: accountProof.eligibleActionCount },
                    { label: 'Bloqueados', value: accountProof.blockedActionCount },
                    { label: 'Aguardando aprovação', value: accountProof.waitingApprovalCount },
                  ].map((stat) =>
                    stat.value !== undefined ? (
                      <div
                        key={stat.label}
                        className="rounded p-2"
                        style={{
                          backgroundColor: colors.background.surface1,
                          border: `1px solid ${colors.stroke}`,
                        }}
                      >
                        <p
                          className="text-lg font-bold font-mono"
                          style={{ color: colors.text.primary }}
                        >
                          {stat.value}
                        </p>
                        <p className="text-xs" style={{ color: colors.text.muted }}>
                          {stat.label}
                        </p>
                      </div>
                    ) : null,
                  )}
                </div>
                <p className="text-xs" style={{ color: colors.text.muted }}>
                  Gerado em: {formatTs(accountProof.generatedAt)}
                  {accountProof.status ? ` • ${accountProof.status}` : ''}
                </p>
              </div>
            )}
          </Surface>
        </Grid>

        {/* ─── CAPABILITY & ACTION REGISTRIES ─── */}
        <Surface className="p-5">
          <button
            className="flex items-center justify-between w-full text-left"
            onClick={() => setRegistriesExpanded((v) => !v)}
            type="button"
          >
            <div className="flex items-center gap-2">
              <Bot size={16} style={{ color: colors.brand.amber }} aria-hidden="true" />
              <p
                className="text-sm uppercase tracking-[0.18em]"
                style={{ color: colors.text.muted }}
              >
                Registros de Capacidades
              </p>
              {capabilityRegistry && (
                <Badge variant="info">{capabilityRegistry.items.length} capacidades</Badge>
              )}
              {conversationActionRegistry && (
                <Badge variant="info">{conversationActionRegistry.items.length} ações</Badge>
              )}
            </div>
            {registriesExpanded ? (
              <ChevronDown size={16} style={{ color: colors.text.muted }} aria-hidden="true" />
            ) : (
              <ChevronRight size={16} style={{ color: colors.text.muted }} aria-hidden="true" />
            )}
          </button>

          {registriesExpanded && (
            <div className="mt-4 space-y-4">
              {capabilityRegistry && (
                <div>
                  <p
                    className="text-xs uppercase tracking-widest mb-3"
                    style={{ color: colors.text.muted }}
                  >
                    Capacidades de Conta — v{capabilityRegistry.version}
                  </p>
                  <div className="grid gap-2 md:grid-cols-2">
                    {capabilityRegistry.items.map((cap, idx) => (
                      <div
                        key={cap.id || idx}
                        className="rounded p-3"
                        style={{
                          backgroundColor: colors.background.surface1,
                          border: `1px solid ${colors.stroke}`,
                        }}
                      >
                        <p className="text-sm font-medium" style={{ color: colors.text.primary }}>
                          {cap.name || cap.id}
                        </p>
                        {cap.description && (
                          <p className="text-xs mt-1" style={{ color: colors.text.muted }}>
                            {cap.description}
                          </p>
                        )}
                        {cap.category && (
                          <p className="text-xs mt-1" style={{ color: colors.text.muted }}>
                            {cap.category}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {conversationActionRegistry && (
                <div>
                  <p
                    className="text-xs uppercase tracking-widest mb-3"
                    style={{ color: colors.text.muted }}
                  >
                    Ações de Conversa — v{conversationActionRegistry.version}
                  </p>
                  <div className="grid gap-2 md:grid-cols-2">
                    {conversationActionRegistry.items.map((action, idx) => (
                      <div
                        key={action.id || idx}
                        className="rounded p-3"
                        style={{
                          backgroundColor: colors.background.surface1,
                          border: `1px solid ${colors.stroke}`,
                        }}
                      >
                        <p className="text-sm font-medium" style={{ color: colors.text.primary }}>
                          {action.name || action.id}
                        </p>
                        {action.description && (
                          <p className="text-xs mt-1" style={{ color: colors.text.muted }}>
                            {action.description}
                          </p>
                        )}
                        {action.category && (
                          <p className="text-xs mt-1" style={{ color: colors.text.muted }}>
                            {action.category}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!capabilityRegistry && !conversationActionRegistry && (
                <p className="text-sm" style={{ color: colors.text.secondary }}>
                  Registros não disponíveis.
                </p>
              )}
            </div>
          )}
        </Surface>
      </Section>
    </CenterStage>
  );
}
