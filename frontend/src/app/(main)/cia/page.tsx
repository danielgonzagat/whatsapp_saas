'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  Loader2,
  RefreshCw,
  Sparkles,
  Wallet,
  Zap,
} from 'lucide-react';
import {
  Button,
  CenterStage,
  Grid,
  Section,
  StageHeadline,
  StatCard,
  Surface,
  Badge,
  ActionCard,
} from '@/components/kloel';
import { colors } from '@/lib/design-tokens';
import {
  CiaHumanTask,
  CiaSurfaceResponse,
  autostartCia,
  ciaApi,
  getWhatsAppStatus,
  tokenStorage,
} from '@/lib/api';
import { useWorkspace } from '@/hooks/useWorkspaceId';

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

export default function CiaPage() {
  const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const autoStartRef = useRef(false);
  const [surface, setSurface] = useState<CiaSurfaceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [taskPendingId, setTaskPendingId] = useState<string | null>(null);
  const [taskDrafts, setTaskDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!workspaceId) return;
    void loadSurface();
    const interval = setInterval(() => {
      void loadSurface();
    }, 10000);
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

  const moneyEvents = useMemo(
    () =>
      (surface?.recent || []).filter(
        (event) => event.type === 'sale' || event.type === 'payment',
      ),
    [surface],
  );

  return (
    <CenterStage size="XL">
      <Section spacing="lg">
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
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => void loadSurface()}
              leftIcon={<RefreshCw size={16} />}
              disabled={workspaceLoading}
            >
              Atualizar
            </Button>
            <Button
              onClick={() => void handleAutopilotTotal()}
              isLoading={activating}
              leftIcon={<Zap size={16} />}
              disabled={workspaceLoading || !workspaceId}
            >
              Autopilot Total
            </Button>
          </div>
        </div>

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
                />
              ) : (
                <Sparkles size={22} style={{ color: colors.brand.green }} />
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

        {moneyEvents.length > 0 && (
          <Surface className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Zap size={16} style={{ color: colors.brand.green }} />
              <p className="text-sm font-medium" style={{ color: colors.text.secondary }}>
                Dinheiro em tempo real
              </p>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {moneyEvents.slice(-6).reverse().map((event, index) => (
                <div
                  key={`${event.ts || index}-${event.message}`}
                  className="rounded-xl px-4 py-3"
                  style={{
                    backgroundColor: `${colors.brand.green}10`,
                    border: `1px solid ${colors.stroke}`,
                  }}
                >
                  <p
                    className="text-sm font-medium"
                    style={{ color: colors.brand.green }}
                  >
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

        <Grid cols={2} gap={4}>
          <Surface className="p-5">
            <p
              className="text-sm uppercase tracking-[0.18em] mb-4"
              style={{ color: colors.text.muted }}
            >
              Atividade Recente
            </p>
            <div className="space-y-3">
              {(surface?.recent || []).slice().reverse().map((event, index) => (
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
                    {event.type} {event.phase ? `• ${event.phase}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </Surface>

          <div className="space-y-4">
            <Surface className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Bot size={16} style={{ color: colors.brand.green }} />
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
                <AlertTriangle size={16} style={{ color: colors.state.warning }} />
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
      </Section>
    </CenterStage>
  );
}
