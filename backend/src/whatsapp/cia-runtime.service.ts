import { Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { autopilotQueue } from '../queue/queue';
import { buildQueueJobId } from '../queue/job-id.util';
import { WhatsAppApiProvider, WahaChatSummary } from './providers/whatsapp-api.provider';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { WhatsAppCatchupService } from './whatsapp-catchup.service';
import { AgentEventsService } from './agent-events.service';
import { buildConversationOperationalState } from './agent-conversation-state.util';
import { WorkerRuntimeService } from './worker-runtime.service';
import { UnifiedAgentService } from '../kloel/unified-agent.service';
import { WhatsappService } from './whatsapp.service';

type BacklogMode =
  | 'reply_all_recent_first'
  | 'reply_only_new'
  | 'prioritize_hot';

type WorkspaceAutonomyMode =
  | 'OFF'
  | 'LIVE'
  | 'BACKLOG'
  | 'FULL'
  | 'HUMAN_ONLY'
  | 'SUSPENDED';

const CIA_BOOTSTRAP_IMMEDIATE_LIMIT = Math.max(
  1,
  Math.min(
    20,
    parseInt(process.env.CIA_BOOTSTRAP_IMMEDIATE_LIMIT || '5', 10) || 5,
  ),
);
const CIA_BOOTSTRAP_REMOTE_LOOKBACK_MS = Math.max(
  60_000,
  parseInt(
    process.env.CIA_BOOTSTRAP_REMOTE_LOOKBACK_MS ||
      `${12 * 60 * 60 * 1000}`,
    10,
) ||
    12 * 60 * 60 * 1000,
);
const CIA_INLINE_BACKLOG_FALLBACK_LIMIT = Math.max(
  1,
  Math.min(
    50,
    parseInt(process.env.CIA_INLINE_BACKLOG_FALLBACK_LIMIT || '10', 10) || 10,
  ),
);
const CIA_BOOTSTRAP_INLINE_PROOF_LIMIT = Math.max(
  1,
  Math.min(
    10,
    parseInt(process.env.CIA_BOOTSTRAP_INLINE_PROOF_LIMIT || '3', 10) || 3,
  ),
);

@Injectable()
export class CiaRuntimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: WhatsAppProviderRegistry,
    private readonly whatsappApi: WhatsAppApiProvider,
    private readonly catchupService: WhatsAppCatchupService,
    private readonly agentEvents: AgentEventsService,
    private readonly workerRuntime: WorkerRuntimeService,
    @Inject(forwardRef(() => WhatsappService))
    private readonly whatsappService: WhatsappService,
    @Inject(forwardRef(() => UnifiedAgentService))
    private readonly unifiedAgent: UnifiedAgentService,
  ) {}

  async bootstrap(workspaceId: string) {
    await this.agentEvents.publish({
      type: 'thought',
      workspaceId,
      phase: 'access',
      message: 'Acessando seu WhatsApp',
    });

    const status = await this.providerRegistry.getSessionStatus(workspaceId);
    if (!status.connected) {
      const message = `Não consegui iniciar a CIA porque o WhatsApp ainda não está conectado. Status atual: ${String(
        status.status || 'desconhecido',
      ).toLowerCase()}.`;

      await this.persistRuntimeSnapshot(workspaceId, {
        state: 'ERROR',
        lastError: message,
      });
      await this.agentEvents.publish({
        type: 'error',
        workspaceId,
        phase: 'access',
        message,
        persistent: true,
        meta: {
          status: status.status,
          connected: status.connected,
        },
      });

      return {
        connected: false,
        status: status.status,
        message,
        pendingConversations: 0,
        pendingMessages: 0,
      };
    }

    await this.agentEvents.publish({
      type: 'thought',
      workspaceId,
      phase: 'access',
      message: 'Consegui acessar seu WhatsApp',
    });

    await this.agentEvents.publish({
      type: 'thought',
      workspaceId,
      phase: 'sync',
      message: 'Sincronizando suas conversas',
    });

    let pendingConversations = 0;
    let pendingMessages = 0;
    let degradedSyncMessage: string | null = null;

    try {
      const localPending = await this.listPendingConversations(workspaceId, 500);
      pendingConversations = localPending.length;
      pendingMessages = this.countPendingMessagesFromConversations(localPending);

      if (pendingConversations === 0) {
        const chats = this.normalizeChats(
          await this.whatsappApi.getChats(workspaceId),
        );
        const remotePending = this.selectRemotePendingChats(chats);

        pendingConversations = remotePending.length;
        pendingMessages = remotePending.reduce(
          (sum, chat) => sum + this.estimatePendingMessages(chat),
          0,
        );

        if (remotePending.length > 0) {
          await this.catchupService.runCatchupNow(
            workspaceId,
            'cia_bootstrap_inline',
          );

          const refreshedPending = await this.listPendingConversations(
            workspaceId,
            500,
          );
          if (refreshedPending.length > 0) {
            pendingConversations = refreshedPending.length;
            pendingMessages =
              this.countPendingMessagesFromConversations(refreshedPending);
          }
        }
      }
    } catch (err: any) {
      degradedSyncMessage = `Consegui conectar, mas não consegui contar suas conversas pendentes. Motivo: ${err?.message || 'falha ao consultar a sessão WAHA'}.`;
      await this.agentEvents.publish({
        type: 'status',
        workspaceId,
        phase: 'sync',
        message: `${degradedSyncMessage} Vou seguir no modo live para responder novas mensagens enquanto continuo sincronizando.`,
        persistent: true,
        meta: {
          degradedSync: true,
        },
      });
    }

    const catchup = await this.catchupService.triggerCatchup(
      workspaceId,
      'cia_bootstrap',
    );

    let immediateRun:
      | Awaited<ReturnType<CiaRuntimeService['startBacklogRun']>>
      | null = null;

    if (pendingConversations > 0) {
      immediateRun = await this.startBacklogRun(
        workspaceId,
        'reply_all_recent_first',
        Math.min(pendingConversations, CIA_BOOTSTRAP_IMMEDIATE_LIMIT),
        {
          autoStarted: true,
          runtimeState: 'EXECUTING_IMMEDIATELY',
          triggeredBy: 'cia_bootstrap',
        },
      );

      await this.agentEvents.publish({
        type: 'status',
        workspaceId,
        phase: 'instant_value',
        persistent: true,
        runId: immediateRun?.runId,
        message: `Já comecei a responder os ${immediateRun?.totalQueued || 0} contatos mais recentes para te provar valor agora.`,
        meta: {
          pendingConversations,
          pendingMessages,
          immediateRun,
        },
      });
    }

    if (pendingConversations === 0) {
      await this.updateWorkspaceAutonomy(workspaceId, {
        mode: 'LIVE',
        reason: degradedSyncMessage
          ? 'session_connected_degraded_sync'
          : 'session_connected',
        autopilot: {
          enabledByOwnerDecision: true,
          lastMode: 'reply_only_new',
          lastTrigger: 'cia_bootstrap',
          lastModeAt: new Date().toISOString(),
        },
        runtime: {
          state: 'LIVE_AUTONOMY',
          currentRunId: null,
          mode: 'reply_only_new',
          autoStarted: false,
        },
      });
    }

    const promptMessage =
      pendingConversations > 0
        ? `Encontrei ${pendingConversations} conversas pendentes e já iniciei as mais recentes. Quer que eu continue com todo o backlog, fique só nas novas ou pause agora?`
        : degradedSyncMessage
          ? 'Conectei seu WhatsApp, mas a leitura do backlog falhou agora. Mesmo assim, já vou responder as novas mensagens que chegarem.'
          : 'Não encontrei conversas pendentes. Vou seguir apenas com as novas mensagens que chegarem.';

    await this.persistRuntimeSnapshot(workspaceId, {
      state:
        pendingConversations > 0
          ? 'EXECUTING_IMMEDIATELY'
          : 'LIVE_READY',
      currentRunId: immediateRun?.runId,
      pendingConversations,
      pendingMessages,
      degradedSync: Boolean(degradedSyncMessage),
      lastError: degradedSyncMessage,
      lastBootstrapAt: new Date().toISOString(),
      lastCatchupScheduled: catchup.scheduled,
    });

    await this.agentEvents.publish({
      type: 'backlog',
      workspaceId,
      phase: 'backlog',
      message:
        pendingConversations > 0
          ? `Encontrei ${pendingConversations} conversas pendentes e ${pendingMessages} mensagens acumuladas.`
          : degradedSyncMessage
            ? 'Não consegui medir o backlog agora, mas a autonomia live foi ativada para responder novas mensagens.'
            : 'Não encontrei backlog pendente no seu WhatsApp.',
      persistent: true,
      meta: {
        pendingConversations,
        pendingMessages,
        degradedSync: Boolean(degradedSyncMessage),
        catchup,
      },
    });

    await this.agentEvents.publish({
      type: 'prompt',
      workspaceId,
      phase: 'owner_decision',
      message: promptMessage,
      persistent: true,
      meta: {
        options: [
          {
            id: 'reply_all_recent_first',
            label: 'Continuar todo o backlog',
          },
          {
            id: 'reply_only_new',
            label: 'Ficar só nas novas',
          },
          {
            id: 'prioritize_hot',
            label: 'Priorizar clientes quentes',
          },
          {
            id: 'pause_autonomy',
            label: 'Pausar agora',
          },
        ],
        pendingConversations,
        pendingMessages,
        immediateRun,
      },
    });

    return {
      connected: true,
      status: status.status,
      pendingConversations,
      pendingMessages,
      catchup,
      immediateRun,
      autoStarted: !!immediateRun,
      message: degradedSyncMessage || promptMessage,
      options: [
        'reply_all_recent_first',
        'reply_only_new',
        'prioritize_hot',
        'pause_autonomy',
      ],
    };
  }

  async startBacklogRun(
    workspaceId: string,
    mode: BacklogMode = 'reply_all_recent_first',
    limit?: number,
    options?: {
      autoStarted?: boolean;
      runtimeState?: string;
      triggeredBy?: string;
    },
  ) {
    const status = await this.providerRegistry.getSessionStatus(workspaceId);
    if (!status.connected) {
      const message =
        'Não consigo iniciar o backlog porque o WhatsApp não está conectado.';
      await this.agentEvents.publish({
        type: 'error',
        workspaceId,
        phase: 'backlog_start',
        message,
        persistent: true,
      });
      return {
        queued: false,
        message,
      };
    }

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });

    const settings = (workspace?.providerSettings as any) || {};
    const triggeredBy = options?.triggeredBy || 'owner_command';
    const autonomyMode: WorkspaceAutonomyMode =
      triggeredBy === 'autopilot_total'
        ? 'FULL'
        : mode === 'reply_only_new' || options?.autoStarted === true
          ? 'LIVE'
          : 'BACKLOG';

    const runId = randomUUID();
    const queueLimit = Math.max(1, Math.min(2000, Number(limit || 500) || 500));

    await this.createAutonomyRun(runId, workspaceId, autonomyMode, {
      backlogMode: mode,
      autoStarted: options?.autoStarted === true,
      triggeredBy,
      limit: queueLimit,
    });

    await this.updateWorkspaceAutonomy(workspaceId, {
      mode: autonomyMode,
      reason: triggeredBy,
      autopilot: {
        enabledByOwnerDecision: true,
        lastMode: mode,
        lastTrigger: triggeredBy,
        lastModeAt: new Date().toISOString(),
      },
      runtime: {
        currentRunId: runId,
        state:
          mode === 'reply_only_new'
            ? 'LIVE_AUTONOMY'
            : options?.runtimeState || 'EXECUTING_BACKLOG',
        mode,
        startedAt: new Date().toISOString(),
        autoStarted: options?.autoStarted === true,
      },
      autonomy: {
        reactiveEnabled: true,
        proactiveEnabled: autonomyMode === 'FULL',
        autoBootstrapOnConnected:
          ((settings.autonomy as any)?.autoBootstrapOnConnected ?? true),
      },
    });

    if (mode === 'reply_only_new') {
      await this.updateAutonomyRunStatus(runId, 'COMPLETED');

      await this.agentEvents.publish({
        type: 'status',
        workspaceId,
        phase: 'live_ready',
        message:
          'Autonomia ativa. Vou responder automaticamente apenas as novas mensagens a partir de agora.',
        persistent: true,
        runId,
      });

      return {
        queued: true,
        runId,
        mode,
        message:
          'Autonomia ativa para novas mensagens. Nenhum sweep de backlog foi iniciado.',
      };
    }

    let previewCandidates = await this.listPendingConversations(
      workspaceId,
      queueLimit,
    );

    if (!previewCandidates.length) {
      await this.catchupService
        .runCatchupNow(workspaceId, `cia_backlog_${triggeredBy}`)
        .catch(() => ({ scheduled: false }));
      previewCandidates = await this.listPendingConversations(
        workspaceId,
        queueLimit,
      );
    }

    const inlineProofCandidates =
      options?.autoStarted && previewCandidates.length > 0
        ? previewCandidates.slice(
            0,
            this.resolveBootstrapInlineProofLimit(queueLimit),
          )
        : [];

    let inlineProofResult:
      | {
          processed: number;
          skipped: number;
          message: string;
        }
      | null = null;

    if (inlineProofCandidates.length > 0) {
        inlineProofResult = await this.runBacklogInlineFallback(
          workspaceId,
          runId,
          mode,
          inlineProofCandidates,
          {
            reason: 'bootstrap_proof',
          },
        );
    }

    const workerAvailable = await this.workerRuntime.isAvailable();
    if (!workerAvailable) {
      const inlineCandidates = previewCandidates.slice(
        inlineProofCandidates.length,
        inlineProofCandidates.length +
          this.resolveInlineBacklogFallbackLimit(queueLimit),
      );
      const inlineResult = await this.runBacklogInlineFallback(
        workspaceId,
        runId,
        mode,
        inlineCandidates,
        {
          reason: 'worker_unavailable',
        },
      );

      return {
        queued: true,
        runId,
        mode,
        totalQueued: previewCandidates.length,
        autoStarted: options?.autoStarted === true,
        inlineFallback: true,
        inlineProofProcessed: inlineProofResult?.processed || 0,
        inlineProofSkipped: inlineProofResult?.skipped || 0,
        processedInline:
          (inlineProofResult?.processed || 0) + inlineResult.processed,
        skippedInline:
          (inlineProofResult?.skipped || 0) + inlineResult.skipped,
        message: inlineResult.message,
      };
    }

    await autopilotQueue.add(
      'sweep-unread-conversations',
      {
        workspaceId,
        runId,
        limit: queueLimit,
        mode,
      },
      {
        jobId: buildQueueJobId('cia-backlog', workspaceId, runId),
        removeOnComplete: true,
      },
    );

    await this.agentEvents.publish({
      type: 'status',
      workspaceId,
      phase: 'backlog_start',
      runId,
      persistent: true,
        message:
          options?.autoStarted
          ? `Autoexecução iniciada com ${previewCandidates.length} conversas elegíveis para gerar valor imediato.`
          : mode === 'prioritize_hot'
          ? `Vou priorizar os contatos mais recentes e mais quentes. Preparei ${previewCandidates.length} conversas elegíveis para começar.`
          : `Irei responder ${previewCandidates.length} conversas elegíveis por ordem dos mais recentes primeiro.`,
      meta: {
        totalQueued: previewCandidates.length,
        mode,
        autoStarted: options?.autoStarted === true,
      },
    });

    return {
      queued: true,
      runId,
      mode,
      totalQueued: previewCandidates.length,
      autoStarted: options?.autoStarted === true,
      inlineProofProcessed: inlineProofResult?.processed || 0,
      inlineProofSkipped: inlineProofResult?.skipped || 0,
      message:
        options?.autoStarted
          ? 'Autoexecução imediata iniciada.'
          : mode === 'prioritize_hot'
          ? 'Backlog enfileirado com prioridade para contatos quentes.'
          : 'Backlog enfileirado por ordem dos mais recentes.',
    };
  }

  async getOperationalIntelligence(workspaceId: string) {
    const [workspace, businessState, marketSignals, humanTasks, demandStates, insights] =
      await Promise.all([
        this.prisma.workspace.findUnique({
          where: { id: workspaceId },
          select: {
            name: true,
            providerSettings: true,
          },
        }),
        this.prisma.kloelMemory.findUnique({
          where: {
            workspaceId_key: {
              workspaceId,
              key: 'business_state:current',
            },
          },
        }),
        this.prisma.kloelMemory.findMany({
          where: {
            workspaceId,
            category: 'market_signal',
          },
          orderBy: { updatedAt: 'desc' },
          take: 10,
        }),
        this.prisma.kloelMemory.findMany({
          where: {
            workspaceId,
            category: 'human_task',
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        this.prisma.kloelMemory.findMany({
          where: {
            workspaceId,
            category: 'demand_control',
          },
          orderBy: { updatedAt: 'desc' },
          take: 20,
        }),
        this.prisma.systemInsight.findMany({
          where: {
            workspaceId,
            type: {
              in: [
                'CIA_HUMAN_TASK',
                'CIA_MARKET_SIGNAL',
                'CIA_GLOBAL_LEARNING',
              ],
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      ]);

    return {
      workspaceName: workspace?.name || null,
      runtime: ((workspace?.providerSettings as any) || {}).ciaRuntime || null,
      autonomy: ((workspace?.providerSettings as any) || {}).autonomy || null,
      businessState: businessState?.value || null,
      marketSignals: marketSignals.map((item) => item.value),
      humanTasks: humanTasks.map((item) => item.value),
      demandStates: demandStates.map((item) => item.value),
      insights,
    };
  }

  async activateAutopilotTotal(workspaceId: string, limit?: number) {
    const bootstrap = await this.bootstrap(workspaceId);
    if (!bootstrap.connected) {
      return bootstrap;
    }

    const fullRun = await this.startBacklogRun(
      workspaceId,
      'reply_all_recent_first',
      limit,
      {
        autoStarted: true,
        runtimeState: 'EXECUTING_BACKLOG',
        triggeredBy: 'autopilot_total',
      },
    );

    await this.agentEvents.publish({
      type: 'status',
      workspaceId,
      phase: 'autopilot_total',
      persistent: true,
      runId: fullRun.runId,
      message:
        'Autopilot Total ativado. Vou assumir backlog, novas mensagens e ciclo contínuo do seu WhatsApp.',
      meta: {
        fullRun,
      },
    });

    return {
      ...bootstrap,
      fullRun,
      autopilotTotal: true,
    };
  }

  async pauseAutonomy(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });

    const settings = (workspace?.providerSettings as any) || {};
    const currentRunId = settings?.ciaRuntime?.currentRunId as string | undefined;

    await this.updateWorkspaceAutonomy(workspaceId, {
      mode: 'OFF',
      reason: 'manual_pause',
      autopilot: {
        pausedAt: new Date().toISOString(),
      },
      runtime: {
        state: 'PAUSED',
      },
      autonomy: {
        reactiveEnabled: false,
        proactiveEnabled: false,
        autoBootstrapOnConnected:
          ((settings.autonomy as any)?.autoBootstrapOnConnected ?? true),
      },
    });
    await this.updateAutonomyRunStatus(currentRunId, 'PAUSED');

    await this.agentEvents.publish({
      type: 'status',
      workspaceId,
      phase: 'paused',
      persistent: true,
      message: 'Autonomia pausada. Vou parar de agir até você me reativar.',
    });

    return {
      paused: true,
      state: 'PAUSED',
    };
  }

  async resumeConversationAutonomy(
    workspaceId: string,
    conversationId: string,
  ) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        workspaceId,
      },
      select: {
        id: true,
        mode: true,
        contactId: true,
        contact: {
          select: {
            name: true,
            phone: true,
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversa não encontrada');
    }

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { mode: 'AI', assignedAgentId: null },
    });

    await this.agentEvents.publish({
      type: 'status',
      workspaceId,
      phase: 'conversation_resumed',
      persistent: true,
      message: `Retomei a autonomia da conversa com ${conversation.contact?.name || conversation.contact?.phone || 'o contato'}.`,
      meta: {
        conversationId,
        contactId: conversation.contactId,
        phone: conversation.contact?.phone || null,
        previousMode: conversation.mode,
        mode: 'AI',
      },
    });

    return {
      conversationId,
      mode: 'AI',
      resumed: true,
    };
  }

  private async listPendingConversations(
    workspaceId: string,
    limit: number,
  ) {
    const conversations =
      (await this.prisma.conversation.findMany({
        where: {
          workspaceId,
          status: { not: 'CLOSED' },
        },
        select: {
          id: true,
          status: true,
          mode: true,
          assignedAgentId: true,
          unreadCount: true,
          lastMessageAt: true,
          contactId: true,
          contact: {
            select: {
              id: true,
              phone: true,
              name: true,
            },
          },
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              direction: true,
              createdAt: true,
              content: true,
            },
          },
        },
        orderBy: { lastMessageAt: 'desc' },
        take: Math.max(1, Math.min(2000, Number(limit || 500) || 500)),
      })) || [];

    return conversations
      .map((conversation: any) => ({
        ...conversation,
        operational: buildConversationOperationalState(conversation),
      }))
      .filter((conversation: any) => conversation.operational.pending);
  }

  private countPendingMessagesFromConversations(conversations: any[]): number {
    return conversations.reduce(
      (sum, conversation) =>
        sum + Math.max(1, Number(conversation.pendingMessages || 0) || 0),
      0,
    );
  }

  private selectRemotePendingChats(chats: WahaChatSummary[]): WahaChatSummary[] {
    const since = Date.now() - CIA_BOOTSTRAP_REMOTE_LOOKBACK_MS;

    return [...chats]
      .filter(
        (chat) =>
          (chat.unreadCount || 0) > 0 ||
          this.resolveChatActivityTimestamp(chat) >= since,
      )
      .sort((left, right) => {
        const unreadDiff =
          (Number(right.unreadCount || 0) || 0) -
          (Number(left.unreadCount || 0) || 0);
        if (unreadDiff !== 0) {
          return unreadDiff;
        }

        return (
          this.resolveChatActivityTimestamp(right) -
          this.resolveChatActivityTimestamp(left)
        );
      });
  }

  private estimatePendingMessages(chat: WahaChatSummary): number {
    return Math.max(1, Number(chat.unreadCount || 0) || 0);
  }

  private resolveChatActivityTimestamp(chat: WahaChatSummary): number {
    return Math.max(
      Number(chat.timestamp || 0) || 0,
      Number(chat.lastMessageTimestamp || 0) || 0,
    );
  }

  private resolveInlineBacklogFallbackLimit(limit: number): number {
    return Math.max(
      1,
      Math.min(
        CIA_INLINE_BACKLOG_FALLBACK_LIMIT,
        Math.max(1, Math.min(2000, Number(limit || 1) || 1)),
      ),
    );
  }

  private resolveBootstrapInlineProofLimit(limit: number): number {
    return Math.max(
      1,
      Math.min(
        CIA_BOOTSTRAP_INLINE_PROOF_LIMIT,
        Math.max(1, Math.min(2000, Number(limit || 1) || 1)),
      ),
    );
  }

  private async runBacklogInlineFallback(
    workspaceId: string,
    runId: string,
    mode: BacklogMode,
    conversations: any[],
    options?: {
      reason?: 'worker_unavailable' | 'bootstrap_proof';
    },
  ) {
    const reason = options?.reason || 'worker_unavailable';
    if (!conversations.length) {
      await this.updateAutonomyRunStatus(runId, 'COMPLETED');
      return {
        processed: 0,
        skipped: 0,
        message:
          'Worker indisponível e nenhuma conversa elegível foi encontrada para fallback inline.',
      };
    }

    await this.agentEvents.publish({
      type: 'status',
      workspaceId,
      runId,
      phase: 'backlog_inline_fallback',
      persistent: true,
      message:
        reason === 'bootstrap_proof'
          ? `Já comecei a responder ${conversations.length} conversas inline para gerar valor imediato enquanto o backlog continua.`
          : `Worker indisponível. Vou responder ${conversations.length} conversas inline agora para não deixar o WhatsApp parado.`,
      meta: {
        total: conversations.length,
        mode,
        reason,
      },
    });

    let processed = 0;
    let skipped = 0;

    for (const [index, conversation] of conversations.entries()) {
      const lastMessage = conversation?.messages?.[0];
      const messageContent = String(lastMessage?.content || '').trim();
      const messageDirection = String(lastMessage?.direction || '')
        .trim()
        .toUpperCase();
      const phone = String(conversation?.contact?.phone || '').trim();

      if (!phone || !messageContent || messageDirection !== 'INBOUND') {
        skipped += 1;
        continue;
      }

      await this.agentEvents.publish({
        type: 'thought',
        workspaceId,
        runId,
        phase: 'backlog_inline_contact',
        message: `Respondendo inline ${conversation?.contact?.name || phone} (${index + 1}/${conversations.length}).`,
        meta: {
          conversationId: conversation?.id || null,
          contactId: conversation?.contactId || null,
          phone,
          backlogIndex: index + 1,
          backlogTotal: conversations.length,
        },
      });

      try {
        const result = await this.unifiedAgent.processIncomingMessage({
          workspaceId,
          contactId: conversation?.contactId || undefined,
          phone,
          message: messageContent,
          channel: 'whatsapp',
          context: {
            source: 'cia_backlog_inline',
            deliveryMode: 'reactive',
            conversationId: conversation?.id || null,
            runId,
            backlogIndex: index + 1,
            backlogTotal: conversations.length,
            forceDirect: true,
          },
        });

        if (this.hasOutboundAction(result.actions || [])) {
          processed += 1;
          continue;
        }

        const reply = String(
          result.reply ||
            result.response ||
            this.buildInlineFallbackReply(messageContent),
        ).trim();
        if (!reply) {
          skipped += 1;
          continue;
        }

        const sendResult = await this.whatsappService.sendMessage(
          workspaceId,
          phone,
          reply,
          {
            externalId: `cia-inline:${runId}:${conversation?.id || conversation?.contactId || index}`,
            complianceMode: 'reactive',
            forceDirect: true,
          },
        );

        if ((sendResult as any)?.error) {
          skipped += 1;
          continue;
        }

        processed += 1;
      } catch {
        skipped += 1;
      }
    }

    await this.updateAutonomyRunStatus(runId, 'COMPLETED');

    const message =
      processed > 0
        ? reason === 'bootstrap_proof'
          ? `Execução inline imediata concluída. Respondi ${processed} conversa(s) ao iniciar a autonomia.`
          : `Fallback inline concluído. Respondi ${processed} conversa(s) enquanto o worker estava indisponível.`
        : reason === 'bootstrap_proof'
          ? 'Execução inline imediata concluída, mas nenhuma conversa gerou resposta enviada.'
          : 'Fallback inline executado, mas nenhuma conversa gerou resposta enviada.';

    await this.agentEvents.publish({
      type: 'status',
      workspaceId,
      runId,
      phase: 'backlog_inline_done',
      persistent: true,
      message,
      meta: {
        processed,
        skipped,
        mode,
        reason,
      },
    });

    return {
      processed,
      skipped,
      message,
    };
  }

  private hasOutboundAction(
    actions: Array<{ tool?: string; result?: Record<string, any> }> = [],
  ): boolean {
    const outboundTools = new Set([
      'send_message',
      'send_product_info',
      'create_payment_link',
      'send_media',
      'send_document',
      'send_voice_note',
      'send_audio',
    ]);

    return actions.some((action) => {
      if (!outboundTools.has(String(action?.tool || ''))) {
        return false;
      }

      return (
        action?.result?.sent === true ||
        action?.result?.success === true ||
        action?.result?.messageId
      );
    });
  }

  private buildInlineFallbackReply(messageContent: string): string {
    const normalized = String(messageContent || '').trim().toLowerCase();

    if (
      /(pre[cç]o|quanto|valor|custa|comprar|boleto|pix|pagamento)/i.test(
        normalized,
      )
    ) {
      return 'Posso te ajudar com valores e pagamento. Me diga qual produto ou oferta você quer consultar.';
    }

    if (/(agendar|agenda|reuni[aã]o|hor[aá]rio|marcar)/i.test(normalized)) {
      return 'Posso te ajudar a agendar. Me envie a data ou o melhor horário para seguir.';
    }

    if (/(ol[áa]|bom dia|boa tarde|boa noite|oi\b)/i.test(normalized)) {
      return 'Olá! Como posso ajudar você agora?';
    }

    return 'Recebi sua mensagem. Vou seguir com seu atendimento agora.';
  }

  private normalizeChats(raw: any): WahaChatSummary[] {
    const candidates = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.chats)
        ? raw.chats
        : Array.isArray(raw?.items)
          ? raw.items
          : Array.isArray(raw?.data)
            ? raw.data
            : [];

    return candidates
      .map((chat: any) => {
        const activityTimestamp = this.resolveChatTimestamp([
          chat?.conversationTimestamp,
          chat?.lastMessageRecvTimestamp,
          chat?.lastMessageSentTimestamp,
          chat?.lastMessageTimestamp,
          chat?.timestamp,
          chat?.t,
          chat?.createdAt,
          chat?.last_time,
        ]);

        const lastMessageTimestamp = this.resolveChatTimestamp([
          chat?.lastMessageRecvTimestamp,
          chat?.lastMessageSentTimestamp,
          chat?.lastMessageTimestamp,
          chat?.conversationTimestamp,
          chat?.timestamp,
          chat?.t,
          chat?.createdAt,
          chat?.last_time,
        ]);

        return {
          id:
            chat?.id?._serialized ||
            chat?.id ||
            chat?.chatId ||
            chat?.wid ||
            '',
          unreadCount: Number(chat?.unreadCount || chat?.unread || 0) || 0,
          timestamp: activityTimestamp,
          lastMessageTimestamp,
        };
      })
      .filter((chat) => !!chat.id);
  }

  private resolveChatTimestamp(candidates: unknown[]): number {
    for (const candidate of candidates) {
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        return candidate > 1e12 ? candidate : candidate * 1000;
      }

      if (typeof candidate === 'string') {
        const numeric = Number(candidate);
        if (Number.isFinite(numeric) && numeric > 0) {
          return numeric > 1e12 ? numeric : numeric * 1000;
        }

        const date = new Date(candidate);
        if (!Number.isNaN(date.getTime())) {
          return date.getTime();
        }
      }
    }

    return 0;
  }

  private async persistRuntimeSnapshot(
    workspaceId: string,
    update: Record<string, any>,
  ) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });

    if (!workspace) return;

    const settings = (workspace.providerSettings as any) || {};

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        providerSettings: {
          ...settings,
          ciaRuntime: {
            ...((settings.ciaRuntime as any) || {}),
            ...update,
          },
        },
      },
    });
  }

  private async updateWorkspaceAutonomy(
    workspaceId: string,
    input: {
      mode: WorkspaceAutonomyMode;
      reason: string;
      autopilot?: Record<string, any>;
      runtime?: Record<string, any>;
      autonomy?: Record<string, any>;
    },
  ) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });

    if (!workspace) return;

    const settings = (workspace.providerSettings as any) || {};
    const autonomy = (settings.autonomy as any) || {};
    const now = new Date().toISOString();
    const autopilotEnabled = ['LIVE', 'BACKLOG', 'FULL'].includes(input.mode);

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        providerSettings: {
          ...settings,
          autopilot: {
            ...(settings.autopilot || {}),
            enabled: autopilotEnabled,
            ...input.autopilot,
          },
          autonomy: {
            ...autonomy,
            autoBootstrapOnConnected:
              input.autonomy?.autoBootstrapOnConnected ??
              autonomy.autoBootstrapOnConnected ??
              true,
            reactiveEnabled:
              input.autonomy?.reactiveEnabled ??
              (input.mode === 'OFF' ||
              input.mode === 'HUMAN_ONLY' ||
              input.mode === 'SUSPENDED'
                ? false
                : true),
            proactiveEnabled:
              input.autonomy?.proactiveEnabled ?? input.mode === 'FULL',
            mode: input.mode,
            reason: input.reason,
            lastTransitionAt: now,
          },
          ciaRuntime: {
            ...((settings.ciaRuntime as any) || {}),
            ...(input.runtime || {}),
          },
        },
      },
    });
  }

  private async createAutonomyRun(
    runId: string,
    workspaceId: string,
    mode: WorkspaceAutonomyMode,
    meta?: Record<string, any>,
  ) {
    const client: any = this.prisma as any;
    if (!client.autonomyRun) return;

    try {
      await client.autonomyRun.create({
        data: {
          id: runId,
          workspaceId,
          mode,
          status: 'RUNNING',
          meta,
        },
      });
    } catch {
      // best-effort during rollout
    }
  }

  private async updateAutonomyRunStatus(
    runId: string | undefined,
    status: string,
  ) {
    if (!runId) return;

    const client: any = this.prisma as any;
    if (!client.autonomyRun) return;

    try {
      await client.autonomyRun.update({
        where: { id: runId },
        data: {
          status,
          endedAt:
            status === 'COMPLETED' || status === 'FAILED' || status === 'PAUSED'
              ? new Date()
              : undefined,
        },
      });
    } catch {
      // ignore
    }
  }
}
