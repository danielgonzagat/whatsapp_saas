import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { autopilotQueue } from '../queue/queue';
import { WhatsAppApiProvider, WahaChatSummary } from './providers/whatsapp-api.provider';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { WhatsAppCatchupService } from './whatsapp-catchup.service';
import { AgentEventsService } from './agent-events.service';

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

@Injectable()
export class CiaRuntimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: WhatsAppProviderRegistry,
    private readonly whatsappApi: WhatsAppApiProvider,
    private readonly catchupService: WhatsAppCatchupService,
    private readonly agentEvents: AgentEventsService,
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

    try {
      const chats = this.normalizeChats(await this.whatsappApi.getChats(workspaceId));
      const unreadChats = chats.filter((chat) => (chat.unreadCount || 0) > 0);

      pendingConversations = unreadChats.length;
      pendingMessages = unreadChats.reduce(
        (sum, chat) => sum + (Number(chat.unreadCount || 0) || 0),
        0,
      );
    } catch (err: any) {
      const message = `Consegui conectar, mas não consegui contar suas conversas pendentes. Motivo: ${err?.message || 'falha ao consultar a sessão WAHA'}.`;

      await this.persistRuntimeSnapshot(workspaceId, {
        state: 'ERROR',
        lastError: message,
      });
      await this.agentEvents.publish({
        type: 'error',
        workspaceId,
        phase: 'sync',
        message,
        persistent: true,
      });

      return {
        connected: true,
        status: status.status,
        message,
        pendingConversations: 0,
        pendingMessages: 0,
      };
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
        reason: 'session_connected',
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
        : 'Não encontrei conversas pendentes. Vou seguir apenas com as novas mensagens que chegarem.';

    await this.persistRuntimeSnapshot(workspaceId, {
      state:
        pendingConversations > 0
          ? 'EXECUTING_IMMEDIATELY'
          : 'LIVE_READY',
      currentRunId: immediateRun?.runId,
      pendingConversations,
      pendingMessages,
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
          : 'Não encontrei backlog pendente no seu WhatsApp.',
      persistent: true,
      meta: {
        pendingConversations,
        pendingMessages,
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
      message: promptMessage,
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

    const previewCandidates = await this.prisma.conversation.findMany({
      where: {
        workspaceId,
        status: { not: 'CLOSED' },
        unreadCount: { gt: 0 },
      },
      orderBy:
        mode === 'prioritize_hot'
          ? [
              { lastMessageAt: 'desc' },
              { unreadCount: 'desc' },
            ]
          : [{ lastMessageAt: 'desc' }],
      take: queueLimit,
      select: {
        id: true,
      },
    });

    await autopilotQueue.add(
      'sweep-unread-conversations',
      {
        workspaceId,
        runId,
        limit: queueLimit,
        mode,
      },
      {
        jobId: `cia-backlog:${workspaceId}:${runId}`,
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
          ? `Autoexecução iniciada com ${previewCandidates.length} contatos para gerar valor imediato.`
          : mode === 'prioritize_hot'
          ? `Vou priorizar os contatos mais recentes e mais quentes. Preparei ${previewCandidates.length} conversas para começar.`
          : `Irei responder ${previewCandidates.length} conversas por ordem dos mais recentes primeiro.`,
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
      data: { mode: 'AI' },
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
      .map((chat: any) => ({
        id:
          chat?.id?._serialized ||
          chat?.id ||
          chat?.chatId ||
          chat?.wid ||
          '',
        unreadCount: Number(chat?.unreadCount || chat?.unread || 0) || 0,
        timestamp: Number(chat?.timestamp || chat?.t || 0) || 0,
        lastMessageTimestamp:
          Number(chat?.lastMessageTimestamp || chat?.last_time || 0) || 0,
      }))
      .filter((chat) => !!chat.id);
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
