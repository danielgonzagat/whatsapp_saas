import { Injectable } from '@nestjs/common';
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
    const autopilot = {
      ...(settings.autopilot || {}),
      enabled: true,
      enabledByOwnerDecision: true,
      lastMode: mode,
      lastTrigger: options?.triggeredBy || 'owner_command',
      lastModeAt: new Date().toISOString(),
    };

    const runId = randomUUID();
    const queueLimit = Math.max(1, Math.min(2000, Number(limit || 500) || 500));

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        providerSettings: {
          ...settings,
          autopilot,
          ciaRuntime: {
            ...((settings.ciaRuntime as any) || {}),
            currentRunId: runId,
            state:
              mode === 'reply_only_new'
                ? 'LIVE_AUTONOMY'
                : options?.runtimeState || 'EXECUTING_BACKLOG',
            mode,
            startedAt: new Date().toISOString(),
            autoStarted: options?.autoStarted === true,
          },
        },
      },
    });

    if (mode === 'reply_only_new') {
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

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        providerSettings: {
          ...settings,
          autopilot: {
            ...(settings.autopilot || {}),
            enabled: false,
            pausedAt: new Date().toISOString(),
          },
          ciaRuntime: {
            ...((settings.ciaRuntime as any) || {}),
            state: 'PAUSED',
          },
        },
      },
    });

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
}
