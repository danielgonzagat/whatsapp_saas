import { randomUUID } from 'node:crypto';
import { prisma } from '../../db';
import { autopilotQueue } from '../../queue';
import { buildQueueJobId } from '../../job-id';
import { forEachSequential } from '../../utils/async-sequence';
import { AUTOPILOT_SWEEP_UNREAD_CONVERSATIONS_JOB, buildSweepUnreadConversationsJobData } from '../../contracts/autopilot-jobs';
import { normalizeJsonObject, type UnknownRecord, type WorkspaceSelfIdentity, CIA_BACKLOG_CONTINUATION_LIMIT } from './shared';
import { isWorkspaceSelfTarget } from './identity';
import { upsertCatalogConversationShell } from './opportunity';

export async function seedRemoteUnreadConversationShells(input: {
  workspaceId: string;
  selfIdentity?: WorkspaceSelfIdentity | null;
  chats: Array<{
    chatId: string;
    phone: string;
    name: string;
    unreadCount: number;
    activityTimestamp: number;
    chat: UnknownRecord;
  }>;
}) {
  let seeded = 0;
  await forEachSequential(input.chats, async (item) => {
    if (
      !item.phone ||
      isWorkspaceSelfTarget({
        phone: item.phone,
        chatId: item.chatId,
        ...(input.selfIdentity != null ? { selfIdentity: input.selfIdentity } : {}),
      })
    ) {
      return;
    }

    const existing = await prisma.contact
      .findFirst({
        where: {
          workspaceId: input.workspaceId,
          phone: item.phone,
        },
        select: {
          customFields: true,
        },
      })
      .catch(() => null);

    const contact = await prisma.contact.upsert({
      where: {
        workspaceId_phone: {
          workspaceId: input.workspaceId,
          phone: item.phone,
        },
      },
      update: {
        name: item.name || item.phone,
        customFields: {
          ...normalizeJsonObject(existing?.customFields),
          backlogSeededAt: new Date().toISOString(),
          lastCatalogChatId: item.chatId,
          lastRemoteChatId: item.chatId,
          lastResolvedChatId: item.chatId,
        },
      },
      create: {
        workspaceId: input.workspaceId,
        phone: item.phone,
        name: item.name || item.phone,
        customFields: {
          backlogSeededAt: new Date().toISOString(),
          lastCatalogChatId: item.chatId,
          lastRemoteChatId: item.chatId,
          lastResolvedChatId: item.chatId,
        },
      },
      select: {
        id: true,
      },
    });

    await upsertCatalogConversationShell({
      workspaceId: input.workspaceId,
      contactId: contact.id,
      lastMessageAt: item.activityTimestamp > 0 ? new Date(item.activityTimestamp) : new Date(),
      unreadCount: item.unreadCount,
    });

    seeded += 1;
  });

  return seeded;
}

export async function scheduleBacklogContinuation(input: {
  workspaceId: string;
  reason: string;
  limit?: number;
  mode?: string;
}) {
  const runId = randomUUID();
  const payload = buildSweepUnreadConversationsJobData({
    workspaceId: input.workspaceId,
    runId,
    limit: Number(input.limit || CIA_BACKLOG_CONTINUATION_LIMIT) || CIA_BACKLOG_CONTINUATION_LIMIT,
    mode:
      input.mode === 'prioritize_hot' || input.mode === 'reply_only_new'
        ? input.mode
        : 'reply_all_recent_first',
  });

  try {
    await autopilotQueue.add(AUTOPILOT_SWEEP_UNREAD_CONVERSATIONS_JOB, payload, {
      jobId: buildQueueJobId('cia-backlog-continuation', input.workspaceId, runId),
      removeOnComplete: true,
    });
    return { scheduled: true as const, runId, limit: payload.limit };
  } catch (error: unknown) {
    const errorInstanceofError =
      error instanceof Error
        ? error
        : new Error(typeof error === 'string' ? error : 'unknown error');
    return {
      scheduled: false as const,
      runId,
      limit: payload.limit,
      reason: String(errorInstanceofError?.message || 'schedule_failed'),
    };
  }
}
