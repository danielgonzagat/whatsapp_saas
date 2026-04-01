import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  forwardRef,
} from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import type Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { autopilotQueue } from '../queue/queue';
import { buildQueueJobId } from '../queue/job-id.util';
import { WahaChatSummary } from './providers/whatsapp-api.provider';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { WhatsAppCatchupService } from './whatsapp-catchup.service';
import { AgentEventsService } from './agent-events.service';
import { buildConversationOperationalState } from './agent-conversation-state.util';
import { WorkerRuntimeService } from './worker-runtime.service';
import { UnifiedAgentService } from '../kloel/unified-agent.service';
import { WhatsappService } from './whatsapp.service';
import {
  asProviderSettings,
  type ProviderSettings,
  type ProviderAutonomySettings,
  type ProviderCiaRuntime,
} from './provider-settings.types';

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
      `${30 * 24 * 60 * 60 * 1000}`,
    10,
  ) || 30 * 24 * 60 * 60 * 1000,
);
const CIA_REMOTE_PENDING_MAX_AGE_MS = Math.max(
  60_000,
  parseInt(
    process.env.CIA_REMOTE_PENDING_MAX_AGE_MS ||
      process.env.CIA_BOOTSTRAP_REMOTE_LOOKBACK_MS ||
      `${30 * 24 * 60 * 60 * 1000}`,
    10,
  ) || 30 * 24 * 60 * 60 * 1000,
);
const CIA_REMOTE_UNKNOWN_PENDING_MAX_AGE_MS = Math.max(
  CIA_REMOTE_PENDING_MAX_AGE_MS,
  parseInt(
    process.env.CIA_REMOTE_UNKNOWN_PENDING_MAX_AGE_MS ||
      `${30 * 24 * 60 * 60 * 1000}`,
    10,
  ) || 30 * 24 * 60 * 60 * 1000,
);
const CIA_INLINE_BACKLOG_FALLBACK_LIMIT = Math.max(
  1,
  Math.min(
    50,
    parseInt(process.env.CIA_INLINE_BACKLOG_FALLBACK_LIMIT || '10', 10) || 10,
  ),
);
const CIA_BOOTSTRAP_AUTO_CONTINUE =
  String(process.env.CIA_BOOTSTRAP_AUTO_CONTINUE || 'true').toLowerCase() !==
  'false';
const CIA_BOOTSTRAP_AUTO_CONTINUE_LIMIT = Math.max(
  1,
  Math.min(
    2000,
    parseInt(process.env.CIA_BOOTSTRAP_AUTO_CONTINUE_LIMIT || '500', 10) || 500,
  ),
);
const CIA_SHARED_REPLY_LOCK_MS = Math.max(
  10_000,
  parseInt(process.env.AUTOPILOT_SHARED_REPLY_LOCK_MS || '45000', 10) || 45_000,
);
const CIA_CONTACT_CATALOG_LOOKBACK_DAYS = Math.max(
  7,
  parseInt(process.env.CIA_CONTACT_CATALOG_LOOKBACK_DAYS || '30', 10) || 30,
);
const CIA_RUNTIME_STALE_RUN_MS = Math.max(
  60_000,
  parseInt(process.env.CIA_RUNTIME_STALE_RUN_MS || `${10 * 60 * 1000}`, 10) ||
    10 * 60 * 1000,
);

@Injectable()
export class CiaRuntimeService implements OnModuleDestroy {
  private readonly logger = new Logger(CiaRuntimeService.name);
  private readonly presenceHeartbeatMs = Math.max(
    10_000,
    parseInt(process.env.CIA_PRESENCE_HEARTBEAT_MS || '25000', 10) || 25_000,
  );
  private readonly presenceHeartbeats = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: WhatsAppProviderRegistry,
    @Inject(forwardRef(() => WhatsAppCatchupService))
    private readonly catchupService: WhatsAppCatchupService,
    private readonly agentEvents: AgentEventsService,
    private readonly workerRuntime: WorkerRuntimeService,
    @InjectRedis() private readonly redis: Redis,
    @Inject(forwardRef(() => WhatsappService))
    private readonly whatsappService: WhatsappService,
    @Inject(forwardRef(() => UnifiedAgentService))
    private readonly unifiedAgent: UnifiedAgentService,
  ) {}

  onModuleDestroy() {
    for (const workspaceId of this.presenceHeartbeats.keys()) {
      this.stopPresenceHeartbeat(workspaceId, false).catch(() => undefined);
    }
  }

  private async startPresenceHeartbeat(workspaceId: string) {
    if (
      process.env.NODE_ENV === 'test' ||
      this.presenceHeartbeats.has(workspaceId)
    ) {
      return;
    }

    await this.providerRegistry
      .setPresence(workspaceId, 'available')
      .catch(() => undefined);

    let failCount = 0;
    const timer = setInterval(() => {
      void this.providerRegistry
        .setPresence(workspaceId, 'available')
        .then(() => {
          failCount = 0;
        })
        .catch(() => {
          failCount++;
          if (failCount >= 3) {
            clearInterval(timer);
            this.presenceHeartbeats.delete(workspaceId);
            this.logger.warn(
              `Presence heartbeat stopped for ${workspaceId} after 3 consecutive failures`,
            );
          }
        });
    }, this.presenceHeartbeatMs);

    this.presenceHeartbeats.set(workspaceId, timer);
  }

  private async resolveActiveSessionKey(workspaceId: string): Promise<string> {
    await this.providerRegistry.getSessionStatus(workspaceId).catch(() => null);
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const settings = asProviderSettings(workspace?.providerSettings);
    return (
      String(
        settings?.whatsappWebSession?.sessionName ||
          settings?.whatsappApiSession?.sessionName ||
          '',
      ).trim() || workspaceId
    );
  }

  private async stopPresenceHeartbeat(workspaceId: string, setOffline = true) {
    const existing = this.presenceHeartbeats.get(workspaceId);
    if (existing) {
      clearInterval(existing);
      this.presenceHeartbeats.delete(workspaceId);
    }

    if (setOffline) {
      await this.providerRegistry
        .setPresence(workspaceId, 'offline')
        .catch(() => undefined);
    }
  }

  async bootstrap(workspaceId: string) {
    await this.agentEvents.publish({
      type: 'thought',
      workspaceId,
      phase: 'access',
      message: 'Acessando seu WhatsApp',
    });

    const status = await this.providerRegistry.getSessionStatus(workspaceId);
    if (!status.connected) {
      await this.stopPresenceHeartbeat(workspaceId, false);
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

    await this.startPresenceHeartbeat(workspaceId);

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
      const localPending = await this.listPendingConversations(
        workspaceId,
        500,
      );
      pendingConversations = localPending.length;
      pendingMessages =
        this.countPendingMessagesFromConversations(localPending);

      if (pendingConversations === 0) {
        const chats = this.normalizeChats(
          await this.providerRegistry.getChats(workspaceId),
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

    let immediateRun: Awaited<
      ReturnType<CiaRuntimeService['startBacklogRun']>
    > | null = null;
    const autoContinueBacklog =
      pendingConversations > 0 && CIA_BOOTSTRAP_AUTO_CONTINUE;
    const bootstrapRunLimit = autoContinueBacklog
      ? Math.min(pendingConversations, CIA_BOOTSTRAP_AUTO_CONTINUE_LIMIT)
      : Math.min(pendingConversations, CIA_BOOTSTRAP_IMMEDIATE_LIMIT);

    if (pendingConversations > 0) {
      immediateRun = await this.startBacklogRun(
        workspaceId,
        'reply_all_recent_first',
        bootstrapRunLimit,
        {
          autoStarted: true,
          runtimeState: autoContinueBacklog
            ? 'EXECUTING_BACKLOG'
            : 'EXECUTING_IMMEDIATELY',
          triggeredBy: 'autopilot_total',
        },
      );

      await this.agentEvents.publish({
        type: 'status',
        workspaceId,
        phase: 'instant_value',
        persistent: true,
        runId: immediateRun?.runId,
        message: autoContinueBacklog
          ? `Já comecei a tratar ${immediateRun?.totalQueued || 0} conversas pendentes automaticamente.`
          : `Já comecei a responder os ${immediateRun?.totalQueued || 0} contatos mais recentes para te provar valor agora.`,
        meta: {
          pendingConversations,
          pendingMessages,
          immediateRun,
          autoContinueBacklog,
        },
      });
    }

    if (pendingConversations === 0) {
      await this.updateWorkspaceAutonomy(workspaceId, {
        mode: 'FULL',
        reason: degradedSyncMessage
          ? 'session_connected_degraded_sync'
          : 'session_connected_autopilot_total',
        autopilot: {
          enabledByOwnerDecision: true,
          lastMode: 'reply_only_new',
          lastTrigger: 'autopilot_total',
          lastModeAt: new Date().toISOString(),
        },
        runtime: {
          state: 'LIVE_READY',
          currentRunId: null,
          mode: 'reply_only_new',
          autoStarted: false,
        },
        autonomy: {
          reactiveEnabled: true,
          proactiveEnabled: false,
          autoBootstrapOnConnected: true,
        },
      });

      await this.scheduleContactCatalogRefresh(
        workspaceId,
        degradedSyncMessage ? 'bootstrap_degraded_idle' : 'bootstrap_idle',
      );
    }

    const runtimeMessage =
      pendingConversations > 0
        ? autoContinueBacklog
          ? `Encontrei ${pendingConversations} conversas pendentes e já iniciei o backlog automaticamente. Vou continuar agindo sem parar enquanto o WhatsApp permanecer conectado.`
          : `Encontrei ${pendingConversations} conversas pendentes e já iniciei as mais recentes. Vou continuar o backlog e manter a resposta ao vivo sem esperar comandos.`
        : degradedSyncMessage
          ? 'Conectei seu WhatsApp, mas a leitura do backlog falhou agora. Mesmo assim, já vou responder as novas mensagens que chegarem.'
          : 'Não encontrei conversas pendentes. Vou responder novas mensagens em tempo real e aproveitar a ociosidade para catalogar os contatos dos últimos 30 dias.';

    await this.persistRuntimeSnapshot(workspaceId, {
      state:
        pendingConversations > 0
          ? autoContinueBacklog
            ? 'EXECUTING_BACKLOG'
            : 'EXECUTING_IMMEDIATELY'
          : 'LIVE_READY',
      currentRunId: immediateRun?.runId,
      pendingConversations,
      pendingMessages,
      degradedSync: Boolean(degradedSyncMessage),
      lastError: degradedSyncMessage,
      lastBootstrapAt: new Date().toISOString(),
      lastCatchupScheduled: catchup.scheduled,
      catalogLookbackDays: CIA_CONTACT_CATALOG_LOOKBACK_DAYS,
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
      type: 'status',
      workspaceId,
      phase: 'autopilot_total',
      message: runtimeMessage,
      persistent: true,
      meta: {
        mode: pendingConversations > 0 ? 'FULL_BACKLOG' : 'FULL_LIVE',
        pendingConversations,
        pendingMessages,
        immediateRun,
        autoContinueBacklog,
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
      message: degradedSyncMessage || runtimeMessage,
      options: [],
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

    const settings = asProviderSettings(workspace?.providerSettings);
    const triggeredBy = options?.triggeredBy || 'owner_command';
    const autonomyMode: WorkspaceAutonomyMode =
      triggeredBy === 'autopilot_total'
        ? 'FULL'
        : mode === 'reply_only_new'
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
        proactiveEnabled: false,
        autoBootstrapOnConnected:
          settings.autonomy?.autoBootstrapOnConnected ?? true,
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

    if (!previewCandidates.length) {
      const remoteChats = await this.listRemotePendingChats(
        workspaceId,
        this.resolveInlineBacklogFallbackLimit(queueLimit),
      );
      if (remoteChats.length > 0) {
        const remoteResult = await this.runRemoteBacklogInlineFallback(
          workspaceId,
          runId,
          mode,
          remoteChats,
        );

        return {
          queued: true,
          runId,
          mode,
          totalQueued: remoteChats.length,
          autoStarted: options?.autoStarted === true,
          inlineFallback: true,
          remoteInlineFallback: true,
          processedInline: remoteResult.processed,
          skippedInline: remoteResult.skipped,
          message: remoteResult.message,
        };
      }
    }

    const workerAvailable = await this.workerRuntime.isAvailable();
    if (!workerAvailable) {
      const inlineCandidates = previewCandidates.slice(
        0,
        this.resolveInlineBacklogFallbackLimit(queueLimit),
      );
      const inlineResult = await this.runBacklogInlineFallback(
        workspaceId,
        runId,
        mode,
        inlineCandidates,
      );

      return {
        queued: true,
        runId,
        mode,
        totalQueued: previewCandidates.length,
        autoStarted: options?.autoStarted === true,
        inlineFallback: true,
        processedInline: inlineResult.processed,
        skippedInline: inlineResult.skipped,
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
      message: options?.autoStarted
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
      message: options?.autoStarted
        ? 'Autoexecução imediata iniciada.'
        : mode === 'prioritize_hot'
          ? 'Backlog enfileirado com prioridade para contatos quentes.'
          : 'Backlog enfileirado por ordem dos mais recentes.',
    };
  }

  async getOperationalIntelligence(workspaceId: string) {
    const [
      workspace,
      businessState,
      marketSignals,
      humanTasks,
      demandStates,
      insights,
    ] = await Promise.all([
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
        select: { id: true, key: true, value: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
      this.prisma.kloelMemory.findMany({
        where: {
          workspaceId,
          category: 'human_task',
        },
        select: { id: true, key: true, value: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.kloelMemory.findMany({
        where: {
          workspaceId,
          category: 'demand_control',
        },
        select: { id: true, key: true, value: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      }),
      this.prisma.systemInsight.findMany({
        where: {
          workspaceId,
          type: {
            in: ['CIA_HUMAN_TASK', 'CIA_MARKET_SIGNAL', 'CIA_GLOBAL_LEARNING'],
          },
        },
        select: { id: true, type: true, title: true, description: true, metadata: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    return {
      workspaceName: workspace?.name || null,
      runtime:
        asProviderSettings(workspace?.providerSettings).ciaRuntime || null,
      autonomy:
        asProviderSettings(workspace?.providerSettings).autonomy || null,
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

    const settings = asProviderSettings(workspace?.providerSettings);
    const currentRunId = settings?.ciaRuntime?.currentRunId;

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
          settings.autonomy?.autoBootstrapOnConnected ?? true,
      },
    });
    await this.updateAutonomyRunStatus(currentRunId, 'PAUSED');
    await this.stopPresenceHeartbeat(workspaceId);

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

  async ensureBacklogCoverage(
    workspaceId: string,
    options?: {
      triggeredBy?: string;
      limit?: number;
      allowBootstrap?: boolean;
    },
  ) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const settings = asProviderSettings(workspace?.providerSettings);
    const autonomy = (settings.autonomy || {}) as Record<string, any>;
    const runtime = (settings.ciaRuntime || {}) as Record<string, any>;
    const autonomyMode = String(autonomy.mode || '')
      .trim()
      .toUpperCase();
    const triggeredBy = options?.triggeredBy || 'runtime_maintenance';
    const staleRuntimeReset = await this.resetStaleRuntimeRunIfNeeded(
      workspaceId,
      runtime,
      triggeredBy,
    );
    const effectiveRuntime = staleRuntimeReset ? staleRuntimeReset : runtime;
    const effectiveRuntimeState = String(effectiveRuntime.state || '')
      .trim()
      .toUpperCase();

    if (autonomy.autoBootstrapOnConnected === false) {
      return { action: 'skipped', reason: 'auto_bootstrap_disabled' };
    }

    if (
      !autonomyMode ||
      autonomyMode === 'OFF' ||
      effectiveRuntimeState === 'PAUSED'
    ) {
      await this.stopPresenceHeartbeat(workspaceId);
      if (options?.allowBootstrap === false) {
        return { action: 'skipped', reason: 'bootstrap_disallowed' };
      }
      return this.bootstrap(workspaceId);
    }

    if (autonomyMode === 'HUMAN_ONLY' || autonomyMode === 'SUSPENDED') {
      await this.stopPresenceHeartbeat(workspaceId);
      return { action: 'skipped', reason: 'autonomy_blocked' };
    }

    await this.startPresenceHeartbeat(workspaceId);

    if (
      ['EXECUTING_BACKLOG', 'EXECUTING_IMMEDIATELY'].includes(
        effectiveRuntimeState,
      ) ||
      String(effectiveRuntime.currentRunId || '').trim()
    ) {
      return { action: 'skipped', reason: 'run_in_progress' };
    }

    const pendingConversations = await this.listPendingConversations(
      workspaceId,
      options?.limit || 500,
    );
    if (!pendingConversations.length) {
      const chats = this.normalizeChats(
        await this.providerRegistry.getChats(workspaceId),
      );
      const remotePending = this.selectRemotePendingChats(chats);
      if (remotePending.length > 0) {
        return {
          action: 'backlog_started',
          run: await this.startBacklogRun(
            workspaceId,
            'reply_all_recent_first',
            Math.max(
              1,
              Math.min(
                options?.limit || CIA_BOOTSTRAP_AUTO_CONTINUE_LIMIT,
                remotePending.length,
              ),
            ),
            {
              autoStarted: true,
              runtimeState: 'EXECUTING_BACKLOG',
              triggeredBy,
            },
          ),
          remotePending: remotePending.length,
        };
      }

      await this.updateWorkspaceAutonomy(workspaceId, {
        mode: 'FULL',
        reason: triggeredBy,
        runtime: {
          state: 'LIVE_READY',
          currentRunId: null,
          mode: 'reply_only_new',
        },
        autonomy: {
          reactiveEnabled: true,
          proactiveEnabled: false,
          autoBootstrapOnConnected:
            settings.autonomy?.autoBootstrapOnConnected ?? true,
        },
      });
      const catalog = await this.scheduleContactCatalogRefresh(
        workspaceId,
        triggeredBy,
      );

      return {
        action: catalog.scheduled ? 'catalog_scheduled' : 'idle',
        pendingConversations: 0,
        catalog,
      };
    }

    const run = await this.startBacklogRun(
      workspaceId,
      'reply_all_recent_first',
      Math.max(
        1,
        Math.min(
          options?.limit || CIA_BOOTSTRAP_AUTO_CONTINUE_LIMIT,
          pendingConversations.length,
        ),
      ),
      {
        autoStarted: true,
        runtimeState: 'EXECUTING_BACKLOG',
        triggeredBy,
      },
    );

    return {
      action: 'backlog_started',
      run,
      pendingConversations: pendingConversations.length,
    };
  }

  private async listPendingConversations(workspaceId: string, limit: number) {
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
            take: 5,
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
        sum +
        Math.max(
          1,
          Number(
            conversation.pendingMessages ||
              conversation.operational?.pendingMessages ||
              0,
          ) || 0,
        ),
      0,
    );
  }

  private selectRemotePendingChats(
    chats: WahaChatSummary[],
  ): WahaChatSummary[] {
    const includeZeroUnreadActivity =
      String(
        process.env.CIA_BOOTSTRAP_INCLUDE_ZERO_UNREAD_ACTIVITY || 'false',
      ).toLowerCase() === 'true';

    return [...chats]
      .filter((chat) => {
        if ((chat.unreadCount || 0) > 0) {
          return true;
        }

        const activityTimestamp = this.resolveChatActivityTimestamp(chat);
        const hasUnknownPendingSignal =
          (chat.lastMessageFromMe === null ||
            chat.lastMessageFromMe === undefined) &&
          Number(chat.lastMessageRecvTimestamp || 0) > 0;

        if (
          hasUnknownPendingSignal &&
          this.isFreshUnknownRemotePendingActivity(activityTimestamp)
        ) {
          return true;
        }

        if (!this.isFreshRemotePendingActivity(activityTimestamp)) {
          return false;
        }

        return chat.lastMessageFromMe === false || includeZeroUnreadActivity;
      })
      .sort((left, right) => {
        const activityDiff =
          this.resolveChatActivityTimestamp(right) -
          this.resolveChatActivityTimestamp(left);
        if (activityDiff !== 0) {
          return activityDiff;
        }

        const unreadDiff =
          (Number(right.unreadCount || 0) || 0) -
          (Number(left.unreadCount || 0) || 0);
        if (unreadDiff !== 0) {
          return unreadDiff;
        }

        return String(left.id || '').localeCompare(String(right.id || ''));
      });
  }

  private estimatePendingMessages(chat: WahaChatSummary): number {
    return Math.max(
      1,
      Number(chat.unreadCount || 0) || 0,
      chat.lastMessageFromMe === false ? 1 : 0,
    );
  }

  private resolveChatActivityTimestamp(chat: WahaChatSummary): number {
    return Math.max(
      Number(chat.timestamp || 0) || 0,
      Number(chat.lastMessageTimestamp || 0) || 0,
    );
  }

  private resolveLatestRemoteMessageTimestamp(
    messages: Array<{ createdAt?: string | null }>,
  ): number {
    return messages
      .map((message) => {
        const timestamp = message?.createdAt
          ? new Date(message.createdAt).getTime()
          : NaN;
        return Number.isFinite(timestamp) ? timestamp : 0;
      })
      .sort((left, right) => right - left)[0];
  }

  private isFreshRemotePendingActivity(timestamp: number): boolean {
    return (
      timestamp > 0 && Date.now() - timestamp <= CIA_REMOTE_PENDING_MAX_AGE_MS
    );
  }

  private isFreshUnknownRemotePendingActivity(timestamp: number): boolean {
    return (
      timestamp > 0 &&
      Date.now() - timestamp <= CIA_REMOTE_UNKNOWN_PENDING_MAX_AGE_MS
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

  private async buildPendingInboundBatch(params: {
    workspaceId: string;
    contactId?: string | null;
    phone?: string | null;
    fallbackMessageContent?: string | null;
    fallbackQuotedMessageId?: string | null;
  }): Promise<{
    aggregatedMessage: string;
    messages: Array<{
      content: string;
      quotedMessageId: string;
      createdAt?: string | null;
    }>;
  } | null> {
    const phone = String(params.phone || '').trim();
    const contact = params.contactId
      ? await this.prisma.contact.findUnique({
          where: { id: params.contactId },
          select: { id: true, phone: true },
        })
      : phone
        ? await this.prisma.contact.findFirst({
            where: { workspaceId: params.workspaceId, phone },
            select: { id: true, phone: true },
          })
        : null;

    const contactId = contact?.id || params.contactId || null;
    if (!contactId && !phone) {
      return null;
    }

    const lastOutbound = await this.prisma.message.findFirst({
      where: {
        workspaceId: params.workspaceId,
        ...(contactId ? { contactId } : { contact: { phone } }),
        direction: 'OUTBOUND',
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    const inboundMessages = await this.prisma.message.findMany({
      where: {
        workspaceId: params.workspaceId,
        ...(contactId ? { contactId } : { contact: { phone } }),
        direction: 'INBOUND',
        ...(lastOutbound?.createdAt
          ? {
              createdAt: {
                gt: lastOutbound.createdAt,
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 12,
      select: {
        content: true,
        externalId: true,
        createdAt: true,
      },
    });

    const messages = inboundMessages
      .map((message) => ({
        content: String(message.content || '').trim(),
        quotedMessageId: String(message.externalId || '').trim(),
        createdAt: message.createdAt?.toISOString?.() || null,
      }))
      .filter((message) => message.content && message.quotedMessageId);

    if (!messages.length) {
      const fallbackContent = String(
        params.fallbackMessageContent || '',
      ).trim();
      const fallbackQuotedMessageId = String(
        params.fallbackQuotedMessageId || '',
      ).trim();
      if (!fallbackContent || !fallbackQuotedMessageId) {
        return null;
      }

      return {
        aggregatedMessage: fallbackContent,
        messages: [
          {
            content: fallbackContent,
            quotedMessageId: fallbackQuotedMessageId,
            createdAt: null,
          },
        ],
      };
    }

    return {
      aggregatedMessage:
        messages.length === 1
          ? messages[0].content
          : messages
              .map(
                (message, index) =>
                  `[${index + 1}] ${String(message.content || '').trim()}`,
              )
              .join('\n'),
      messages,
    };
  }

  private isRecentLiveBatch(
    messages: Array<{ createdAt?: string | null }> = [],
  ): boolean {
    const latestTimestamp = messages
      .map((message) => {
        const ts = message?.createdAt
          ? new Date(message.createdAt).getTime()
          : NaN;
        return Number.isFinite(ts) ? ts : 0;
      })
      .filter((value) => value > 0)
      .sort((left, right) => right - left)[0];

    if (!latestTimestamp) {
      return false;
    }

    return Date.now() - latestTimestamp <= 24 * 60 * 60 * 1000;
  }

  private async runBacklogInlineFallback(
    workspaceId: string,
    runId: string,
    mode: BacklogMode,
    conversations: any[],
  ) {
    if (!conversations.length) {
      await this.updateAutonomyRunStatus(runId, 'COMPLETED');
      await this.finalizeSilentLiveMode(
        workspaceId,
        'inline_backlog_empty',
        runId,
      );
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
      message: `Worker indisponível. Vou responder ${conversations.length} conversas inline agora para não deixar o WhatsApp parado.`,
      meta: {
        total: conversations.length,
        mode,
      },
    });

    let processed = 0;
    let skipped = 0;

    for (const [index, conversation] of conversations.entries()) {
      const lastMessage = conversation?.messages?.[0];
      const pendingBatch = await this.buildPendingInboundBatch({
        workspaceId,
        contactId: conversation?.contactId || null,
        phone: conversation?.contact?.phone || null,
        fallbackMessageContent: lastMessage?.content || null,
        fallbackQuotedMessageId: lastMessage?.externalId || null,
      });
      const messageContent = String(
        pendingBatch?.aggregatedMessage || lastMessage?.content || '',
      ).trim();
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

      const replyLockKey = this.getSharedReplyLockKey(
        workspaceId,
        conversation?.contactId || null,
        phone,
      );
      const replyReserved = await this.redisSetNx(
        replyLockKey,
        `${runId}:${conversation?.id || conversation?.contactId || index}`,
        CIA_SHARED_REPLY_LOCK_MS,
      );
      if (!replyReserved) {
        skipped += 1;
        continue;
      }

      let keepReplyLock = false;
      try {
        const result = await this.unifiedAgent.processIncomingMessage({
          workspaceId,
          contactId: conversation?.contactId || undefined,
          phone,
          message: messageContent,
          channel: 'whatsapp',
          context: {
            source: 'cia_backlog_inline',
            deliveryMode: this.isRecentLiveBatch(pendingBatch?.messages || [])
              ? 'reactive'
              : 'proactive',
            conversationId: conversation?.id || null,
            runId,
            backlogIndex: index + 1,
            backlogTotal: conversations.length,
            forceDirect: true,
          },
        });

        if (this.hasOutboundAction(result.actions || [])) {
          keepReplyLock = true;
          processed += 1;
          continue;
        }

        const reply = String(
          result.reply ||
            result.response ||
            this.buildInlineFallbackReply(messageContent),
        ).trim();
        const shouldMirrorReplies = this.isRecentLiveBatch(
          pendingBatch?.messages || [],
        );
        const latestQuotedMessageId = pendingBatch?.messages?.length
          ? pendingBatch.messages[pendingBatch.messages.length - 1]
              ?.quotedMessageId || ''
          : '';
        const replyPlan =
          reply && pendingBatch?.messages?.length
            ? shouldMirrorReplies
              ? await this.unifiedAgent.buildQuotedReplyPlan({
                  workspaceId,
                  contactId: conversation?.contactId || undefined,
                  phone,
                  draftReply: reply,
                  customerMessages: pendingBatch.messages,
                })
              : latestQuotedMessageId
                ? [
                    {
                      quotedMessageId: latestQuotedMessageId,
                      text: reply,
                    },
                  ]
                : []
            : [];
        if (!reply || !replyPlan.length) {
          skipped += 1;
          continue;
        }

        let sendFailed = false;
        for (const [replyIndex, replyItem] of replyPlan.entries()) {
          const sendResult = await this.whatsappService.sendMessage(
            workspaceId,
            phone,
            replyItem.text,
            {
              externalId: `cia-inline:${runId}:${conversation?.id || conversation?.contactId || index}:${replyIndex + 1}`,
              quotedMessageId: replyItem.quotedMessageId,
              complianceMode: shouldMirrorReplies ? 'reactive' : 'proactive',
              forceDirect: true,
            },
          );

          if (
            sendResult &&
            typeof sendResult === 'object' &&
            'error' in sendResult &&
            sendResult.error
          ) {
            sendFailed = true;
            break;
          }
        }

        if (sendFailed) {
          skipped += 1;
          continue;
        }

        keepReplyLock = true;
        processed += 1;
      } catch {
        // PULSE:OK — Per-conversation processing failure is isolated; others still processed
        skipped += 1;
      } finally {
        if (!keepReplyLock) {
          await this.releaseSharedReplyLock(replyLockKey);
        }
      }
    }

    await this.updateAutonomyRunStatus(runId, 'COMPLETED');
    await this.finalizeSilentLiveMode(
      workspaceId,
      'inline_backlog_completed',
      runId,
    );

    const message =
      processed > 0
        ? `Fallback inline concluído. Respondi ${processed} conversa(s) enquanto o worker estava indisponível.`
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
      },
    });

    return {
      processed,
      skipped,
      message,
    };
  }

  private async listRemotePendingChats(
    workspaceId: string,
    limit: number,
  ): Promise<WahaChatSummary[]> {
    const sessionKey = await this.resolveActiveSessionKey(workspaceId);
    const chats = this.normalizeChats(
      await this.providerRegistry.getChats(sessionKey),
    );
    return this.selectRemotePendingChats(chats).slice(
      0,
      Math.max(1, Math.min(200, Number(limit || 1) || 1)),
    );
  }

  private normalizeRemotePhone(chatId: string): string {
    return String(chatId || '')
      .replace(/@.+$/, '')
      .replace(/\D/g, '');
  }

  private extractRemoteSenderName(
    payload: any,
    fallbackName?: string | null,
  ): string | null {
    const candidates = [
      fallbackName,
      payload?._data?.pushName,
      payload?.pushName,
      payload?._data?.notifyName,
      payload?.notifyName,
      payload?.senderName,
      payload?.author,
      payload?.name,
    ];

    for (const candidate of candidates) {
      if (typeof candidate !== 'string') continue;
      const normalized = candidate.trim();
      if (normalized) {
        return normalized;
      }
    }

    return null;
  }

  private normalizeRemoteTimestamp(
    value?: string | number | Date | null,
  ): string | null {
    if (!value && value !== 0) return null;
    const parsed =
      value instanceof Date
        ? value
        : typeof value === 'number'
          ? new Date(value > 1e12 ? value : value * 1000)
          : new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  private buildRemoteHistorySummary(
    messages: Array<{
      fromMe: boolean;
      content: string;
      createdAt?: string | null;
    }>,
  ): string {
    return messages
      .slice(-20)
      .map((message) => {
        const role = message.fromMe ? 'vendedora' : 'cliente';
        const content = String(message.content || '').trim();
        return content ? `${role}: ${content}` : null;
      })
      .filter(Boolean)
      .join('\n');
  }

  private isRecentRemoteBatch(
    messages: Array<{ createdAt?: string | null }>,
  ): boolean {
    const latest = this.resolveLatestRemoteMessageTimestamp(messages);

    return latest > 0 && Date.now() - latest <= 24 * 60 * 60 * 1000;
  }

  private async loadRemotePendingBatch(params: {
    workspaceId: string;
    chat: WahaChatSummary;
  }): Promise<{
    contactId?: string;
    phone: string;
    contactName: string;
    aggregatedMessage: string;
    customerMessages: Array<{
      content: string;
      quotedMessageId: string;
      createdAt?: string | null;
    }>;
    historySummary: string;
    shouldMirrorReplies: boolean;
  } | null> {
    const sessionKey = await this.resolveActiveSessionKey(params.workspaceId);
    const rawMessages: any = await this.providerRegistry.getChatMessages(
      sessionKey,
      params.chat.id,
      {
        limit: 80,
        offset: 0,
        downloadMedia: false,
      },
    );

    const normalizedMessages = (
      Array.isArray(rawMessages)
        ? rawMessages
        : Array.isArray(rawMessages?.messages)
          ? rawMessages.messages
          : Array.isArray(rawMessages?.items)
            ? rawMessages.items
            : Array.isArray(rawMessages?.data)
              ? rawMessages.data
              : []
    )
      .map((message: any) => ({
        externalId: String(
          message?.id?._serialized ||
            message?.id?.id ||
            message?.key?.id ||
            message?.id ||
            '',
        ).trim(),
        fromMe: message?.fromMe === true || message?.id?.fromMe === true,
        content: String(message?.body || message?.text?.body || '').trim(),
        createdAt: this.normalizeRemoteTimestamp(
          message?.timestamp || message?.t || message?.createdAt || null,
        ),
        raw: message,
      }))
      .filter((message) => message.externalId && message.content);

    if (!normalizedMessages.length) {
      return null;
    }

    let lastOutboundIndex = -1;
    normalizedMessages.forEach((message, index) => {
      if (message.fromMe) {
        lastOutboundIndex = index;
      }
    });

    const pendingMessages = normalizedMessages.filter(
      (message, index) => !message.fromMe && index > lastOutboundIndex,
    );
    const effectivePending = pendingMessages.length
      ? pendingMessages
      : normalizedMessages.filter((message) => !message.fromMe).slice(-1);

    if (!effectivePending.length) {
      return null;
    }

    const latestCustomerActivityTimestamp = Math.max(
      this.resolveLatestRemoteMessageTimestamp(effectivePending),
      this.resolveChatActivityTimestamp(params.chat),
    );
    if (!this.isFreshRemotePendingActivity(latestCustomerActivityTimestamp)) {
      return null;
    }

    const phone = this.normalizeRemotePhone(params.chat.id);
    if (!phone) {
      return null;
    }

    const detectedName =
      this.extractRemoteSenderName(
        effectivePending[effectivePending.length - 1]?.raw,
        params.chat.name || null,
      ) || phone;

    const contact = await this.prisma.contact.upsert({
      where: {
        workspaceId_phone: {
          workspaceId: params.workspaceId,
          phone,
        },
      },
      update: {
        name: detectedName,
      },
      create: {
        workspaceId: params.workspaceId,
        phone,
        name: detectedName,
      },
      select: {
        id: true,
        name: true,
        phone: true,
      },
    });

    await this.whatsappService
      .syncRemoteContactProfile(params.workspaceId, phone, detectedName)
      .catch(() => undefined);

    const customerMessages = effectivePending.map((message) => ({
      content: message.content,
      quotedMessageId: message.externalId,
      createdAt: message.createdAt,
    }));
    const shouldMirrorReplies = this.isRecentRemoteBatch(customerMessages);

    return {
      contactId: contact.id,
      phone,
      contactName: contact.name || detectedName,
      aggregatedMessage:
        customerMessages.length === 1
          ? customerMessages[0].content
          : customerMessages
              .map(
                (message, index) =>
                  `[${index + 1}] ${String(message.content || '').trim()}`,
              )
              .join('\n'),
      customerMessages,
      historySummary: this.buildRemoteHistorySummary(normalizedMessages),
      shouldMirrorReplies,
    };
  }

  private async runRemoteBacklogInlineFallback(
    workspaceId: string,
    runId: string,
    mode: BacklogMode,
    chats: WahaChatSummary[],
  ) {
    await this.updateAutonomyRunStatus(runId, 'RUNNING');

    await this.agentEvents.publish({
      type: 'status',
      workspaceId,
      runId,
      phase: 'backlog_remote_inline_fallback',
      persistent: true,
      message: `Banco local ainda não refletiu o backlog completo. Vou agir direto a partir do WAHA em ${chats.length} conversa(s).`,
      meta: {
        total: chats.length,
        mode,
      },
    });

    let processed = 0;
    let skipped = 0;

    for (const [index, chat] of chats.entries()) {
      const remoteBatch = await this.loadRemotePendingBatch({
        workspaceId,
        chat,
      }).catch(() => null);

      if (!remoteBatch?.phone || !remoteBatch.customerMessages.length) {
        skipped += 1;
        continue;
      }

      const phone = remoteBatch.phone;
      const replyLockKey = this.getSharedReplyLockKey(
        workspaceId,
        remoteBatch.contactId || null,
        phone,
      );
      const replyReserved = await this.redisSetNx(
        replyLockKey,
        `${runId}:${chat.id}:${index}`,
        CIA_SHARED_REPLY_LOCK_MS,
      );
      if (!replyReserved) {
        skipped += 1;
        continue;
      }

      let keepReplyLock = false;
      try {
        await this.agentEvents.publish({
          type: 'thought',
          workspaceId,
          runId,
          phase: 'backlog_remote_contact',
          message: `Abrindo ${remoteBatch.contactName} (${index + 1}/${chats.length}) e usando o histórico remoto real antes de responder.`,
          meta: {
            phone,
            chatId: chat.id,
            contactId: remoteBatch.contactId || null,
            backlogIndex: index + 1,
            backlogTotal: chats.length,
            deliveryMode: remoteBatch.shouldMirrorReplies
              ? 'reactive'
              : 'proactive',
          },
        });

        const result = await this.unifiedAgent.processIncomingMessage({
          workspaceId,
          contactId: remoteBatch.contactId || undefined,
          phone,
          message: remoteBatch.aggregatedMessage,
          channel: 'whatsapp',
          context: {
            source: 'cia_backlog_remote_inline',
            deliveryMode: remoteBatch.shouldMirrorReplies
              ? 'reactive'
              : 'proactive',
            remoteChatId: chat.id,
            remoteHistorySummary: remoteBatch.historySummary,
            leadVisibleName: remoteBatch.contactName,
            backlogIndex: index + 1,
            backlogTotal: chats.length,
            forceDirect: true,
          },
        });

        const reply = String(
          result.reply ||
            result.response ||
            this.buildInlineFallbackReply(remoteBatch.aggregatedMessage),
        ).trim();

        const latestQuotedMessageId =
          remoteBatch.customerMessages[remoteBatch.customerMessages.length - 1]
            ?.quotedMessageId || '';
        const replyPlan =
          reply && remoteBatch.customerMessages.length
            ? remoteBatch.shouldMirrorReplies
              ? await this.unifiedAgent.buildQuotedReplyPlan({
                  workspaceId,
                  contactId: remoteBatch.contactId || undefined,
                  phone,
                  draftReply: reply,
                  customerMessages: remoteBatch.customerMessages,
                })
              : latestQuotedMessageId
                ? [
                    {
                      quotedMessageId: latestQuotedMessageId,
                      text: reply,
                    },
                  ]
                : []
            : [];

        if (!replyPlan.length) {
          skipped += 1;
          continue;
        }

        let sendFailed = false;
        for (const [replyIndex, replyItem] of replyPlan.entries()) {
          const sendResult = await this.whatsappService.sendMessage(
            workspaceId,
            phone,
            replyItem.text,
            {
              externalId: `cia-remote-inline:${runId}:${chat.id}:${replyIndex + 1}`,
              quotedMessageId: replyItem.quotedMessageId,
              complianceMode: remoteBatch.shouldMirrorReplies
                ? 'reactive'
                : 'proactive',
              forceDirect: true,
            },
          );

          if (
            sendResult &&
            typeof sendResult === 'object' &&
            'error' in sendResult &&
            sendResult.error
          ) {
            sendFailed = true;
            break;
          }
        }

        if (sendFailed) {
          skipped += 1;
          continue;
        }

        keepReplyLock = true;
        processed += 1;
      } finally {
        if (!keepReplyLock) {
          await this.releaseSharedReplyLock(replyLockKey);
        }
      }
    }

    await this.updateAutonomyRunStatus(runId, 'COMPLETED');
    await this.finalizeSilentLiveMode(
      workspaceId,
      'remote_inline_backlog_completed',
      runId,
    );

    const message =
      processed > 0
        ? `Fallback remoto concluído. Respondi ${processed} conversa(s) direto do WAHA enquanto o banco local ainda sincronizava.`
        : 'Fallback remoto executado, mas nenhuma conversa gerou resposta enviada.';

    await this.agentEvents.publish({
      type: 'status',
      workspaceId,
      runId,
      phase: 'backlog_remote_inline_done',
      persistent: true,
      message,
      meta: {
        processed,
        skipped,
        total: chats.length,
      },
    });

    return { processed, skipped, message };
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
    const normalized = String(messageContent || '')
      .trim()
      .toLowerCase();
    const topic = this.extractFallbackTopic(messageContent);

    if (
      /(pre[cç]o|quanto|valor|custa|comprar|boleto|pix|pagamento)/i.test(
        normalized,
      )
    ) {
      return topic
        ? `Boa, você foi direto ao ponto. Posso confirmar preço, pagamento e disponibilidade de ${topic}. Quer que eu siga por aí?`
        : 'Boa, sem rodeio fica melhor. Posso confirmar preço, pagamento e disponibilidade. Me diz o produto ou procedimento.';
    }

    if (/(agendar|agenda|reuni[aã]o|hor[aá]rio|marcar)/i.test(normalized)) {
      return 'Perfeito, organização ainda existe. Me diz o dia ou horário e eu organizo isso com você.';
    }

    if (/(ol[áa]|bom dia|boa tarde|boa noite|oi\b)/i.test(normalized)) {
      return 'Oi. Vamos pular a cerimônia: me diz o produto ou a dúvida e eu sigo com você.';
    }

    return topic
      ? `Entendi. Você falou de ${topic}. Me diz o que quer confirmar e eu te respondo sem enrolação.`
      : 'Entendi. Me diz o produto, exame ou objetivo e eu sigo com a informação certa, sem teatro.';
  }

  private extractFallbackTopic(messageContent: string): string | null {
    const normalized = String(messageContent || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized) {
      return null;
    }

    const explicit =
      normalized.match(
        /\b(?:sobre|do|da|de|para)\s+([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9\s/-]{2,40})/i,
      )?.[1] || '';
    const candidate = explicit || normalized;
    const compact = candidate
      .replace(/[?!.;,]+$/g, '')
      .split(/\s+/)
      .slice(0, explicit ? 6 : 8)
      .join(' ')
      .trim();

    return compact || null;
  }

  private getSharedReplyLockKey(
    workspaceId: string,
    contactId?: string | null,
    phone?: string | null,
  ): string {
    const normalizedPhone = String(phone || '').replace(/\D/g, '');
    return `autopilot:reply:${workspaceId}:${contactId || normalizedPhone}`;
  }

  private async redisSetNx(
    key: string,
    value: string,
    ttlMs: number,
  ): Promise<boolean> {
    return (
      (await this.redis
        .set(key, value, 'PX', ttlMs, 'NX')
        .catch(() => null)) === 'OK'
    );
  }

  private async releaseSharedReplyLock(key: string) {
    await this.redis.del(key).catch(() => undefined);
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
          chat?.lastMessage?.timestamp,
          chat?.lastMessage?._data?.messageTimestamp,
          chat?._chat?.conversationTimestamp,
          chat?._chat?.lastMessageRecvTimestamp,
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
          chat?.lastMessage?.timestamp,
          chat?.lastMessage?._data?.messageTimestamp,
          chat?._chat?.conversationTimestamp,
          chat?._chat?.lastMessageRecvTimestamp,
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
          lastMessageRecvTimestamp: this.resolveChatTimestamp([
            chat?.lastMessageRecvTimestamp,
            chat?._chat?.lastMessageRecvTimestamp,
            chat?.conversationTimestamp,
          ]),
          lastMessageFromMe:
            typeof chat?.lastMessage?.fromMe === 'boolean'
              ? chat.lastMessage.fromMe
              : typeof chat?.lastMessage?._data?.id?.fromMe === 'boolean'
                ? chat.lastMessage._data.id.fromMe
                : typeof chat?.lastMessage?.id?.fromMe === 'boolean'
                  ? chat.lastMessage.id.fromMe
                  : null,
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

    const settings = asProviderSettings(workspace.providerSettings);

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        providerSettings: {
          ...settings,
          ciaRuntime: {
            ...(settings.ciaRuntime || {}),
            ...update,
          },
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async resetStaleRuntimeRunIfNeeded(
    workspaceId: string,
    runtime: Record<string, any>,
    reason: string,
  ): Promise<Record<string, any> | null> {
    const currentRunId = String(runtime.currentRunId || '').trim();
    if (!currentRunId) {
      return null;
    }

    const startedAtRaw = String(
      runtime.lastProgressAt || runtime.startedAt || runtime.updatedAt || '',
    ).trim();
    const startedAt = startedAtRaw ? new Date(startedAtRaw) : null;
    if (!startedAt || Number.isNaN(startedAt.getTime())) {
      return null;
    }

    if (Date.now() - startedAt.getTime() < CIA_RUNTIME_STALE_RUN_MS) {
      return null;
    }

    await this.updateAutonomyRunStatus(currentRunId, 'FAILED');
    const nextRuntime = {
      ...runtime,
      currentRunId: null,
      state: 'LIVE_READY',
      staleRunRecoveredAt: new Date().toISOString(),
      staleRunRecoveredFrom: currentRunId,
      lastRuntimeResetReason: `${reason}_stale_run_recovered`,
    };

    await this.persistRuntimeSnapshot(workspaceId, nextRuntime);
    return nextRuntime;
  }

  private async scheduleContactCatalogRefresh(
    workspaceId: string,
    reason: string,
  ): Promise<{ scheduled: boolean; reason?: string }> {
    try {
      await autopilotQueue.add(
        'catalog-contacts-30d',
        {
          workspaceId,
          days: CIA_CONTACT_CATALOG_LOOKBACK_DAYS,
          reason,
        },
        {
          jobId: buildQueueJobId('catalog-contacts-30d', workspaceId),
          removeOnComplete: true,
        },
      );
      return { scheduled: true };
    } catch (error: any) {
      const message = String(error?.message || '');
      if (message.includes('Job is already waiting')) {
        return { scheduled: false, reason: 'already_waiting' };
      }
      return { scheduled: false, reason: message || 'schedule_failed' };
    }
  }

  private async finalizeSilentLiveMode(
    workspaceId: string,
    reason: string,
    runId?: string,
  ) {
    const catalog = await this.scheduleContactCatalogRefresh(
      workspaceId,
      reason,
    );

    await this.updateWorkspaceAutonomy(workspaceId, {
      mode: 'FULL',
      reason,
      autopilot: {
        enabledByOwnerDecision: true,
        lastMode: 'reply_only_new',
        lastTrigger: reason,
        lastModeAt: new Date().toISOString(),
      },
      runtime: {
        state: 'LIVE_READY',
        currentRunId: null,
        mode: 'reply_only_new',
        autoStarted: false,
        catalogStatus: catalog.scheduled
          ? 'scheduled'
          : catalog.reason || 'idle',
      },
      autonomy: {
        reactiveEnabled: true,
        proactiveEnabled: false,
      },
    });

    await this.persistRuntimeSnapshot(workspaceId, {
      state: 'LIVE_READY',
      currentRunId: null,
      mode: 'reply_only_new',
      catalogStatus: catalog.scheduled ? 'scheduled' : catalog.reason || 'idle',
      lastCatalogScheduleReason: reason,
      lastCatalogScheduledAt: new Date().toISOString(),
    });

    await this.agentEvents.publish({
      type: 'status',
      workspaceId,
      runId,
      phase: 'live_ready',
      persistent: true,
      message: catalog.scheduled
        ? 'Backlog concluído. Vou manter a resposta ao vivo e iniciar a catalogação silenciosa dos contatos recentes.'
        : 'Backlog concluído. Vou manter a resposta ao vivo e permanecer em modo silencioso.',
      meta: {
        catalog,
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

    const settings = asProviderSettings(workspace.providerSettings);
    const autonomy = settings.autonomy || {};
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
            ...(settings.ciaRuntime || {}),
            ...(input.runtime || {}),
          },
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async createAutonomyRun(
    runId: string,
    workspaceId: string,
    mode: WorkspaceAutonomyMode,
    meta?: Record<string, any>,
  ) {
    try {
      await this.prisma.autonomyRun.create({
        data: {
          id: runId,
          workspaceId,
          mode,
          status: 'RUNNING',
          meta,
        },
      });
    } catch {
      // PULSE:OK — AutonomyRun record creation is best-effort; autonomy still executes
    }
  }

  private async updateAutonomyRunStatus(
    runId: string | undefined,
    status: string,
  ) {
    if (!runId) return;

    try {
      await this.prisma.autonomyRun.update({
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
      // PULSE:OK — AutonomyRun status update is best-effort; status tracked in-memory
    }
  }

  // ── Autonomy Execution Tracking ──

  async createExecution(workspaceId: string, runId: string, action: string) {
    return this.prisma.autonomyExecution.create({
      data: {
        workspaceId,
        runId,
        action,
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });
  }

  async completeExecution(id: string, result: any) {
    return this.prisma.autonomyExecution.update({
      where: { id },
      data: { status: 'COMPLETED', result, endedAt: new Date() },
    });
  }
}
