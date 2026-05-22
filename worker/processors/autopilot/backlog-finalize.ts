import { prisma } from '../../db';
import { redis } from '../../redis-client';
import { publishAgentEvent } from '../../providers/agent-events';
import { isConversationPendingForAgent } from '../../conversation-agent-state';
import { log, type UnknownRecord, CIA_BACKLOG_CONTINUATION_LIMIT } from './shared';
import { resolveWorkspaceSelfIdentity, isWorkspaceSelfTarget } from './identity-resolve';
import { getRemoteUnreadChatSnapshot, scheduleCatalogContactsJob } from './backlog-fetcher';
import { seedRemoteUnreadConversationShells, scheduleBacklogContinuation } from './backlog-seeder';

export async function setWorkspaceSilentLiveMode(input: {
  workspaceId: string;
  reason: string;
  catalogStatus?: string;
}) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: input.workspaceId },
    select: { providerSettings: true },
  });
  if (!workspace) {
    return;
  }

  const settings = (workspace.providerSettings as UnknownRecord) || {};
  const autonomy = (settings.autonomy || {}) as Record<string, unknown>;

  await prisma.workspace.update({
    where: { id: input.workspaceId },
    data: {
      providerSettings: {
        ...settings,
        autopilot: {
          ...(settings.autopilot || {}),
          enabled: true,
          enabledByOwnerDecision: true,
          lastMode: 'reply_only_new',
          lastTrigger: input.reason,
          lastModeAt: new Date().toISOString(),
        },
        autonomy: {
          ...autonomy,
          mode: 'FULL',
          reason: input.reason,
          reactiveEnabled: true,
          proactiveEnabled: false,
          autoBootstrapOnConnected: autonomy.autoBootstrapOnConnected !== false,
          lastTransitionAt: new Date().toISOString(),
        },
        ciaRuntime: {
          ...((settings.ciaRuntime as UnknownRecord) || {}),
          state: 'LIVE_READY',
          currentRunId: null,
          mode: 'reply_only_new',
          autoStarted: false,
          catalogStatus: input.catalogStatus || 'idle',
          lastCatalogScheduledAt: new Date().toISOString(),
          lastCatalogScheduleReason: input.reason,
        },
      },
    },
  });
}

export async function finalizeBacklogIntoSilentCatalog(input: {
  workspaceId: string;
  runId?: string;
  reason: string;
}) {
  if (!input.workspaceId) {
    return;
  }

  const lockKey = `cia:post-backlog:${input.workspaceId}:${input.runId || 'default'}`;
  const reserved = await redis.set(lockKey, input.reason, 'EX', 30, 'NX');
  if (reserved !== 'OK') {
    return;
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: input.workspaceId },
    select: { providerSettings: true },
  });
  const selfIdentity = await resolveWorkspaceSelfIdentity(
    input.workspaceId,
    (workspace?.providerSettings as UnknownRecord) || {},
  );

  let localPending = 0;
  try {
    const conversations = await prisma.conversation.findMany({
      where: {
        workspaceId: input.workspaceId,
        status: { not: 'CLOSED' },
      },
      select: {
        id: true,
        status: true,
        mode: true,
        assignedAgentId: true,
        unreadCount: true,
        contact: {
          select: {
            phone: true,
          },
        },
        messages: {
          select: {
            direction: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });
    localPending = conversations.filter(
      (conversation) =>
        !isWorkspaceSelfTarget({
          phone: conversation.contact?.phone,
          selfIdentity,
        }) && isConversationPendingForAgent(conversation),
    ).length;
  } catch (err: unknown) {
    log.warn('compute_pending_count_error', {
      error: err instanceof Error ? err.message : String(err),
    });
    localPending = 0;
  }

  const remoteUnreadChats = await getRemoteUnreadChatSnapshot(
    input.workspaceId,
    CIA_BACKLOG_CONTINUATION_LIMIT,
    selfIdentity,
  ).catch(() => []);
  const pending = Math.max(localPending, remoteUnreadChats.length);

  if (pending > 0) {
    if (remoteUnreadChats.length > 0) {
      await seedRemoteUnreadConversationShells({
        workspaceId: input.workspaceId,
        selfIdentity,
        chats: remoteUnreadChats,
      }).catch(() => 0);
    }

    const continuation = await scheduleBacklogContinuation({
      workspaceId: input.workspaceId,
      reason: 'backlog_continue_until_waha_zero',
      limit: Math.max(remoteUnreadChats.length, Math.min(CIA_BACKLOG_CONTINUATION_LIMIT, pending)),
      mode: 'reply_all_recent_first',
    });

    await publishAgentEvent({
      type: 'status',
      workspaceId: input.workspaceId,
      runId: input.runId,
      phase: 'backlog_continue',
      persistent: true,
      message:
        remoteUnreadChats.length > 0
          ? `Ainda restam ${remoteUnreadChats.length} conversa(s) pendentes no WAHA. Vou continuar o backlog até zerar tudo.`
          : `Ainda restam ${localPending} conversa(s) pendentes localmente. Vou continuar o backlog até zerar tudo.`,
      meta: {
        localPending,
        remotePending: remoteUnreadChats.length,
        continuation,
      },
    });
    return;
  }

  const catalog = await scheduleCatalogContactsJob(input.workspaceId, input.reason);
  await setWorkspaceSilentLiveMode({
    workspaceId: input.workspaceId,
    reason: input.reason,
    catalogStatus: catalog.scheduled ? 'scheduled' : catalog.reason || 'idle',
  });
  await publishAgentEvent({
    type: 'status',
    workspaceId: input.workspaceId,
    runId: input.runId,
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
