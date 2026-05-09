import { WorkerLogger } from '../../logger';
import { prisma } from '../../db';
import { redis } from '../../redis-client';
import { autopilotQueue, flowQueue } from '../../queue';
import { buildQueueJobId } from '../../job-id';
import { publishAgentEvent, finishBacklogRunTask } from '../../providers/agent-events';
import {
  autopilotDecisionCounter,
  autopilotGhostCloserCounter,
  autopilotPipelineCounter,
} from '../../metrics';
import { unifiedWhatsAppProvider as whatsappApiProvider } from '../../providers/unified-whatsapp-provider';
import { dispatchOutboundThroughFlow } from '../../providers/outbound-dispatcher';
import { channelEnabled, logFallback, sendEmail } from '../../providers/channel-dispatcher';
import {
  buildBusinessStateSnapshot,
  buildDecisionEnvelope,
  buildHumanTask,
  buildMissionPlan,
  computeDemandState,
  extractMarketSignals,
  persistBusinessSnapshot,
  persistDemandState,
  persistHumanTask,
  persistMarketSignals,
  persistSystemInsight,
  shouldAutonomousSend,
} from '../../providers/commercial-intelligence';
import {
  getDelayUntilWorkspaceWindowOpens,
  getWorkspaceLocalHour,
  isWithinWorkspaceWindow,
} from '../../providers/timezone';
import {
  extractTextResponse,
  mapUnifiedActionsToAutopilot,
  processWithUnifiedAgent,
  shouldUseUnifiedAgent,
} from '../../providers/unified-agent-integrator';
import { planCiaActions, summarizeDecisionCognition } from '../cia/brain';
import { buildCiaWorkspaceState, buildCiaWorkspaceStateFromSeed } from '../cia/build-state';
import {
  buildSeedCognitiveState,
  loadCustomerCognitiveState,
  persistCustomerCognitiveState,
  recordDecisionOutcome,
} from '../cia/cognitive-state';
import {
  assertCiaExhaustion,
  assertCiaGuarantees,
  buildCiaExhaustionReport,
  buildCiaGuaranteeReport,
} from '../cia/contracts';
import {
  analyzeForActiveListening,
  buildWhatsAppConversationPrompt,
  detectAndFixAntiPatterns,
} from '../cia/conversation-policy';
import {
  assertConversationTacticPlan,
  buildConversationTacticPlan,
} from '../cia/conversation-tactics';
import { pickVariant, recordDecisionLog, updateVariantOutcome } from '../cia/self-improvement';
import {
  log,
  normalizeJsonObject,
  isAutonomousEnabled,
  isCiaAutonomyMode,
  isExplicitProactiveOutreachAllowed,
  isCiaProactiveCycleEnabled,
  finalizeReplyStyle,
  isRecentLiveConversation,
  reportSmokeTest,
  findWorkspaceProductMatches,
  notifyBillingSuspended,
  PENDING_MESSAGE_LIMIT,
  SHARENON_DIGIT_REPLY_LOCK_MS,
  type UnknownRecord,
  type AutopilotDecision,
  type QuotedCustomerMessage,
  type WorkspaceSelfIdentity,
  CONVERSATION_HISTORY_LIMIT,
} from './shared';
import { ensureTrustedContactProfile } from './profile';
import { resolveLatestQuotedMessageId } from './safeguard';
import { logAutopilotAction, checkRateLimits, buildWorkspaceConfig } from './safeguard';
import {
  fetchConversationHistory,
  fetchCompressedContactContext,
  getKbContext,
  generateAutonomousFallbackResponse,
  computePersistentCognitiveState,
  computeCognitiveRewardSignal,
  buildCognitiveMessage,
  decideActionSafe,
  beginAutonomyExecution,
  buildAutonomyExecutionKey,
  finishAutonomyExecution,
} from './cognition';
import { executeAction, sendDirectAutopilotText } from './execution';
import {
  resolveWorkspaceSelfIdentity,
  isWorkspaceSelfTarget,
  resolveTrustedCatalogName,
  extractTrustedNameFromRemoteMessage,
} from './identity';
import {
  finalizeBacklogIntoSilentCatalog,
  getSharedReplyLockKey,
  resolveScanDeliveryMode,
  findConversationAutomationState,
  maybeEscalateToHumanControl,
} from './backlog';
import { resolveConversationOwner } from '../../conversation-agent-state';
import { forEachSequential, findFirstSequential } from '../../utils/async-sequence';

const scanLog = new WorkerLogger('autopilot:scan');

async function buildPendingMessageBatch(params: {
  workspaceId: string;
  contactId?: string;
  phone?: string;
  chatId?: string;
  fallbackMessageContent?: string;
  selfIdentity?: WorkspaceSelfIdentity | null;
}) {
  const { workspaceId, contactId, phone, chatId, fallbackMessageContent, selfIdentity } = params;

  let contact = contactId
    ? await prisma.contact.findFirst({
        where: { id: contactId, workspaceId },
        select: {
          id: true,
          phone: true,
          leadScore: true,
          name: true,
          customFields: true,
        },
      })
    : null;

  if (!contact && phone) {
    contact = await prisma.contact.findFirst({
      where: { workspaceId, phone },
      select: {
        id: true,
        phone: true,
        leadScore: true,
        name: true,
        customFields: true,
      },
    });
  }

  const resolvedContactId = contact?.id || contactId;
  const resolvedPhone = contact?.phone || phone;

  if (!resolvedContactId || !resolvedPhone) {
    return null;
  }

  if (
    isWorkspaceSelfTarget({
      phone: resolvedPhone,
      chatId,
      selfIdentity,
    })
  ) {
    return null;
  }

  const lastOutbound = await prisma.message.findFirst({
    where: {
      workspaceId,
      contactId: resolvedContactId,
      direction: 'OUTBOUND',
    },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  const inboundMessages = await prisma.message.findMany({
    where: {
      workspaceId,
      contactId: resolvedContactId,
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
    take: PENDING_MESSAGE_LIMIT,
    select: {
      id: true,
      externalId: true,
      content: true,
      createdAt: true,
    },
  });

  const usableMessages = inboundMessages.filter(
    (message) => String(message.content || '').trim().length > 0,
  );
  let effectiveMessages = usableMessages.length
    ? usableMessages
    : fallbackMessageContent
      ? [
          {
            id: undefined as string | undefined,
            externalId: undefined as string | undefined,
            content: fallbackMessageContent,
            createdAt: new Date(),
          },
        ]
      : [];

  const storedCustomFields = normalizeJsonObject(contact?.customFields);
  let resolvedContactName = resolveTrustedCatalogName(
    resolvedPhone,
    contact?.name,
    storedCustomFields.remotePushName,
  );
  const remoteChatCandidates = Array.from(
    new Set(
      [
        String(chatId || '').trim(),
        String(storedCustomFields.lastRemoteChatId || '').trim(),
        String(storedCustomFields.lastCatalogChatId || '').trim(),
        String(storedCustomFields.lastResolvedChatId || '').trim(),
        `${resolvedPhone}@c.us`,
      ].filter(Boolean),
    ),
  );

  let resolvedRemoteChatId =
    remoteChatCandidates.find((candidate) => candidate.includes('@')) || `${resolvedPhone}@c.us`;

  if (!effectiveMessages.length && resolvedPhone) {
    await findFirstSequential(remoteChatCandidates, async (remoteChatId) => {
      const remoteMessages = await whatsappApiProvider
        .getChatMessages(workspaceId, remoteChatId, {
          limit: Math.max(PENDING_MESSAGE_LIMIT * 4, 20),
          offset: 0,
          downloadMedia: false,
        })
        .catch(() => []);

      if (!Array.isArray(remoteMessages) || remoteMessages.length === 0) {
        return undefined;
      }

      const normalizedRemoteMessages = (remoteMessages as UnknownRecord[])
        .map((message) => ({
          id: undefined as string | undefined,
          externalId:
            String(
              message?.externalId ||
                message?.id ||
                message?.key?.id ||
                message?.key?._serialized ||
                '',
            ).trim() || undefined,
          direction:
            String(message?.direction || '')
              .trim()
              .toUpperCase() ||
            (message?.fromMe === true ||
            message?.key?.fromMe === true ||
            message?.id?.fromMe === true
              ? 'OUTBOUND'
              : 'INBOUND'),
          content: String(
            message?.content || message?.body || message?.text?.body || message?.caption || '',
          ).trim(),
          createdAt:
            message?.createdAt || message?.timestamp || message?.messageTimestamp || new Date(),
        }))
        .filter((message) => message.content)
        .sort(
          (left, right) =>
            new Date(left.createdAt as string | number | Date).getTime() -
            new Date(right.createdAt as string | number | Date).getTime(),
        );

      for (const remoteMessage of (Array.isArray(remoteMessages)
        ? remoteMessages
        : []) as UnknownRecord[]) {
        const remoteTrustedName = extractTrustedNameFromRemoteMessage(remoteMessage, resolvedPhone);
        if (remoteTrustedName) {
          resolvedContactName = remoteTrustedName;
          break;
        }
      }

      const latestRemoteMessage =
        normalizedRemoteMessages[normalizedRemoteMessages.length - 1] || null;
      if (latestRemoteMessage?.direction === 'OUTBOUND') {
        return undefined;
      }

      const remoteInboundAfterLastOutbound = normalizedRemoteMessages.filter(
        (message) =>
          message.direction === 'INBOUND' &&
          (!lastOutbound?.createdAt ||
            new Date(message.createdAt as string | number | Date).getTime() >
              lastOutbound.createdAt.getTime()),
      );

      const trailingInbound: typeof normalizedRemoteMessages = [];
      for (let index = normalizedRemoteMessages.length - 1; index >= 0; index -= 1) {
        const message = normalizedRemoteMessages[index];
        if (message.direction === 'OUTBOUND') {
          break;
        }
        if (message.direction === 'INBOUND') {
          trailingInbound.unshift(message);
        }
        if (trailingInbound.length >= PENDING_MESSAGE_LIMIT) {
          break;
        }
      }

      const remotePendingMessages = (
        remoteInboundAfterLastOutbound.length ? remoteInboundAfterLastOutbound : trailingInbound
      ).slice(-PENDING_MESSAGE_LIMIT);

      if (remotePendingMessages.length > 0) {
        effectiveMessages = remotePendingMessages;
        resolvedRemoteChatId = remoteChatId;
        return true;
      }
      return undefined;
    });
  }

  if (!effectiveMessages.length) {
    return null;
  }

  const aggregatedMessage =
    effectiveMessages.length === 1
      ? String(effectiveMessages[0].content)
      : effectiveMessages
          .map((message, index: number) => `[${index + 1}] ${String(message.content || '').trim()}`)
          .join('\n');

  return {
    contactId: resolvedContactId,
    phone: resolvedPhone,
    chatId: resolvedRemoteChatId,
    contactName: resolvedContactName || resolvedPhone,
    leadScore: contact?.leadScore,
    messageContent: aggregatedMessage,
    messageCount: effectiveMessages.length,
    messageIds: effectiveMessages.map((message) => message.id).filter(Boolean),
    providerMessageIds: effectiveMessages.map((message) => message.externalId).filter(Boolean),
    customerMessages: effectiveMessages
      .map((message) => ({
        content: String(message.content || '').trim(),
        quotedMessageId: String(message.externalId || '').trim() || undefined,
        createdAt: message.createdAt?.toISOString?.() || undefined,
      }))
      .filter((message: QuotedCustomerMessage) => message.content.length > 0),
  };
}

export async function runScanContact(data: UnknownRecord) {
  const { workspaceId } = data || {};
  if (!workspaceId) {
    return;
  }
  const smokeTestId = data?.smokeTestId as string | undefined;
  const smokeMode = data?.smokeMode === 'live' ? 'live' : 'dry-run';
  const runId = data?.runId as string | undefined;
  const requestedDeliveryMode = resolveScanDeliveryMode(data || {});

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  const settings = (workspace?.providerSettings ?? {}) as UnknownRecord;
  const selfIdentity = await resolveWorkspaceSelfIdentity(workspaceId, settings);
  const aggregated = await buildPendingMessageBatch({
    workspaceId,
    contactId: data?.contactId,
    phone: data?.phone,
    chatId: data?.chatId,
    fallbackMessageContent: data?.messageContent,
    selfIdentity,
  });

  let finalStatus: 'sent' | 'failed' | 'skipped' = 'skipped';
  let finalSummary = 'sem ação';
  let finalContactId = data?.contactId as string | undefined;
  let finalPhone = data?.phone as string | undefined;
  let finalContactName = data?.contactName as string | undefined;
  let finalChatId = data?.chatId as string | undefined;
  let replyLockKey: string | null = null;
  let keepReplyLock = false;

  try {
    if (!aggregated) {
      log.info('autopilot_scan_contact_empty', {
        workspaceId,
        contactId: data?.contactId,
        phone: data?.phone,
      });
      autopilotPipelineCounter.inc({
        workspaceId,
        stage: 'scan_contact',
        result: 'empty',
      });
      await reportSmokeTest(smokeTestId, {
        status: 'empty',
        workspaceId,
        contactId: data?.contactId,
        phone: data?.phone,
      });
      finalSummary = 'Nenhuma mensagem pendente para este contato.';
      return;
    }

    const {
      contactId,
      phone,
      chatId,
      contactName,
      leadScore,
      messageContent,
      messageCount,
      messageIds,
      providerMessageIds,
      customerMessages,
    } = aggregated;
    const effectiveDeliveryMode: 'reactive' | 'proactive' =
      requestedDeliveryMode === 'reactive'
        ? 'reactive'
        : isRecentLiveConversation(customerMessages || [])
          ? 'reactive'
          : 'proactive';

    finalContactId = contactId;
    finalPhone = phone;
    finalContactName = contactName;
    finalChatId = chatId;
    if (contactId && chatId) {
      const existingContact = await prisma.contact
        .findUnique({
          where: { id: contactId },
          select: { customFields: true },
        })
        .catch(() => null /* not found */);
      const existingCustomFields = normalizeJsonObject(existingContact?.customFields);
      await prisma.contact
        .update({
          where: { id: contactId },
          data: {
            customFields: {
              ...existingCustomFields,
              lastRemoteChatId: chatId,
              lastResolvedChatId: chatId,
            },
          },
        })
        .catch((err) => {
          log.warn('contact_update_chatid_failed', { error: err?.message, contactId });
          return undefined;
        });
    }
    if (
      isWorkspaceSelfTarget({
        phone,
        chatId,
        selfIdentity,
      })
    ) {
      finalSummary = 'O agente ignorou o próprio número da sessão.';
      await logAutopilotAction({
        workspaceId,
        contactId,
        phone,
        action: 'SCAN_CONTACT',
        intent: 'SELF_CONTACT',
        status: 'skipped',
        reason: 'workspace_self_contact',
        meta: {
          source: 'scan_contact',
          chatId: chatId || null,
        },
      });
      return;
    }
    replyLockKey = getSharedReplyLockKey(workspaceId, contactId, phone);
    const replyReserved = await redis.set(
      replyLockKey,
      String(data?.messageId || runId || 'scan-contact'),
      'PX',
      SHARENON_DIGIT_REPLY_LOCK_MS,
      'NX',
    );
    if (replyReserved !== 'OK') {
      finalSummary = 'Contato já está sendo respondido por outro pipeline.';
      return;
    }

    const conversation = await findConversationAutomationState({
      workspaceId,
      contactId,
      phone,
    });
    if (conversation && resolveConversationOwner(conversation) !== 'AGENT') {
      const blockedReason = conversation.assignedAgentId ? 'assigned_to_human' : 'human_mode_lock';
      await logAutopilotAction({
        workspaceId,
        contactId,
        phone,
        action: 'SCAN_CONTACT',
        intent: 'HUMAN_REVIEW_REQUIRED',
        status: 'skipped',
        reason: blockedReason,
        meta: {
          source: 'scan_contact',
          conversationId: conversation.id,
          conversationMode: conversation.mode,
          conversationStatus: conversation.status,
          assignedAgentId: conversation.assignedAgentId || null,
          owner: resolveConversationOwner(conversation),
        },
      });
      autopilotPipelineCounter.inc({
        workspaceId,
        stage: 'scan_contact',
        result: blockedReason,
      });
      await publishAgentEvent({
        type: 'status',
        workspaceId,
        runId,
        phase: 'human_mode_lock',
        persistent: true,
        message: `A conversa com ${contactName || phone} está aguardando ação humana.`,
        meta: {
          contactId,
          contactName,
          phone,
          conversationId: conversation.id,
          conversationMode: conversation.mode,
          assignedAgentId: conversation.assignedAgentId || null,
          owner: resolveConversationOwner(conversation),
        },
      });
      finalSummary = 'Conversa travada em modo humano.';
      return;
    }

    log.info('autopilot_scan_contact', {
      workspaceId,
      contactId,
      phone,
      messageCount,
    });
    autopilotPipelineCounter.inc({
      workspaceId,
      stage: 'scan_contact',
      result: 'processing',
    });
    await reportSmokeTest(smokeTestId, {
      status: 'processing',
      workspaceId,
      contactId,
      phone,
      messageCount,
    });

    await publishAgentEvent({
      type: 'thought',
      workspaceId,
      runId,
      phase: 'open_contact',
      message: `Abrindo conversa com ${contactName || phone}`,
      meta: {
        contactId,
        contactName,
        phone,
        backlogIndex: data?.backlogIndex,
        backlogTotal: data?.backlogTotal,
      },
    });

    if (!isAutonomousEnabled(settings)) {
      autopilotDecisionCounter.inc({
        workspaceId,
        intent: 'DISABLED',
        action: 'NONE',
        result: 'skipped',
      });
      autopilotPipelineCounter.inc({
        workspaceId,
        stage: 'scan_contact',
        result: 'disabled',
      });
      await reportSmokeTest(smokeTestId, {
        status: 'disabled',
        workspaceId,
        contactId,
        phone,
      });
      finalSummary = 'Autopilot desativado para este workspace.';
      return;
    }

    if (settings?.billingSuspended === true) {
      log.info('autopilot_skip_billing_suspended', { workspaceId });
      try {
        await prisma.autopilotEvent.create({
          data: {
            workspaceId,
            contactId,
            intent: 'BILLING',
            action: 'SUSPENDED',
            status: 'skipped',
            reason: 'billing_suspended',
            meta: { source: 'autopilot_worker' },
          },
        });
      } catch (err: unknown) {
        const errInstanceofError =
          err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
        log.warn('autopilot_event_billing_skip_failed', { error: errInstanceofError?.message });
      }
      await notifyBillingSuspended(workspaceId);
      autopilotDecisionCounter.inc({
        workspaceId,
        intent: 'BILLING_SUSPENDED',
        action: 'NONE',
        result: 'skipped',
      });
      autopilotPipelineCounter.inc({
        workspaceId,
        stage: 'scan_contact',
        result: 'billing_suspended',
      });
      await reportSmokeTest(smokeTestId, {
        status: 'billing_suspended',
        workspaceId,
        contactId,
        phone,
      });
      finalSummary = 'Billing suspenso. O contato não pode ser atendido automaticamente.';
      return;
    }

    const productMatches = await findWorkspaceProductMatches(workspaceId, messageContent);

    await publishAgentEvent({
      type: 'thought',
      workspaceId,
      runId,
      phase: 'analyze_contact',
      message:
        productMatches.length > 0
          ? `Identifiquei interesse em ${productMatches.join(', ')}.`
          : 'Lendo o histórico recente e entendendo a intenção do contato.',
      meta: {
        contactId,
        contactName,
        phone,
        matchedProducts: productMatches,
      },
    });

    const demandState = computeDemandState({
      lastMessageAt: new Date(),
      unreadCount: messageCount,
      leadScore: leadScore || 0,
      lastMessageText: messageContent,
    });

    if (contactId) {
      await persistDemandState(prisma, {
        workspaceId,
        contactId,
        state: demandState,
        contactName,
      });
    }

    const cognitiveState = await computePersistentCognitiveState({
      workspaceId,
      conversationId: conversation?.id,
      contactId,
      phone,
      contactName,
      messageContent,
      unreadCount: messageCount,
      lastMessageAt: new Date(),
      leadScore: leadScore || 0,
      demandState,
      source: 'scan_contact',
    });

    await publishAgentEvent({
      type: 'thought',
      workspaceId,
      runId,
      phase: 'cognitive_state',
      message: `Estado cognitivo de ${contactName || phone}: ${cognitiveState.summary}`,
      meta: {
        contactId,
        contactName,
        phone,
        nextBestAction: cognitiveState.nextBestAction,
        intent: cognitiveState.intent,
        stage: cognitiveState.stage,
        confidence: cognitiveState.classificationConfidence,
      },
    });

    if (cognitiveState.nextBestAction === 'WAIT') {
      await publishAgentEvent({
        type: 'status',
        workspaceId,
        runId,
        phase: 'cognitive_wait',
        message: `Vou esperar mais sinais antes de agir com ${contactName || phone}.`,
        meta: {
          contactId,
          phone,
          nextBestAction: cognitiveState.nextBestAction,
          summary: cognitiveState.summary,
        },
      });
      await logAutopilotAction({
        workspaceId,
        contactId,
        phone,
        action: 'SCAN_CONTACT',
        intent: cognitiveState.intent,
        status: 'skipped',
        reason: 'cognitive_wait',
        meta: {
          source: 'scan_contact',
          nextBestAction: cognitiveState.nextBestAction,
          cognitiveSummary: cognitiveState.summary,
        },
      });
      await recordDecisionOutcome(prisma, {
        workspaceId,
        contactId,
        conversationId: conversation?.id,
        phone,
        action: cognitiveState.nextBestAction,
        outcome: 'WAITED',
        reward: computeCognitiveRewardSignal(cognitiveState.nextBestAction, cognitiveState),
        message: cognitiveState.summary,
        metadata: {
          source: 'scan_contact',
        },
      });
      finalSummary = 'Estado cognitivo indicou espera antes da próxima ação.';
      return;
    }

    if (cognitiveState.nextBestAction === 'ESCALATE_HUMAN') {
      const cognitiveEnvelope = buildDecisionEnvelope({
        intent: cognitiveState.intent,
        action: 'COGNITIVE_ESCALATION',
        confidence: cognitiveState.classificationConfidence,
        messageContent,
        demandState,
        matchedProducts: productMatches,
      });
      const humanGate = await maybeEscalateToHumanControl({
        workspaceId,
        contactId,
        contactName,
        phone,
        runId,
        decisionEnvelope: cognitiveEnvelope,
        messageContent,
        intent: cognitiveState.intent,
        action: 'COGNITIVE_ESCALATION',
      });
      await recordDecisionOutcome(prisma, {
        workspaceId,
        contactId,
        conversationId: conversation?.id,
        phone,
        action: cognitiveState.nextBestAction,
        outcome: humanGate.blocked ? 'ESCALATED' : 'SKIPPED',
        reward: computeCognitiveRewardSignal(cognitiveState.nextBestAction, cognitiveState),
        message: cognitiveState.summary,
        metadata: {
          source: 'scan_contact',
          blocked: humanGate.blocked,
        },
      });
      if (humanGate.blocked) {
        finalSummary = humanGate.summary;
        return;
      }
    }

    if (
      [
        'ASK_CLARIFYING',
        'SOCIAL_PROOF',
        'OFFER',
        'PAYMENT_RECOVERY',
        'FOLLOWUP_SOFT',
        'FOLLOWUP_URGENT',
      ].includes(cognitiveState.nextBestAction)
    ) {
      const conversationTacticPlan = buildConversationTacticPlan({
        action: cognitiveState.nextBestAction,
        state: cognitiveState,
      });
      assertConversationTacticPlan(conversationTacticPlan);
      const text = buildCognitiveMessage({
        action: cognitiveState.nextBestAction,
        state: cognitiveState,
        contactName,
        matchedProducts: productMatches,
        tactic: conversationTacticPlan.selectedTactic,
      });

      const cognitiveEnvelope = buildDecisionEnvelope({
        intent: cognitiveState.intent,
        action: cognitiveState.nextBestAction,
        confidence: cognitiveState.classificationConfidence,
        messageContent,
        demandState,
        matchedProducts: productMatches,
      });
      const humanGate = await maybeEscalateToHumanControl({
        workspaceId,
        contactId,
        contactName,
        phone,
        runId,
        decisionEnvelope: cognitiveEnvelope,
        messageContent,
        intent: cognitiveState.intent,
        action: cognitiveState.nextBestAction,
      });
      if (humanGate.blocked) {
        await recordDecisionOutcome(prisma, {
          workspaceId,
          contactId,
          conversationId: conversation?.id,
          phone,
          action: cognitiveState.nextBestAction,
          outcome: 'ESCALATED',
          reward: computeCognitiveRewardSignal(cognitiveState.nextBestAction, cognitiveState),
          message: text,
          metadata: {
            source: 'scan_contact',
            blocked: true,
          },
        });
        finalSummary = humanGate.summary;
        return;
      }

      if (smokeTestId && smokeMode !== 'live') {
        autopilotPipelineCounter.inc({
          workspaceId,
          stage: 'reply',
          result: 'preview',
        });
        await reportSmokeTest(smokeTestId, {
          status: 'completed',
          mode: smokeMode,
          workspaceId,
          contactId,
          phone,
          decision: {
            intent: cognitiveState.intent,
            action: cognitiveState.nextBestAction,
          },
          responseText: text,
          matchedProducts: productMatches,
        });
        finalSummary = 'Resposta cognitiva gerada em modo preview.';
        return;
      }

      const sendResult = await sendDirectAutopilotText({
        workspaceId,
        contactId,
        conversationId: conversation?.id,
        phone,
        contactName,
        text,
        settings,
        intent: cognitiveState.intent,
        reason: 'cognitive_next_best_action',
        workspaceRecord: (workspace as UnknownRecord) || undefined,
        intentConfidence: cognitiveState.classificationConfidence,
        actionLabel: cognitiveState.nextBestAction,
        usedHistory: true,
        usedKb: productMatches.length > 0,
        deliveryMode: effectiveDeliveryMode,
        smokeTestId,
        smokeMode,
        runId,
        customerMessages,
        idempotencyContext: {
          source: 'scan_contact_cognitive_action',
          action: cognitiveState.nextBestAction,
          conversationTactic: conversationTacticPlan.selectedTactic || null,
          conversationTacticUniverse: conversationTacticPlan.candidates,
          messageIds,
          providerMessageIds,
          runId: runId || null,
        },
      });
      finalStatus = sendResult === 'executed' ? 'sent' : 'skipped';
      await recordDecisionOutcome(prisma, {
        workspaceId,
        contactId,
        conversationId: conversation?.id,
        phone,
        action: cognitiveState.nextBestAction,
        outcome: sendResult === 'executed' ? 'SENT' : 'SKIPPED',
        reward: computeCognitiveRewardSignal(cognitiveState.nextBestAction, cognitiveState),
        message: text,
        metadata: {
          source: 'scan_contact',
          matchedProducts: productMatches,
        },
      });
      finalSummary =
        sendResult === 'executed'
          ? 'Resposta cognitiva enviada com sucesso.'
          : 'Ação cognitiva pulada por política operacional.';
      return;
    }

    const useUnifiedAgent =
      cognitiveState.nextBestAction === 'RESPOND' ||
      productMatches.length > 0 ||
      shouldUseUnifiedAgent({
        messageContent,
        leadScore: leadScore || undefined,
        settings,
      });

    let decision: AutopilotDecision;
    let unifiedAgentResponse: string | null = null;

    if (useUnifiedAgent) {
      log.info('autopilot_using_unified_agent', {
        workspaceId,
        contactId,
        messageCount,
        matchedProducts: productMatches,
      });

      const unifiedResult = await processWithUnifiedAgent({
        workspaceId,
        contactId,
        phone,
        message: messageContent,
        context: {
          source: 'autopilot_worker',
          aggregatedPendingMessages: messageCount,
          pendingMessageIds: messageIds,
          matchedProducts: productMatches,
        },
      });

      if (unifiedResult) {
        decision = mapUnifiedActionsToAutopilot(unifiedResult.actions);
        unifiedAgentResponse = extractTextResponse(unifiedResult);

        log.info('autopilot_unified_decision', {
          decision,
          hasResponse: !!unifiedAgentResponse,
        });

        if (decision.alreadyExecuted) {
          const observedExecution = await beginAutonomyExecution({
            workspaceId,
            actionType: 'UNIFIED_AGENT_EXECUTED',
            contactId,
            conversationId: conversation?.id,
            idempotencyKey: buildAutonomyExecutionKey({
              workspaceId,
              actionType: 'UNIFIED_AGENT_EXECUTED',
              contactId,
              conversationId: conversation?.id,
              phone,
              payload: {
                source: 'unified_agent_already_executed',
                actions: unifiedResult.actions,
                response: unifiedAgentResponse || null,
                messageIds,
                runId: runId || null,
              },
            }),
            request: {
              phone,
              actions: unifiedResult.actions,
              response: unifiedAgentResponse || null,
              source: 'unified_agent_already_executed',
              messageIds,
              runId: runId || null,
            },
          });
          if (observedExecution.allowed) {
            await finishAutonomyExecution(observedExecution.record?.id, 'SUCCESS', {
              response: {
                channel: 'UNIFIED_AGENT_TOOL',
                actions: unifiedResult.actions,
                response: unifiedAgentResponse || null,
              },
            });
          }
          keepReplyLock = true;

          autopilotDecisionCounter.inc({
            workspaceId,
            intent: decision.intent,
            action: 'UNIFIED_AGENT',
            result: 'success',
          });
          autopilotPipelineCounter.inc({
            workspaceId,
            stage: 'unified_agent',
            result: 'already_executed',
          });
          await reportSmokeTest(smokeTestId, {
            status: 'already_executed',
            workspaceId,
            contactId,
            phone,
            decision,
          });
          finalSummary = 'A resposta já havia sido executada.';
          return;
        }

        if (unifiedAgentResponse && !decision.alreadyExecuted) {
          const decisionEnvelope = buildDecisionEnvelope({
            intent: decision.intent,
            action: 'UNIFIED_AGENT_TEXT',
            confidence: decision.confidence,
            messageContent,
            demandState,
            matchedProducts: productMatches,
          });

          const humanGate = await maybeEscalateToHumanControl({
            workspaceId,
            contactId,
            contactName,
            phone,
            runId,
            decisionEnvelope,
            messageContent,
            intent: decision.intent,
            action: 'UNIFIED_AGENT_TEXT',
          });
          if (humanGate.blocked) {
            finalSummary = humanGate.summary;
            return;
          }

          await publishAgentEvent({
            type: 'thought',
            workspaceId,
            runId,
            phase: 'compose_reply',
            message: `Preparando resposta para ${contactName || phone}.`,
            meta: {
              contactId,
              contactName,
              phone,
              intent: decision.intent,
            },
          });

          if (smokeTestId && smokeMode !== 'live') {
            autopilotPipelineCounter.inc({
              workspaceId,
              stage: 'reply',
              result: 'preview',
            });
            await reportSmokeTest(smokeTestId, {
              status: 'completed',
              mode: smokeMode,
              workspaceId,
              contactId,
              phone,
              decision,
              responseText: unifiedAgentResponse,
              matchedProducts: productMatches,
            });
            finalSummary = 'Resposta gerada em modo preview.';
            return;
          }

          const sendResult = await sendDirectAutopilotText({
            workspaceId,
            contactId,
            conversationId: conversation?.id,
            phone,
            contactName,
            text: unifiedAgentResponse,
            settings,
            intent: decision.intent,
            reason: decision.reason,
            workspaceRecord: (workspace as UnknownRecord) || undefined,
            intentConfidence: decision.confidence,
            actionLabel: 'UNIFIED_AGENT_TEXT',
            usedHistory: true,
            usedKb: productMatches.length > 0,
            deliveryMode: effectiveDeliveryMode,
            smokeTestId,
            smokeMode,
            runId,
            customerMessages,
            idempotencyContext: {
              source: 'scan_contact_unified_agent_text',
              messageIds,
              providerMessageIds,
              runId: runId || null,
            },
          });

          finalStatus = sendResult === 'executed' ? 'sent' : 'skipped';
          keepReplyLock = sendResult === 'executed';
          finalSummary =
            sendResult === 'executed'
              ? 'Resposta enviada com texto gerado pelo Unified Agent.'
              : 'A resposta foi pulada por política operacional.';
          return;
        }
      } else {
        log.warn('autopilot_unified_fallback', { workspaceId });
        decision = await decideActionSafe({
          workspaceId,
          contactId,
          phone,
          messageContent,
          settings,
        });
      }
    } else {
      decision = await decideActionSafe({
        workspaceId,
        contactId,
        phone,
        messageContent,
        settings,
      });
    }

    log.info('autopilot_decision', { decision });

    if (!decision.action || decision.action === 'NONE') {
      const decisionEnvelope = buildDecisionEnvelope({
        intent: decision.intent || 'GENERAL_ASSISTANCE',
        action: 'AUTONOMOUS_FALLBACK',
        confidence: decision.confidence,
        messageContent,
        demandState,
        matchedProducts: productMatches,
      });

      const humanGate = await maybeEscalateToHumanControl({
        workspaceId,
        contactId,
        contactName,
        phone,
        runId,
        decisionEnvelope,
        messageContent,
        intent: decision.intent || 'GENERAL_ASSISTANCE',
        action: 'AUTONOMOUS_FALLBACK',
      });
      if (humanGate.blocked) {
        finalSummary = humanGate.summary;
        return;
      }

      const fallbackText = await generateAutonomousFallbackResponse({
        workspaceId,
        messageContent,
        settings,
        matchedProducts: productMatches,
        contactId,
        phone,
        deliveryMode: effectiveDeliveryMode,
        contactName,
        cognitiveState,
      });

      await publishAgentEvent({
        type: 'thought',
        workspaceId,
        runId,
        phase: 'compose_reply',
        message: `Preparando uma resposta útil para ${contactName || phone}.`,
        meta: {
          contactId,
          contactName,
          phone,
        },
      });

      if (smokeTestId && smokeMode !== 'live') {
        autopilotPipelineCounter.inc({
          workspaceId,
          stage: 'reply',
          result: 'preview',
        });
        await reportSmokeTest(smokeTestId, {
          status: 'completed',
          mode: smokeMode,
          workspaceId,
          contactId,
          phone,
          decision,
          responseText: fallbackText,
          matchedProducts: productMatches,
        });
        finalSummary = 'Fallback gerado em modo preview.';
        return;
      }

      const sendResult = await sendDirectAutopilotText({
        workspaceId,
        contactId,
        conversationId: conversation?.id,
        phone,
        contactName,
        text: fallbackText,
        settings,
        intent: decision.intent || 'GENERAL_ASSISTANCE',
        reason: decision.reason || 'autonomous_fallback',
        workspaceRecord: (workspace as UnknownRecord) || undefined,
        intentConfidence: decision.confidence,
        actionLabel: 'AUTONOMOUS_FALLBACK',
        usedHistory: true,
        usedKb: productMatches.length > 0 || decision.usedKb,
        deliveryMode: effectiveDeliveryMode,
        smokeTestId,
        smokeMode,
        runId,
        customerMessages,
        idempotencyContext: {
          source: 'scan_contact_autonomous_fallback',
          messageIds,
          providerMessageIds,
          runId: runId || null,
        },
      });

      finalStatus = sendResult === 'executed' ? 'sent' : 'skipped';
      keepReplyLock = sendResult === 'executed';
      finalSummary =
        sendResult === 'executed'
          ? 'Resposta enviada com fallback autônomo.'
          : 'Fallback pulado por política operacional.';
      return;
    }

    const decisionEnvelope = buildDecisionEnvelope({
      intent: decision.intent,
      action: decision.action,
      confidence: decision.confidence,
      messageContent,
      demandState,
      matchedProducts: productMatches,
    });

    const humanGate = await maybeEscalateToHumanControl({
      workspaceId,
      contactId,
      contactName,
      phone,
      runId,
      decisionEnvelope,
      messageContent,
      intent: decision.intent,
      action: decision.action,
    });
    if (humanGate.blocked) {
      finalSummary = humanGate.summary;
      return;
    }

    await publishAgentEvent({
      type: 'thought',
      workspaceId,
      runId,
      phase: 'compose_reply',
      message: `Executando a ação ${decision.action} para ${contactName || phone}.`,
      meta: {
        contactId,
        contactName,
        phone,
        action: decision.action,
        intent: decision.intent,
      },
    });

    const executeResult = await executeAction(decision.action, {
      workspaceId,
      contactId,
      conversationId: conversation?.id,
      phone,
      chatId,
      contactName,
      messageContent,
      settings,
      intent: decision.intent,
      reason: decision.reason,
      workspaceRecord: (workspace as UnknownRecord) || undefined,
      intentConfidence: decision.confidence,
      usedHistory: true,
      usedKb: productMatches.length > 0 || decision.usedKb,
      deliveryMode: effectiveDeliveryMode,
      smokeTestId,
      smokeMode,
      runId,
      customerMessages,
      idempotencyContext: {
        source: 'scan_contact_action',
        messageIds,
        providerMessageIds,
        runId: runId || null,
      },
    });

    finalStatus = executeResult === 'executed' ? 'sent' : 'skipped';
    keepReplyLock = executeResult === 'executed';
    finalSummary =
      executeResult === 'executed'
        ? `Ação ${decision.action} executada com sucesso.`
        : `Ação ${decision.action} pulada por política operacional.`;
  } catch (err: unknown) {
    const errInstanceofError =
      err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    finalStatus = 'failed';
    finalSummary = errInstanceofError?.message || 'Erro ao processar contato';
    throw err;
  } finally {
    if (finalStatus === 'sent') {
      const finalContactRecord = finalContactId
        ? await prisma.contact
            .findUnique({
              where: { id: finalContactId },
              select: {
                id: true,
                name: true,
                customFields: true,
              },
            })
            .catch(() => null /* not found */)
        : null;
      const finalCustomFields = normalizeJsonObject(finalContactRecord?.customFields);

      if (finalPhone) {
        const trustedProfile = await ensureTrustedContactProfile({
          workspaceId,
          contactId: finalContactId,
          phone: finalPhone,
          chatId:
            String(finalChatId || '').trim() ||
            String(finalCustomFields.lastRemoteChatId || '').trim() ||
            String(finalCustomFields.lastCatalogChatId || '').trim() ||
            String(finalCustomFields.lastResolvedChatId || '').trim() ||
            undefined,
          contactName: finalContactName,
          existingContact: finalContactRecord as unknown as { id?: string | null; name?: string | null; customFields?: UnknownRecord } | null,
        }).catch(() => ({
          contactId: '',
          trustedName: '',
          savedToWhatsapp: false,
        }));

        if (trustedProfile.contactId) {
          finalContactId = trustedProfile.contactId;
        }
        if (trustedProfile.trustedName) {
          finalContactName = trustedProfile.trustedName;
        }
      }

      const readCandidates = Array.from(
        new Set(
          [
            String(finalChatId || '').trim(),
            String(finalCustomFields.lastRemoteChatId || '').trim(),
            String(finalCustomFields.lastCatalogChatId || '').trim(),
            String(finalCustomFields.lastResolvedChatId || '').trim(),
            finalPhone ? `${String(finalPhone).trim()}@c.us` : '',
            finalPhone ? `${String(finalPhone).trim()}@s.whatsapp.net` : '',
          ].filter(Boolean),
        ),
      );

      await forEachSequential(readCandidates, async (candidate) => {
        await whatsappApiProvider.readChatMessages(workspaceId, candidate).catch((err) => {
          log.warn('read_chat_messages_failed', { error: err?.message, candidate });
          return undefined;
        });
      });

      if (finalContactId && finalPhone) {
        await Promise.resolve(
          autopilotQueue.add(
            'score-contact',
            {
              workspaceId,
              contactId: finalContactId,
              phone: finalPhone,
              contactName: finalContactName,
              chatId: finalChatId || `${finalPhone}@c.us`,
              reason: 'post_reply_score',
            },
            {
              jobId: buildQueueJobId('score-contact', workspaceId, finalContactId),
              removeOnComplete: true,
            },
          ),
        ).catch((err) => {
          log.warn('score_contact_queue_add_failed', { error: err?.message });
          return undefined;
        });
      }
    }

    if (replyLockKey && !keepReplyLock) {
      await redis.del(replyLockKey).catch(() => undefined);
    }
    if (runId) {
      const runState = await finishBacklogRunTask({
        workspaceId,
        runId,
        contactId: finalContactId,
        contactName: finalContactName,
        phone: finalPhone,
        status: finalStatus,
        summary: finalSummary,
      });
      if (runState && runState.finished >= runState.total) {
        await finalizeBacklogIntoSilentCatalog({
          workspaceId,
          runId,
          reason: 'backlog_completed',
        });
      }
    }
  }
}
