import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { buildConversationOperationalState } from './agent-conversation-state.util';
import { AgentEventsService } from './agent-events.service';
import { CiaChatFilterService } from './cia-chat-filter.service';
import { CiaRuntimeStateService } from './cia-runtime-state.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { WhatsAppCatchupService } from './whatsapp-catchup.service';
import { asProviderSettings } from './provider-settings.types';

const CIA_CONTACT_CATALOG_LOOKBACK_DAYS = Math.max(
  7,
  Number.parseInt(process.env.CIA_CONTACT_CATALOG_LOOKBACK_DAYS || '30', 10) || 30,
);

const CIA_BOOTSTRAP_IMMEDIATE_LIMIT = Math.max(
  1,
  Math.min(20, Number.parseInt(process.env.CIA_BOOTSTRAP_IMMEDIATE_LIMIT || '5', 10) || 5),
);

const CIA_BOOTSTRAP_AUTO_CONTINUE =
  String(process.env.CIA_BOOTSTRAP_AUTO_CONTINUE || 'true').toLowerCase() !== 'false';
const CIA_BOOTSTRAP_AUTO_CONTINUE_LIMIT = Math.max(
  1,
  Math.min(
    2000,
    Number.parseInt(process.env.CIA_BOOTSTRAP_AUTO_CONTINUE_LIMIT || '500', 10) || 500,
  ),
);

export { CIA_BOOTSTRAP_AUTO_CONTINUE_LIMIT };

/**
 * Handles the CIA bootstrap sequence: connects to WhatsApp, counts pending
 * conversations, triggers catchup, and kick-starts the first backlog run.
 * Also owns listPendingConversations — the shared DB query for backlog state.
 */
@Injectable()
export class CiaBootstrapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: WhatsAppProviderRegistry,
    private readonly agentEvents: AgentEventsService,
    private readonly chatFilter: CiaChatFilterService,
    private readonly runtimeState: CiaRuntimeStateService,
    @Inject(forwardRef(() => WhatsAppCatchupService))
    private readonly catchupService: WhatsAppCatchupService,
  ) {}

  async listPendingConversations(workspaceId: string, limit: number) {
    const conversations =
      (await this.prisma.conversation.findMany({
        take: Math.max(1, Math.min(2000, Number(limit || 500) || 500)),
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
      })) || [];

    return conversations
      .map((conversation) => ({
        ...conversation,
        operational: buildConversationOperationalState(conversation),
      }))
      .filter((conversation) => conversation.operational.pending);
  }

  countPendingMessagesFromConversations(conversations: Record<string, unknown>[]): number {
    return conversations.reduce((sum, conversation) => {
      const operational = conversation.operational as Record<string, unknown> | undefined;
      return (
        sum +
        Math.max(1, Number(conversation.pendingMessages || operational?.pendingMessages || 0) || 0)
      );
    }, 0);
  }

  /** Execute the bootstrap sequence. Called by CiaRuntimeService.bootstrap(). */
  async run(
    workspaceId: string,
    startBacklogRun: (
      workspaceId: string,
      mode: 'reply_all_recent_first' | 'reply_only_new' | 'prioritize_hot',
      limit: number,
      options: { autoStarted: boolean; runtimeState: string; triggeredBy: string },
    ) => Promise<{ runId?: string; totalQueued?: number }>,
    startPresenceHeartbeat: (workspaceId: string) => Promise<void>,
    stopPresenceHeartbeat: (workspaceId: string, setOffline?: boolean) => Promise<void>,
  ) {
    await this.agentEvents.publish({
      type: 'thought',
      workspaceId,
      phase: 'access',
      message: 'Acessando seu WhatsApp',
    });

    const status = await this.providerRegistry.getSessionStatus(workspaceId);
    if (!status.connected) {
      await stopPresenceHeartbeat(workspaceId, false);
      const message = `Não consegui iniciar a CIA porque o WhatsApp ainda não está conectado. Status atual: ${String(
        status.status || 'desconhecido',
      ).toLowerCase()}.`;

      await this.runtimeState.persistRuntimeSnapshot(workspaceId, {
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

    await startPresenceHeartbeat(workspaceId);

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
        const chats = this.chatFilter.normalizeChats(
          await this.providerRegistry.getChats(workspaceId),
        );
        const remotePending = this.chatFilter.selectRemotePendingChats(chats);

        pendingConversations = remotePending.length;
        pendingMessages = remotePending.reduce(
          (sum, chat) => sum + this.chatFilter.estimatePendingMessages(chat),
          0,
        );

        if (remotePending.length > 0) {
          await this.catchupService.runCatchupNow(workspaceId, 'cia_bootstrap_inline');

          const refreshedPending = await this.listPendingConversations(workspaceId, 500);
          if (refreshedPending.length > 0) {
            pendingConversations = refreshedPending.length;
            pendingMessages = this.countPendingMessagesFromConversations(refreshedPending);
          }
        }
      }
    } catch (err: unknown) {
      degradedSyncMessage = `Consegui conectar, mas não consegui contar suas conversas pendentes. Motivo: ${err instanceof Error ? err.message : 'falha ao consultar a sessão WAHA'}.`;
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

    const catchup = await this.catchupService.triggerCatchup(workspaceId, 'cia_bootstrap');

    let immediateRun: { runId?: string; totalQueued?: number } | null = null;
    const autoContinueBacklog = pendingConversations > 0 && CIA_BOOTSTRAP_AUTO_CONTINUE;
    const bootstrapRunLimit = autoContinueBacklog
      ? Math.min(pendingConversations, CIA_BOOTSTRAP_AUTO_CONTINUE_LIMIT)
      : Math.min(pendingConversations, CIA_BOOTSTRAP_IMMEDIATE_LIMIT);

    if (pendingConversations > 0) {
      immediateRun = await startBacklogRun(
        workspaceId,
        'reply_all_recent_first',
        bootstrapRunLimit,
        {
          autoStarted: true,
          runtimeState: autoContinueBacklog ? 'EXECUTING_BACKLOG' : 'EXECUTING_IMMEDIATELY',
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
      await this.runtimeState.updateWorkspaceAutonomy(workspaceId, {
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

      await this.runtimeState.scheduleContactCatalogRefresh(
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

    await this.runtimeState.persistRuntimeSnapshot(workspaceId, {
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

  /** Resolve the active WAHA/Meta session key for a workspace. */
  async resolveActiveSessionKey(workspaceId: string): Promise<string> {
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
}
