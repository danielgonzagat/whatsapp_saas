import { prisma } from '../../db';
import { autopilotQueue } from '../../queue';
import { buildQueueJobId } from '../../job-id';
import {
  publishAgentEvent,
  createBacklogRunState,
  finishBacklogRunTask,
} from '../../providers/agent-events';
import { forEachSequential } from '../../utils/async-sequence';
import {
  deriveOperationalUnreadCount,
  isConversationPendingForAgent,
} from '../../conversation-agent-state';
import { parseSweepUnreadConversationsJobData } from '../../contracts/autopilot-jobs';
import { normalizeJsonObject, type UnknownRecord, log } from './shared';
import { resolveWorkspaceSelfIdentity, isWorkspaceSelfTarget } from './identity';
import {
  getRemoteUnreadChatSnapshot,
  seedRemoteUnreadConversationShells,
  finalizeBacklogIntoSilentCatalog,
} from './backlog';

export async function runSweepUnreadConversations(data: unknown) {
  const payload = parseSweepUnreadConversationsJobData(data);
  const { workspaceId, runId, limit, mode } = payload;
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { providerSettings: true },
  });
  const settings = (workspace?.providerSettings as UnknownRecord) || {};
  const selfIdentity = await resolveWorkspaceSelfIdentity(workspaceId, settings);

  const fetchLimit = Math.max(limit, Math.min(limit * 5, 5000));
  const remoteUnreadChats = await getRemoteUnreadChatSnapshot(
    workspaceId,
    fetchLimit,
    selfIdentity,
  ).catch(() => []);

  if (remoteUnreadChats.length > 0) {
    await seedRemoteUnreadConversationShells({
      workspaceId,
      selfIdentity,
      chats: remoteUnreadChats,
    }).catch((err) => {
      log.warn('seed_remote_unread_shells_failed', { error: err?.message });
      return 0;
    });
  }

  const rawConversations = await prisma.conversation.findMany({
    where: {
      workspaceId,
      status: { not: 'CLOSED' },
    },
    orderBy: [{ lastMessageAt: 'desc' }],
    take: fetchLimit,
    select: {
      id: true,
      contactId: true,
      status: true,
      mode: true,
      assignedAgentId: true,
      unreadCount: true,
      lastMessageAt: true,
      messages: {
        select: {
          direction: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
      contact: {
        select: {
          id: true,
          name: true,
          phone: true,
          customFields: true,
        },
      },
    },
  });
  const conversations = rawConversations
    .filter(
      (conversation: UnknownRecord) =>
        !isWorkspaceSelfTarget({
          phone: conversation.contact?.phone,
          selfIdentity,
        }),
    )
    .filter((conversation: UnknownRecord) => isConversationPendingForAgent(conversation))
    .sort((left: UnknownRecord, right: UnknownRecord) => {
      const leftTimestamp = new Date(left.lastMessageAt || 0).getTime();
      const rightTimestamp = new Date(right.lastMessageAt || 0).getTime();
      if (mode === 'prioritize_hot') {
        const unreadDiff = deriveOperationalUnreadCount(right) - deriveOperationalUnreadCount(left);
        if (unreadDiff !== 0) {
          return unreadDiff;
        }
      }
      return rightTimestamp - leftTimestamp;
    })
    .slice(0, limit);

  await createBacklogRunState({
    workspaceId,
    runId,
    total: conversations.length,
    mode,
  });

  if (!conversations.length) {
    await finishBacklogRunTask({
      workspaceId,
      runId,
      status: 'skipped',
      summary: 'Nenhuma conversa pendente encontrada.',
    });
    await finalizeBacklogIntoSilentCatalog({
      workspaceId,
      runId,
      reason: 'backlog_empty',
    });
    return { queued: 0, runId };
  }

  await publishAgentEvent({
    type: 'status',
    workspaceId,
    runId,
    phase: 'queue_start',
    persistent: true,
    message:
      mode === 'prioritize_hot'
        ? `Separei ${conversations.length} conversas e vou priorizar as mais recentes com maior volume de mensagens.`
        : `Separei ${conversations.length} conversas e vou responder por ordem dos mais recentes primeiro.`,
    meta: {
      total: conversations.length,
      mode,
    },
  });

  await forEachSequential(Array.from(conversations.entries()), async ([index, conversation]) => {
    const displayName = conversation.contact?.name || conversation.contact?.phone || 'contato';

    await publishAgentEvent({
      type: 'thought',
      workspaceId,
      runId,
      phase: 'queue_contact',
      message: `Preparando ${displayName} (${index + 1}/${conversations.length})`,
      meta: {
        contactId: conversation.contactId,
        contactName: conversation.contact?.name || null,
        phone: conversation.contact?.phone || null,
        unreadCount: deriveOperationalUnreadCount(conversation),
      },
    });

    await autopilotQueue.add(
      'scan-contact',
      {
        workspaceId,
        runId,
        deliveryMode: 'reactive',
        contactId: conversation.contactId,
        phone: conversation.contact?.phone || undefined,
        contactName: conversation.contact?.name || undefined,
        chatId:
          String(
            normalizeJsonObject((conversation.contact as UnknownRecord | undefined)?.customFields)
              .lastRemoteChatId ||
              normalizeJsonObject((conversation.contact as UnknownRecord | undefined)?.customFields)
                .lastCatalogChatId ||
              '',
          ).trim() || undefined,
        backlogIndex: index + 1,
        backlogTotal: conversations.length,
      },
      {
        jobId: buildQueueJobId('scan-contact', workspaceId, conversation.contactId, 'run', runId),
        removeOnComplete: true,
      },
    );
  });

  return {
    queued: conversations.length,
    runId,
  };
}
