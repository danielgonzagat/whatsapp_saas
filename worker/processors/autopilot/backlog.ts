import { createHash, randomUUID } from 'node:crypto';
import { WorkerLogger } from '../../logger';
import { prisma } from '../../db';
import { redis, redisPub } from '../../redis-client';
import { autopilotQueue } from '../../queue';
import { buildQueueJobId } from '../../job-id';
import { safeResolve } from '../../safe-path';
import { forEachSequential } from '../../utils/async-sequence';
import { publishAgentEvent } from '../../providers/agent-events';
import { buildDecisionEnvelope, buildHumanTask, persistHumanTask, persistSystemInsight, shouldAutonomousSend } from '../../providers/commercial-intelligence';
import { AUTOPILOT_SWEEP_UNREAD_CONVERSATIONS_JOB, buildSweepUnreadConversationsJobData } from '../../contracts/autopilot-jobs';
import { isConversationPendingForAgent } from '../../conversation-agent-state';
import { autopilotDecisionCounter } from '../../metrics';
import { unifiedWhatsAppProvider as whatsappApiProvider } from '../../providers/unified-whatsapp-provider';
import { log, normalizeJsonObject, type UnknownRecord, type WorkspaceSelfIdentity, type RemoteChatSummary, CIA_BACKLOG_CONTINUATION_LIMIT, CIA_CONTACT_CATALOG_LOOKBACK_DAYS, CIA_REMOTE_PENDING_PROBE_LIMIT, PENDING_MESSAGE_LIMIT, SILENCE_HOURS, SHARENON_DIGIT_REPLY_LOCK_MS, NON_DIGIT_RE, LINON_DIGIT_RE, D__D_S____S_DOE_RE } from './shared';
import { normalizeCatalogPhone, resolveCatalogPhoneFromChatId, resolveCanonicalChatId, buildLidMap, extractCatalogChatName, isIndividualWahaChatId, resolveLastMessageFromMe, resolveCatalogChatActivityTimestamp, isWorkspaceSelfTarget, resolveWorkspaceSelfIdentity } from './identity';
import { upsertCatalogConversationShell } from './opportunity';
import { beginAutonomyExecution, buildAutonomyExecutionKey, finishAutonomyExecution } from './cognition';
import { logAutopilotAction } from './safeguard';

async function scheduleCatalogContactsJob(
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
  } catch (error: unknown) {
    const errorInstanceofError =
      error instanceof Error
        ? error
        : new Error(typeof error === 'string' ? error : 'unknown error');
    const message = String(errorInstanceofError?.message || '');
    if (message.includes('Job is already waiting')) {
      return { scheduled: false, reason: 'already_waiting' };
    }
    return { scheduled: false, reason: message || 'schedule_failed' };
  }
}

export async function getRemoteUnreadChatSnapshot(
  workspaceId: string,
  limit = CIA_BACKLOG_CONTINUATION_LIMIT,
  selfIdentity?: WorkspaceSelfIdentity | null,
): Promise<
  Array<{
    chatId: string;
    canonicalChatId: string;
    phone: string;
    name: string;
    unreadCount: number;
    activityTimestamp: number;
    lastMessageFromMe: boolean | null;
    chat: UnknownRecord;
  }>
> {
  const chats: RemoteChatSummary[] = (await whatsappApiProvider
    .getChats(workspaceId)
    .catch((): RemoteChatSummary[] => [])) as RemoteChatSummary[];
  const lidMap = buildLidMap(await whatsappApiProvider.getLidMappings(workspaceId).catch(() => []));

  const normalizedChats = (Array.isArray(chats) ? chats : [])
    .map((chat: UnknownRecord) => {
      const chatId = String(chat?.id || '').trim();
      const canonicalChatId = resolveCanonicalChatId(chatId, lidMap);
      const lastMessageFromMe = resolveLastMessageFromMe(chat);
      const unreadCount = Number(chat?.unreadCount || chat?.unread || 0) || 0;
      const activityTimestamp = resolveCatalogChatActivityTimestamp(chat);

      return {
        chatId,
        canonicalChatId,
        phone: resolveCatalogPhoneFromChatId(chatId, lidMap),
        name: extractCatalogChatName(chat, canonicalChatId || chatId),
        unreadCount,
        activityTimestamp,
        lastMessageFromMe,
        chat,
      };
    })
    .filter(
      (item) =>
        item.phone &&
        !isWorkspaceSelfTarget({
          phone: item.phone,
          chatId: item.chatId,
          selfIdentity,
        }) &&
        isIndividualWahaChatId(item.chatId) &&
        item.activityTimestamp > 0,
    );

  const pending = new Map<
    string,
    {
      chatId: string;
      canonicalChatId: string;
      phone: string;
      name: string;
      unreadCount: number;
      activityTimestamp: number;
      lastMessageFromMe: boolean | null;
      chat: UnknownRecord;
    }
  >();

  for (const item of normalizedChats) {
    if (item.unreadCount > 0 || item.lastMessageFromMe === false) {
      pending.set(item.phone, {
        ...item,
        unreadCount:
          item.unreadCount > 0 ? item.unreadCount : item.lastMessageFromMe === false ? 1 : 0,
      });
    }
  }

  if (pending.size === 0) {
    const probeCandidates = normalizedChats
      .filter((item) => item.lastMessageFromMe === null && item.activityTimestamp > 0)
      .sort((left, right) => right.activityTimestamp - left.activityTimestamp)
      .slice(0, CIA_REMOTE_PENDING_PROBE_LIMIT);

    await forEachSequential(probeCandidates, async (candidate) => {
      const probeChatId = candidate.canonicalChatId || candidate.chatId;
      const messages = await whatsappApiProvider
        .getChatMessages(workspaceId, probeChatId, {
          limit: 3,
          offset: 0,
          downloadMedia: false,
        })
        .catch(() => []);

      const latestMessage = (Array.isArray(messages) ? messages : ([] as UnknownRecord[]))
        .map((message: UnknownRecord) => ({
          fromMe: message?.fromMe === true,
          timestamp: Number(message?.timestamp || message?.t || 0) || 0,
        }))
        .sort((left, right) => right.timestamp - left.timestamp)[0];

      if (!latestMessage || latestMessage.fromMe) {
        return;
      }

      pending.set(candidate.phone, {
        ...candidate,
        unreadCount: Math.max(1, candidate.unreadCount || 0),
        lastMessageFromMe: false,
      });
    });
  }

  return Array.from(pending.values())
    .sort((left, right) => {
      if (right.activityTimestamp !== left.activityTimestamp) {
        return right.activityTimestamp - left.activityTimestamp;
      }
      return right.unreadCount - left.unreadCount;
    })
    .slice(0, Math.max(1, limit));
}

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
        selfIdentity: input.selfIdentity,
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
      .catch(() => null /* not found */);

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

export async function maybeEscalateToHumanControl(input: {
  workspaceId: string;
  contactId?: string;
  contactName?: string;
  phone?: string;
  runId?: string;
  decisionEnvelope: ReturnType<typeof buildDecisionEnvelope>;
  messageContent?: string;
  intent?: string;
  action?: string;
}) {
  if (input.action === 'AUTONOMOUS_FALLBACK' && input.decisionEnvelope.riskFlags.length === 0) {
    return { blocked: false as const };
  }

  const allowedToSend = shouldAutonomousSend(input.decisionEnvelope, 'AUTONOMOUS');

  if (allowedToSend) {
    return { blocked: false as const };
  }

  const humanTask = buildHumanTask({
    workspaceId: input.workspaceId,
    contactId: input.contactId,
    phone: input.phone,
    decision: input.decisionEnvelope,
    messageContent: input.messageContent,
  });

  if (humanTask) {
    const lockedConversation = await lockConversationForHumanReview({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: input.phone,
    });
    const taskPayload = {
      ...humanTask,
      conversationId: lockedConversation?.id || null,
      status: 'OPEN' as const,
    };

    await persistHumanTask(prisma, {
      workspaceId: input.workspaceId,
      task: taskPayload,
    });

    await persistSystemInsight(prisma, {
      workspaceId: input.workspaceId,
      type: 'CIA_HUMAN_TASK',
      title: `Validação humana necessária para ${input.contactName || input.phone || 'contato'}`,
      description: humanTask.reason,
      severity: humanTask.urgency === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
      metadata: {
        contactId: input.contactId,
        phone: input.phone,
        taskType: humanTask.taskType,
        urgency: humanTask.urgency,
        riskFlags: input.decisionEnvelope.riskFlags,
      },
    });

    const transferExecution = await beginAutonomyExecution({
      workspaceId: input.workspaceId,
      actionType: 'TRANSFER_HUMAN',
      contactId: input.contactId,
      idempotencyKey: buildAutonomyExecutionKey({
        workspaceId: input.workspaceId,
        actionType: 'TRANSFER_HUMAN',
        contactId: input.contactId,
        phone: input.phone,
        payload: {
          reason: humanTask.reason,
          urgency: humanTask.urgency,
          riskFlags: input.decisionEnvelope.riskFlags,
          nextAction: input.decisionEnvelope.nextAction,
        },
      }),
      request: {
        phone: input.phone || null,
        reason: humanTask.reason,
        urgency: humanTask.urgency,
        riskFlags: input.decisionEnvelope.riskFlags,
        nextAction: input.decisionEnvelope.nextAction,
      },
    });
    if (transferExecution.allowed) {
      await finishAutonomyExecution(transferExecution.record?.id, 'SUCCESS', {
        response: {
          humanTaskId: humanTask.id,
          conversationId: lockedConversation?.id || null,
          status: 'conversation_locked_human',
        },
      });
    }
  }

  await publishAgentEvent({
    type: 'status',
    workspaceId: input.workspaceId,
    runId: input.runId,
    phase: 'human_validation',
    persistent: true,
    message: `Preciso de validação humana para ${input.contactName || input.phone || 'este contato'}. Motivo: ${
      humanTask?.reason || 'risco operacional identificado'
    }`,
    meta: {
      contactId: input.contactId,
      contactName: input.contactName || null,
      phone: input.phone || null,
      riskFlags: input.decisionEnvelope.riskFlags,
      urgency: humanTask?.urgency || null,
      nextAction: input.decisionEnvelope.nextAction,
    },
  });

  await logAutopilotAction({
    workspaceId: input.workspaceId,
    contactId: input.contactId,
    phone: input.phone,
    action: input.action || 'HUMAN_REVIEW_REQUIRED',
    intent: input.intent,
    status: 'skipped',
    reason: humanTask?.reason || 'human_validation_required',
    meta: {
      humanTaskId: humanTask?.id,
      riskFlags: input.decisionEnvelope.riskFlags,
      confidence: input.decisionEnvelope.confidence,
      capabilities: input.decisionEnvelope.capabilities,
    },
  });

  return {
    blocked: true as const,
    summary: humanTask?.reason || 'A IA decidiu escalar este caso para validação humana.',
  };
}

export async function findConversationAutomationState(input: {
  workspaceId: string;
  contactId?: string;
  phone?: string;
}) {
  if (!input.contactId && !input.phone) {
    return null;
  }

  return prisma.conversation.findFirst({
    where: {
      workspaceId: input.workspaceId,
      ...(input.contactId
        ? { contactId: input.contactId }
        : input.phone
          ? { contact: { phone: input.phone } }
          : {}),
    },
    orderBy: [{ updatedAt: 'desc' }],
    select: {
      id: true,
      mode: true,
      status: true,
      assignedAgentId: true,
    },
  });
}

export async function lockConversationForHumanReview(input: {
  workspaceId: string;
  contactId?: string;
  phone?: string;
}) {
  const conversation = await findConversationAutomationState(input);
  if (!conversation || conversation.mode === 'HUMAN') {
    return conversation;
  }

  await prisma.conversation.updateMany({
    where: { id: conversation.id, workspaceId: input.workspaceId },
    data: { mode: 'HUMAN' },
  });

  return {
    ...conversation,
    mode: 'HUMAN',
  };
}

export function resolveScanDeliveryMode(data: {
  messageId?: string;
  runId?: string;
  deliveryMode?: 'reactive' | 'proactive';
}): 'reactive' | 'proactive' {
  if (data?.deliveryMode === 'reactive' || data?.deliveryMode === 'proactive') {
    return data.deliveryMode;
  }
  return data?.messageId && !data?.runId ? 'reactive' : 'proactive';
}

export function getSharedReplyLockKey(
  workspaceId: string,
  contactId?: string | null,
  phone?: string | null,
) {
  const normalizedPhone = String(phone || '').replace(NON_DIGIT_RE, '');
  return `autopilot:reply:${workspaceId}:${contactId || normalizedPhone}`;
}
