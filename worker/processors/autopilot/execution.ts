import { createHash, randomUUID } from 'node:crypto';
import OpenAI from 'openai';
import { WorkerLogger } from '../../logger';
import { prisma } from '../../db';
import { redis, redisPub } from '../../redis-client';
import { autopilotQueue, flowQueue } from '../../queue';
import { buildQueueJobId } from '../../job-id';
import { dispatchOutboundThroughFlow } from '../../providers/outbound-dispatcher';
import { WhatsAppEngine } from '../../providers/whatsapp-engine';
import { unifiedWhatsAppProvider as whatsappApiProvider } from '../../providers/unified-whatsapp-provider';
import { AIProvider } from '../../providers/ai-provider';
import { PlanLimitsProvider } from '../../providers/plan-limits';
import { channelEnabled, logFallback, sendEmail } from '../../providers/channel-dispatcher';
import { publishAgentEvent } from '../../providers/agent-events';
import {
  autopilotDecisionCounter,
  autopilotGhostCloserCounter,
  autopilotPipelineCounter,
} from '../../metrics';
import { detectAndFixAntiPatterns } from '../cia/conversation-policy';
import {
  log,
  normalizeJsonObject,
  type UnknownRecord,
  type WorkspaceSelfIdentity,
  type QuotedCustomerMessage,
  type AutopilotDecision,
  SHARENON_DIGIT_REPLY_LOCK_MS,
  W________W_______A_ZA_RE,
  RX_55_S__________D_2_RE,
  NON_DIGIT_RE,
} from './shared';
import {
  normalizeCatalogPhone,
  isWorkspaceSelfTarget,
  resolveWorkspaceSelfIdentity,
} from './identity';
import {
  findRecentDuplicateOutbound,
  dispatchAutonomousReplyPlan,
  generatePitchSafe,
  buildAutonomyExecutionKey,
  beginAutonomyExecution,
  finishAutonomyExecution,
  normalizeAutonomyLedgerValue,
  buildQuotedReplyPlan,
} from './cognition';
import {
  findConversationAutomationState,
  lockConversationForHumanReview,
} from './backlog';

import {
  logAutopilotAction,
  checkRateLimits,
  buildWorkspaceConfig,
  resolveLatestQuotedMessageId,
} from './safeguard';
import { sendAudioResponse } from './cycle';
import { isRecentLiveConversation, isExplicitProactiveOutreachAllowed, reportSmokeTest } from './shared';
import { ensureTrustedContactProfile } from './profile';

export async function executeAction(
  action: string,
  input: {
    workspaceId: string;
    contactId?: string;
    conversationId?: string;
    phone?: string;
    chatId?: string;
    contactName?: string;
    messageContent?: string;
    settings?: UnknownRecord;
    intent?: string;
    reason?: string;
    workspaceRecord?: UnknownRecord;
    intentConfidence?: number;
    usedHistory?: boolean;
    usedKb?: boolean;
    deliveryMode?: 'reactive' | 'proactive';
    smokeTestId?: string;
    smokeMode?: 'dry-run' | 'live';
    runId?: string;
    idempotencyContext?: Record<string, unknown>;
    customerMessages?: QuotedCustomerMessage[];
  },
) {
  if (!action || action === 'NONE') {
    return 'skipped';
  }

  let contactEmail: string | undefined;
  let contactRecord: UnknownRecord | undefined;

  let targetPhone = input.phone;
  if (!targetPhone && input.contactId) {
    const contact = await prisma.contact.findUnique({
      where: { id: input.contactId },
      select: {
        phone: true,
        email: true,
        customFields: true,
        optIn: true,
        optedOutAt: true,
        id: true,
        workspaceId: true,
        name: true,
        tags: { select: { name: true } },
      },
    });
    contactRecord = contact;
    targetPhone = contact?.phone || input.contactId;
    contactEmail = contact?.email || undefined;
  }

  if (!targetPhone) {
    return 'skipped';
  }
  const selfIdentity = await resolveWorkspaceSelfIdentity(
    input.workspaceId,
    input.settings || input.workspaceRecord?.providerSettings,
  );
  if (
    isWorkspaceSelfTarget({
      phone: targetPhone,
      selfIdentity,
    })
  ) {
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: 'skipped',
      reason: 'workspace_self_contact',
      intentConfidence: input.intentConfidence,
      meta: {
        source: 'execute_action',
      },
    });
    return 'skipped';
  }

  if (!contactEmail && input.workspaceId) {
    const byPhone = await prisma.contact.findFirst({
      where: { workspaceId: input.workspaceId, phone: targetPhone },
      select: {
        id: true,
        email: true,
        customFields: true,
        optIn: true,
        optedOutAt: true,
        workspaceId: true,
        name: true,
        tags: { select: { name: true } },
      },
    });
    if (byPhone) {
      contactRecord = byPhone;
      contactEmail = byPhone.email || undefined;
      input.contactId = input.contactId || byPhone.id;
    }
  }

  const displayName = input.contactName || contactRecord?.name || targetPhone || 'contato';
  const latestQuotedMessageId = await resolveLatestQuotedMessageId({
    workspaceId: input.workspaceId,
    contactId: input.contactId,
    conversationId: input.conversationId,
    phone: targetPhone,
    providerMessageIds: input.idempotencyContext?.providerMessageIds as string[] | undefined,
  });

  const compliance = await ensureCompliance(
    input.workspaceId,
    targetPhone,
    input.settings,
    contactRecord,
    input.deliveryMode || 'proactive',
  );
  if (!compliance.allowed) {
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: 'skipped',
      reason: compliance.reason,
      intentConfidence: input.intentConfidence,
      meta: { compliance: true },
    });
    autopilotDecisionCounter.inc({
      workspaceId: input.workspaceId,
      intent: input.intent || 'UNKNOWN',
      action,
      result: 'skipped_compliance',
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: 'reply',
      result: 'skipped_compliance',
    });
    await reportSmokeTest(input.smokeTestId, {
      status: 'skipped',
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      reason: compliance.reason,
    });
    return 'skipped';
  }

  const rate = await checkRateLimits(
    input.workspaceId,
    targetPhone,
    input.deliveryMode || 'proactive',
  );
  if (!rate.allowed) {
    log.info('autopilot_rate_limited', {
      workspaceId: input.workspaceId,
      phone: targetPhone,
      reason: rate.reason,
    });
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: 'skipped',
      reason: rate.reason || 'rate_limit',
    });
    autopilotDecisionCounter.inc({
      workspaceId: input.workspaceId,
      intent: input.intent || 'UNKNOWN',
      action,
      result: 'rate_limited',
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: 'reply',
      result: 'rate_limited',
    });
    await reportSmokeTest(input.smokeTestId, {
      status: 'skipped',
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      reason: rate.reason || 'rate_limit',
    });
    if (action === 'GHOST_CLOSER' || action === 'LEAD_UNLOCKER') {
      autopilotGhostCloserCounter.inc({
        workspaceId: input.workspaceId,
        action,
        result: 'rate_limited',
      });
    }
    return 'skipped';
  }

  const canSend = await PlanLimitsProvider.checkMessageLimit(input.workspaceId);
  if (!canSend.allowed) {
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: 'skipped',
      reason: canSend.reason || 'plan_limit',
      intentConfidence: input.intentConfidence,
      meta: {
        usedHistory: input.usedHistory,
        usedKb: input.usedKb,
      },
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: 'reply',
      result: 'blocked_plan_limit',
    });
    await reportSmokeTest(input.smokeTestId, {
      status: 'skipped',
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      reason: canSend.reason || 'plan_limit',
    });
    return 'skipped';
  }

  const msg = await buildMessage(action, input.messageContent || '', input.settings);
  if (!msg) {
    return 'skipped';
  }

  const idempotencyKey = buildAutonomyExecutionKey({
    workspaceId: input.workspaceId,
    actionType: action,
    contactId: input.contactId,
    conversationId: input.conversationId,
    phone: targetPhone,
    payload: {
      source: 'execute_action',
      message: msg,
      intent: input.intent,
      reason: input.reason,
      deliveryMode: input.deliveryMode || 'proactive',
      customerMessages: input.customerMessages || null,
      context: input.idempotencyContext || null,
    },
  });
  const idemCtx = input.idempotencyContext || {};
  const execution = await beginAutonomyExecution({
    workspaceId: input.workspaceId,
    actionType: action,
    contactId: input.contactId,
    conversationId: input.conversationId,
    workItemId: (idemCtx.workItemId as string | null) || null,
    proofId:
      (idemCtx.conversationProofId as string | null) ||
      (idemCtx.accountProofId as string | null) ||
      (idemCtx.cycleProofId as string | null) ||
      null,
    capabilityCode: (idemCtx.capabilityCode as string | null) || action,
    tacticCode: (idemCtx.conversationTactic as string | null) || null,
    idempotencyKey,
    request: {
      phone: targetPhone,
      message: msg,
      intent: input.intent,
      reason: input.reason,
      deliveryMode: input.deliveryMode || 'proactive',
      customerMessages: input.customerMessages || null,
      context: input.idempotencyContext || null,
    },
  });

  if (!execution.allowed) {
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: 'skipped',
      reason: execution.reason,
      intentConfidence: input.intentConfidence,
      meta: {
        duplicateExecution: true,
        idempotencyKey,
      },
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: 'reply',
      result: 'duplicate_execution',
    });
    await reportSmokeTest(input.smokeTestId, {
      status: 'skipped',
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      reason: execution.reason,
    });
    return 'skipped';
  }

  const recentDuplicate = await findRecentDuplicateOutbound({
    workspaceId: input.workspaceId,
    contactId: input.contactId || contactRecord?.id || null,
    content: msg,
  });
  if (recentDuplicate) {
    await finishAutonomyExecution(execution.record?.id, 'SKIPPED', {
      response: {
        duplicateMessageId: recentDuplicate.id,
        duplicateCreatedAt: recentDuplicate.createdAt?.toISOString?.() || null,
        mode: 'recent_duplicate_outbound',
      },
      error: 'recent_duplicate_outbound',
    });
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: 'skipped',
      reason: 'recent_duplicate_outbound',
      intentConfidence: input.intentConfidence,
      meta: {
        duplicateExecution: true,
        idempotencyKey,
        duplicateMessageId: recentDuplicate.id,
      },
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: 'reply',
      result: 'recent_duplicate_outbound',
    });
    return 'skipped';
  }

  await publishAgentEvent({
    type: 'typing',
    workspaceId: input.workspaceId,
    runId: input.runId,
    phase: 'typing',
    message: `Digitando resposta para ${displayName}.`,
    meta: {
      contactId: input.contactId,
      contactName: input.contactName || contactRecord?.name || null,
      conversationId: input.conversationId,
      phone: targetPhone,
      action,
      capabilityCode: (input.idempotencyContext?.capabilityCode as string | null) || action,
      tacticCode: (input.idempotencyContext?.conversationTactic as string | null) || null,
      conversationProofId: (input.idempotencyContext?.conversationProofId as string | null) || null,
      accountProofId: (input.idempotencyContext?.accountProofId as string | null) || null,
      cycleProofId: (input.idempotencyContext?.cycleProofId as string | null) || null,
    },
  });

  let sent = false;
  let sendError: string | undefined;
  let executionResponse: Record<string, unknown> | null = null;
  const followupEligible = action === 'SEND_OFFER' || action === 'GHOST_CLOSER';
  try {
    const started = Date.now();
    const workspaceCfg = buildWorkspaceConfig(
      input.workspaceId,
      input.settings,
      input.workspaceRecord,
    );

    if (action === 'SEND_AUDIO') {
      const audioSent = await sendAudioResponse(
        input.workspaceId,
        targetPhone,
        input.chatId,
        msg,
        input.settings,
        workspaceCfg,
        latestQuotedMessageId,
      );
      if (!audioSent) {
        const replyPlan = await dispatchAutonomousReplyPlan({
          workspaceId: input.workspaceId,
          phone: targetPhone,
          chatId: input.chatId,
          message: msg,
          idempotencyKey,
          customerMessages: input.customerMessages,
          settings: input.settings,
          quotedMessageId: latestQuotedMessageId,
          mirrorReplies:
            input.deliveryMode === 'reactive' &&
            isRecentLiveConversation(input.customerMessages || []),
        });
        executionResponse = {
          channel: 'FLOW_SEND_MESSAGE',
          fallbackFromAudio: true,
          message: msg,
          replyPlan,
        };
      } else {
        executionResponse = {
          channel: 'WHATSAPP_AUDIO',
          message: msg,
        };
      }
    } else {
      const replyPlan = await dispatchAutonomousReplyPlan({
        workspaceId: input.workspaceId,
        phone: targetPhone,
        chatId: input.chatId,
        message: msg,
        idempotencyKey,
        customerMessages: input.customerMessages,
        settings: input.settings,
        quotedMessageId: latestQuotedMessageId,
        mirrorReplies:
          input.deliveryMode === 'reactive' &&
          isRecentLiveConversation(input.customerMessages || []),
      });
      executionResponse = {
        channel: 'FLOW_SEND_MESSAGE',
        message: msg,
        replyPlan,
      };
    }

    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: 'executed',
      reason: input.reason,
      latencyMs: Date.now() - started,
      intentConfidence: input.intentConfidence,
      meta: {
        usedHistory: input.usedHistory,
        usedKb: input.usedKb,
        audioMode: action === 'SEND_AUDIO',
      },
    });
    autopilotDecisionCounter.inc({
      workspaceId: input.workspaceId,
      intent: input.intent || 'UNKNOWN',
      action,
      result: 'executed',
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: 'reply',
      result: 'sent',
    });
    await reportSmokeTest(input.smokeTestId, {
      status: 'completed',
      mode: input.smokeMode || 'live',
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      responseText: msg,
    });
    if (action === 'GHOST_CLOSER' || action === 'LEAD_UNLOCKER') {
      autopilotGhostCloserCounter.inc({
        workspaceId: input.workspaceId,
        action,
        result: 'executed',
      });
    }
    sent = true;

    if (followupEligible && isExplicitProactiveOutreachAllowed(input.settings)) {
      await autopilotQueue.add(
        'followup-contact',
        {
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          phone: targetPhone,
          reason: 'buying_signal_followup',
          scheduledAt: new Date().toISOString(),
        },
        {
          delay: 45 * 60 * 1000,
          jobId: `followup-${input.contactId || targetPhone}-bs`,
          removeOnComplete: true,
        },
      );
    }
  } catch (err: unknown) {
    const errInstanceofError =
      err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    log.error('autopilot_send_error', { err: errInstanceofError.message });
    sendError = errInstanceofError?.message || 'send_error';
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: 'error',
      reason: errInstanceofError?.message || 'send_error',
      intentConfidence: input.intentConfidence,
      meta: {
        usedHistory: input.usedHistory,
        usedKb: input.usedKb,
      },
    });
    autopilotDecisionCounter.inc({
      workspaceId: input.workspaceId,
      intent: input.intent || 'UNKNOWN',
      action,
      result: 'error',
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: 'reply',
      result: 'failed',
    });
    if (action === 'GHOST_CLOSER' || action === 'LEAD_UNLOCKER') {
      autopilotGhostCloserCounter.inc({
        workspaceId: input.workspaceId,
        action,
        result: 'error',
      });
    }
  }

  if (!sent) {
    const settings = input.settings || {};

    if (channelEnabled(settings, 'email') && contactEmail) {
      try {
        await sendEmail(contactEmail, 'Follow-up automático', msg);
        logFallback('email', 'sent');
        await persistFallbackMessage({
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          channel: 'EMAIL',
          content: msg,
        });
        executionResponse = {
          channel: 'EMAIL_FALLBACK',
          message: msg,
        };
        await logAutopilotAction({
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          phone: targetPhone,
          action: `${action}_EMAIL_FALLBACK`,
          intent: input.intent,
          status: 'executed',
          reason: 'email_fallback',
        });
        autopilotDecisionCounter.inc({
          workspaceId: input.workspaceId,
          intent: input.intent || 'UNKNOWN',
          action: `${action}_EMAIL_FALLBACK`,
          result: 'executed',
        });
        autopilotPipelineCounter.inc({
          workspaceId: input.workspaceId,
          stage: 'reply',
          result: 'sent_email_fallback',
        });
        await reportSmokeTest(input.smokeTestId, {
          status: 'completed',
          mode: input.smokeMode || 'live',
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          phone: targetPhone,
          action: `${action}_EMAIL_FALLBACK`,
          responseText: msg,
        });
        sent = true;
      } catch (err: unknown) {
        const errInstanceofError =
          err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
        logFallback('email', 'error', errInstanceofError?.message);
      }
    }
  }

  if (!sent) {
    await finishAutonomyExecution(execution.record?.id, 'FAILED', {
      error: sendError || 'autopilot_send_failed',
      response: executionResponse,
    });
    await reportSmokeTest(input.smokeTestId, {
      status: 'failed',
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      error: sendError || 'autopilot_send_failed',
    });
    throw new Error(sendError || 'autopilot_send_failed');
  }

  await finishAutonomyExecution(execution.record?.id, 'SUCCESS', {
    response: executionResponse,
  });

  await publishAgentEvent({
    type: 'contact',
    workspaceId: input.workspaceId,
    runId: input.runId,
    phase: 'message_sent',
    message: `Enviei ${action} para ${displayName}.`,
    meta: {
      contactId: input.contactId,
      contactName: input.contactName || contactRecord?.name || null,
      conversationId: input.conversationId,
      phone: targetPhone,
      action,
      capabilityCode: input.idempotencyContext?.capabilityCode || action,
      tacticCode: input.idempotencyContext?.conversationTactic || null,
      conversationProofId: input.idempotencyContext?.conversationProofId || null,
      accountProofId: input.idempotencyContext?.accountProofId || null,
      cycleProofId: input.idempotencyContext?.cycleProofId || null,
      messagePreview: msg.slice(0, 240),
      autonomyExecutionId: execution.record?.id || null,
    },
  });

  if (action === 'SEND_OFFER') {
    const hotFlowId = input.settings?.autopilot?.hotFlowId;
    if (hotFlowId) {
      await flowQueue.add('run-flow', {
        workspaceId: input.workspaceId,
        flowId: hotFlowId,
        user: targetPhone,
        initialVars: { source: 'autopilot_hot', lastMessage: input.messageContent || '' },
      });
    }
  }

  return 'executed';
}

export async function sendDirectAutopilotText(input: {
  workspaceId: string;
  contactId?: string;
  conversationId?: string;
  phone?: string;
  chatId?: string;
  contactName?: string;
  text: string;
  settings?: UnknownRecord;
  intent?: string;
  reason?: string;
  workspaceRecord?: UnknownRecord;
  intentConfidence?: number;
  actionLabel?: string;
  usedHistory?: boolean;
  usedKb?: boolean;
  deliveryMode?: 'reactive' | 'proactive';
  smokeTestId?: string;
  smokeMode?: 'dry-run' | 'live';
  runId?: string;
  idempotencyContext?: Record<string, unknown>;
  customerMessages?: QuotedCustomerMessage[];
}) {
  const action = input.actionLabel || 'UNIFIED_AGENT_TEXT';
  const message = String(input.text || '').trim();
  if (!message) {
    return 'skipped';
  }

  let targetPhone = input.phone;
  let contactRecord: UnknownRecord | null = null;

  if (!targetPhone && input.contactId) {
    contactRecord = await prisma.contact.findFirst({
      where: { id: input.contactId, workspaceId: input.workspaceId },
      select: {
        id: true,
        phone: true,
        name: true,
        customFields: true,
        optIn: true,
        optedOutAt: true,
        tags: { select: { name: true } },
      },
    });
    targetPhone = contactRecord?.phone;
  }

  if (!contactRecord && input.contactId) {
    contactRecord = await prisma.contact.findFirst({
      where: { id: input.contactId, workspaceId: input.workspaceId },
      select: {
        id: true,
        phone: true,
        name: true,
        customFields: true,
        optIn: true,
        optedOutAt: true,
        tags: { select: { name: true } },
      },
    });
  }

  const displayName = input.contactName || contactRecord?.name || targetPhone || 'contato';
  if (!targetPhone) {
    return 'skipped';
  }
  const selfIdentity = await resolveWorkspaceSelfIdentity(
    input.workspaceId,
    input.settings || input.workspaceRecord?.providerSettings,
  );
  if (
    isWorkspaceSelfTarget({
      phone: targetPhone,
      selfIdentity,
    })
  ) {
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: 'skipped',
      reason: 'workspace_self_contact',
      intentConfidence: input.intentConfidence,
      meta: {
        source: 'direct_generated_response',
      },
    });
    return 'skipped';
  }
  const contactCustomFields = normalizeJsonObject(contactRecord?.customFields);
  const resolvedChatId =
    String(input.chatId || '').trim() ||
    String(contactCustomFields.lastRemoteChatId || '').trim() ||
    String(contactCustomFields.lastCatalogChatId || '').trim() ||
    String(contactCustomFields.lastResolvedChatId || '').trim() ||
    undefined;
  const trustedProfile = await ensureTrustedContactProfile({
    workspaceId: input.workspaceId,
    contactId: input.contactId,
    phone: targetPhone,
    chatId: resolvedChatId,
    contactName: displayName,
    existingContact: contactRecord,
  }).catch(() => ({
    contactId: '',
    trustedName: '',
    savedToWhatsapp: false,
  }));
  if (trustedProfile.contactId && !input.contactId) {
    input.contactId = trustedProfile.contactId;
  }
  const latestQuotedMessageId = await resolveLatestQuotedMessageId({
    workspaceId: input.workspaceId,
    contactId: input.contactId,
    conversationId: input.conversationId,
    phone: targetPhone,
    providerMessageIds: input.idempotencyContext?.providerMessageIds as string[] | undefined,
  });

  const compliance = await ensureCompliance(
    input.workspaceId,
    targetPhone,
    input.settings,
    contactRecord || undefined,
    input.deliveryMode || 'proactive',
  );
  if (!compliance.allowed) {
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: 'skipped',
      reason: compliance.reason,
      intentConfidence: input.intentConfidence,
      meta: {
        compliance: true,
        usedHistory: input.usedHistory,
        usedKb: input.usedKb,
      },
    });
    autopilotDecisionCounter.inc({
      workspaceId: input.workspaceId,
      intent: input.intent || 'UNKNOWN',
      action,
      result: 'skipped_compliance',
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: 'reply',
      result: 'skipped_compliance',
    });
    await reportSmokeTest(input.smokeTestId, {
      status: 'skipped',
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      reason: compliance.reason,
    });
    return 'skipped';
  }

  const rate = await checkRateLimits(
    input.workspaceId,
    targetPhone,
    input.deliveryMode || 'proactive',
  );
  if (!rate.allowed) {
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: 'skipped',
      reason: rate.reason || 'rate_limit',
      intentConfidence: input.intentConfidence,
      meta: {
        usedHistory: input.usedHistory,
        usedKb: input.usedKb,
      },
    });
    autopilotDecisionCounter.inc({
      workspaceId: input.workspaceId,
      intent: input.intent || 'UNKNOWN',
      action,
      result: 'rate_limited',
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: 'reply',
      result: 'rate_limited',
    });
    await reportSmokeTest(input.smokeTestId, {
      status: 'skipped',
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      reason: rate.reason || 'rate_limit',
    });
    return 'skipped';
  }

  const canSend = await PlanLimitsProvider.checkMessageLimit(input.workspaceId);
  if (!canSend.allowed) {
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: 'skipped',
      reason: canSend.reason || 'plan_limit',
      intentConfidence: input.intentConfidence,
      meta: {
        usedHistory: input.usedHistory,
        usedKb: input.usedKb,
        mode: 'direct_generated_response',
      },
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: 'reply',
      result: 'blocked_plan_limit',
    });
    await reportSmokeTest(input.smokeTestId, {
      status: 'skipped',
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      reason: canSend.reason || 'plan_limit',
    });
    return 'skipped';
  }

  const idempotencyKey = buildAutonomyExecutionKey({
    workspaceId: input.workspaceId,
    actionType: action,
    contactId: input.contactId,
    conversationId: input.conversationId,
    phone: targetPhone,
    payload: {
      source: 'direct_generated_response',
      message,
      intent: input.intent,
      reason: input.reason,
      deliveryMode: input.deliveryMode || 'proactive',
      customerMessages: input.customerMessages || null,
      context: input.idempotencyContext || null,
    },
  });
  const idemCtx2 = input.idempotencyContext || {};
  const execution = await beginAutonomyExecution({
    workspaceId: input.workspaceId,
    actionType: action,
    contactId: input.contactId,
    conversationId: String(input.conversationId ?? ''),
    workItemId: String(idemCtx2.workItemId ?? '') || null,
    proofId:
      String(idemCtx2.conversationProofId ?? '') ||
      String(idemCtx2.accountProofId ?? '') ||
      String(idemCtx2.cycleProofId ?? '') ||
      null,
    capabilityCode: String(idemCtx2.capabilityCode ?? '') || action,
    tacticCode: String(idemCtx2.conversationTactic ?? '') || null,
    idempotencyKey,
    request: {
      phone: targetPhone,
      message,
      intent: input.intent,
      reason: input.reason,
      deliveryMode: input.deliveryMode || 'proactive',
      customerMessages: input.customerMessages || null,
      context: input.idempotencyContext || null,
    },
  });

  if (!execution.allowed) {
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: 'skipped',
      reason: execution.reason,
      intentConfidence: input.intentConfidence,
      meta: {
        duplicateExecution: true,
        idempotencyKey,
        mode: 'direct_generated_response',
      },
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: 'reply',
      result: 'duplicate_execution',
    });
    await reportSmokeTest(input.smokeTestId, {
      status: 'skipped',
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      reason: execution.reason,
    });
    return 'skipped';
  }

  const recentDuplicate = await findRecentDuplicateOutbound({
    workspaceId: input.workspaceId,
    contactId: input.contactId || contactRecord?.id || null,
    content: message,
  });
  if (recentDuplicate) {
    await finishAutonomyExecution(execution.record?.id, 'SKIPPED', {
      response: {
        duplicateMessageId: recentDuplicate.id,
        duplicateCreatedAt: recentDuplicate.createdAt?.toISOString?.() || null,
        mode: 'recent_duplicate_outbound',
      },
      error: 'recent_duplicate_outbound',
    });
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: 'skipped',
      reason: 'recent_duplicate_outbound',
      intentConfidence: input.intentConfidence,
      meta: {
        duplicateExecution: true,
        idempotencyKey,
        mode: 'direct_generated_response',
        duplicateMessageId: recentDuplicate.id,
      },
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: 'reply',
      result: 'recent_duplicate_outbound',
    });
    return 'skipped';
  }

  try {
    const started = Date.now();
    await publishAgentEvent({
      type: 'typing',
      workspaceId: input.workspaceId,
      runId: input.runId,
      phase: 'typing',
      message: `Digitando resposta para ${displayName}.`,
      meta: {
        contactId: input.contactId,
        contactName: input.contactName || contactRecord?.name || null,
        conversationId: input.conversationId,
        phone: targetPhone,
        action,
        capabilityCode: (input.idempotencyContext?.capabilityCode as string | null) || action,
        tacticCode: (input.idempotencyContext?.conversationTactic as string | null) || null,
        conversationProofId:
          (input.idempotencyContext?.conversationProofId as string | null) || null,
        accountProofId: (input.idempotencyContext?.accountProofId as string | null) || null,
        cycleProofId: input.idempotencyContext?.cycleProofId || null,
      },
    });
    const replyPlan = await dispatchAutonomousReplyPlan({
      workspaceId: input.workspaceId,
      phone: targetPhone,
      chatId: resolvedChatId,
      message,
      idempotencyKey,
      quotedMessageId: latestQuotedMessageId,
      customerMessages: input.customerMessages,
      settings: input.settings,
      mirrorReplies:
        input.deliveryMode === 'reactive' && isRecentLiveConversation(input.customerMessages || []),
    });
    const responseText = replyPlan.map((item) => item.text).join('\n');
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: 'executed',
      reason: input.reason,
      latencyMs: Date.now() - started,
      intentConfidence: input.intentConfidence,
      meta: {
        usedHistory: input.usedHistory,
        usedKb: input.usedKb,
        mode: 'direct_generated_response',
      },
    });
    autopilotDecisionCounter.inc({
      workspaceId: input.workspaceId,
      intent: input.intent || 'UNKNOWN',
      action,
      result: 'executed',
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: 'reply',
      result: 'sent',
    });
    await reportSmokeTest(input.smokeTestId, {
      status: 'completed',
      mode: input.smokeMode || 'live',
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      responseText,
    });
    await finishAutonomyExecution(execution.record?.id, 'SUCCESS', {
      response: {
        channel: 'FLOW_SEND_MESSAGE',
        message,
        replyPlan,
        mode: 'direct_generated_response',
      },
    });
    await publishAgentEvent({
      type: 'contact',
      workspaceId: input.workspaceId,
      runId: input.runId,
      phase: 'message_sent',
      message: `Enviei ${action} para ${displayName}.`,
      meta: {
        contactId: input.contactId,
        contactName: trustedProfile.trustedName || input.contactName || contactRecord?.name || null,
        conversationId: input.conversationId,
        phone: targetPhone,
        action,
        capabilityCode: (input.idempotencyContext?.capabilityCode as string | null) || action,
        tacticCode: (input.idempotencyContext?.conversationTactic as string | null) || null,
        conversationProofId:
          (input.idempotencyContext?.conversationProofId as string | null) || null,
        accountProofId: (input.idempotencyContext?.accountProofId as string | null) || null,
        cycleProofId: input.idempotencyContext?.cycleProofId || null,
        messagePreview: responseText.slice(0, 240),
        autonomyExecutionId: execution.record?.id || null,
      },
    });
    return 'executed';
  } catch (err: unknown) {
    const errInstanceofError =
      err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    await finishAutonomyExecution(execution.record?.id, 'FAILED', {
      error: errInstanceofError?.message || 'send_error',
      response: {
        channel: 'FLOW_SEND_MESSAGE',
        message,
        customerMessages: input.customerMessages || null,
        mode: 'direct_generated_response',
      },
    });
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: 'error',
      reason: errInstanceofError?.message || 'send_error',
      intentConfidence: input.intentConfidence,
      meta: {
        usedHistory: input.usedHistory,
        usedKb: input.usedKb,
        mode: 'direct_generated_response',
      },
    });
    autopilotDecisionCounter.inc({
      workspaceId: input.workspaceId,
      intent: input.intent || 'UNKNOWN',
      action,
      result: 'error',
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: 'reply',
      result: 'failed',
    });
    await reportSmokeTest(input.smokeTestId, {
      status: 'failed',
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      error: errInstanceofError?.message || 'direct_send_failed',
    });
    throw err;
  }
}

/**
 * Persiste mensagem de fallback (email) e notifica Inbox via Redis.
 */
export async function persistFallbackMessage(params: {
  workspaceId: string;
  contactId?: string;
  channel: 'EMAIL';
  content: string;
}) {
  const { workspaceId, contactId, channel, content } = params;
  if (!contactId) {
    return;
  }

  // Encontra ou cria conversa específica do canal
  let conversation = await prisma.conversation.findFirst({
    where: { workspaceId, contactId, channel },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        workspaceId,
        contactId,
        channel,
        status: 'OPEN',
        priority: 'MEDIUM',
      },
      select: { id: true },
    });
  }

  const message = await prisma.message.create({
    data: {
      workspaceId,
      contactId,
      conversationId: conversation.id,
      direction: 'OUTBOUND',
      type: 'TEXT',
      content,
      status: 'SENT',
    },
  });

  await prisma.conversation.updateMany({
    where: { id: conversation.id, workspaceId },
    data: { lastMessageAt: new Date(), unreadCount: 0 },
  });

  // Notifica realtime (permitindo que Inbox exiba mensagem do canal)
  await redisPub.publish(
    'ws:inbox',
    JSON.stringify({
      type: 'message:new',
      workspaceId,
      message,
    }),
  );
  await redisPub.publish(
    'ws:inbox',
    JSON.stringify({
      type: 'conversation:update',
      workspaceId,
      conversation: {
        id: conversation.id,
        lastMessageStatus: 'SENT',
        lastMessageAt: message.createdAt,
      },
    }),
  );
  await redisPub.publish(
    'ws:inbox',
    JSON.stringify({
      type: 'message:status',
      workspaceId,
      payload: {
        id: message.id,
        conversationId: conversation.id,
        contactId,
        status: 'SENT',
      },
    }),
  );
}

export async function buildMessage(action: string, content: string, settings: UnknownRecord) {
  const defaults: Record<string, string[]> = {
    SEND_PRICE: [
      'Posso te passar os valores de forma direta e te dizer qual faz mais sentido.',
      'Eu te explico o valor sem enrolacao e ja te digo a opcao mais coerente.',
    ],
    FOLLOW_UP: [
      'Fiquei com a sua conversa em aberto por aqui. Se ainda fizer sentido, eu continuo daqui.',
      'Voltei na sua conversa porque tem um proximo passo que pode te poupar tempo.',
    ],
    FOLLOW_UP_STRONG: [
      'Se ainda fizer sentido seguir, eu consigo te mostrar o caminho mais simples agora.',
      'Se a decisao ainda estiver em aberto, eu consigo resumir o que realmente importa agora.',
    ],
    GHOST_CLOSER: [
      'Sua conversa ficou perto de avancar. Se ainda fizer sentido, eu pego exatamente de onde parou.',
      'Ficou um ponto em aberto aqui que pode mudar sua decisao. Se quiser, eu te mostro.',
    ],
    LEAD_UNLOCKER: [
      'Tem um detalhe nisso que costuma destravar a decisao. Se quiser, eu te conto.',
      'Fiquei pensando na sua situacao porque existe um ponto que quase sempre muda a perspectiva.',
    ],
    SEND_CALENDAR: ['Te mando meu link de agenda e a gente resolve isso sem enrolacao.'],
    QUALIFY: [
      'Pra eu te orientar direito, o que voce quer resolver primeiro?',
      'Antes de te indicar algo, me diz qual parte e mais importante agora.',
    ],
    TRANSFER_AGENT: [
      'Vou trazer um especialista humano para assumir daqui com contexto do que voce ja contou.',
    ],
    ANTI_CHURN: [
      'Antes de qualquer ajuste, quero entender o que nao encaixou como deveria.',
      'Quero te ajudar a fazer isso funcionar de verdade. O que mais te incomodou?',
    ],
    HANDLE_OBJECTION: [
      'Faz sentido ter essa preocupacao. Se quiser, eu te mostro por outro angulo sem forcar nada.',
      'Sua ressalva e valida. Posso te explicar o ponto principal de forma direta?',
    ],
  };
  const customTpl = (settings?.autopilot?.templates || {}) as Record<string, string>;
  const apiKey = settings?.openai?.apiKey || process.env.OPENAI_API_KEY;

  const actionDirective: Record<string, string> = {
    SEND_PRICE:
      'O contato quer clareza de preco ou formato. Seja direta, contextualize valor e use no maximo uma pergunta.',
    FOLLOW_UP: 'Retome com leveza e valor. Nao cobre ausencia.',
    FOLLOW_UP_STRONG: 'Retome com mais iniciativa, mas sem pressao barata.',
    GHOST_CLOSER: 'Reabra a conversa usando contexto e curiosidade, sem parecer script.',
    LEAD_UNLOCKER: 'Destrave a conversa com um insight curto ou open loop.',
    SEND_CALENDAR: 'Convide para agenda de forma simples e humana.',
    QUALIFY: 'Descubra a necessidade com pergunta aberta curta.',
    TRANSFER_AGENT: 'Transfira para humano com acolhimento.',
    ANTI_CHURN: 'Priorize escuta, validacao e reducao de friccao. Nao venda.',
    HANDLE_OBJECTION: 'Valide a preocupacao antes de reframe.',
  };

  if (apiKey && action !== 'SEND_OFFER' && action !== 'SEND_AUDIO') {
    try {
      const ai = new AIProvider(apiKey);
      const systemPrompt = [
        'Voce escreve mensagens comerciais para WhatsApp.',
        'Soe humana, breve, viva e consultiva.',
        'Nao finja ser humana. Se perguntarem, diga que e a assistente virtual da empresa.',
        'Nao use listas.',
        'Nao use emoji por padrao.',
        'Nao use mais de uma pergunta.',
        'Nao use frases de vendedor-script.',
      ].join('\n');
      const response = await ai.generateResponse(
        systemPrompt,
        [
          `ACAO: ${actionDirective[action] || 'Responda com utilidade e contexto.'}`,
          `ULTIMO CONTEXTO: ${String(content || '').trim() || 'sem contexto adicional'}`,
          'Escreva uma unica mensagem pronta para WhatsApp.',
        ].join('\n\n'),
        'writer',
      );
      const cleaned = detectAndFixAntiPatterns(String(response || '').trim());
      if (cleaned) {
        return cleaned;
      }
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      log.warn('build_message_ai_failed', {
        action,
        error: errorInstanceofError?.message || 'unknown_error',
      });
    }
  }

  switch (action) {
    case 'SEND_OFFER':
      return await generatePitchSafe(content, settings);
    case 'SEND_PRICE':
      return customTpl.SEND_PRICE || defaults.SEND_PRICE[0];
    case 'SEND_CALENDAR':
      return customTpl.SEND_CALENDAR || defaults.SEND_CALENDAR[0];
    case 'QUALIFY':
      return customTpl.QUALIFY || defaults.QUALIFY[0];
    case 'FOLLOW_UP':
      return customTpl.FOLLOW_UP || defaults.FOLLOW_UP[0];
    case 'FOLLOW_UP_STRONG':
      return customTpl.FOLLOW_UP_STRONG || defaults.FOLLOW_UP_STRONG[0];
    case 'GHOST_CLOSER':
      return customTpl.GHOST_CLOSER || defaults.GHOST_CLOSER[0];
    case 'LEAD_UNLOCKER':
      return customTpl.LEAD_UNLOCKER || defaults.LEAD_UNLOCKER[0];
    case 'TRANSFER_AGENT':
      return customTpl.TRANSFER_AGENT || defaults.TRANSFER_AGENT[0];
    case 'ANTI_CHURN':
      return customTpl.ANTI_CHURN || defaults.ANTI_CHURN[0];
    case 'HANDLE_OBJECTION':
      return customTpl.HANDLE_OBJECTION || defaults.HANDLE_OBJECTION[0];
    case 'SEND_AUDIO':
      // Para SEND_AUDIO, retornar o conteúdo que será convertido em áudio
      return content || customTpl.FOLLOW_UP || defaults.FOLLOW_UP[0];
    default:
      return null;
  }
}

export async function ensureCompliance(
  workspaceId: string,
  phone: string,
  settings: UnknownRecord,
  contact?: {
    id?: string;
    optIn?: boolean;
    optedOutAt?: Date | string | null;
    customFields?: unknown;
    tags?: { name: string }[];
  },
  deliveryMode: 'reactive' | 'proactive' = 'proactive',
) {
  if (!contact) {
    contact = await prisma.contact.findFirst({
      where: { workspaceId, phone },
      select: {
        id: true,
        optIn: true,
        optedOutAt: true,
        customFields: true,
        tags: { select: { name: true } },
      },
    });
  }

  if (contact && contact.optIn === false) {
    return { allowed: false, reason: 'opted_out' as const };
  }

  if (deliveryMode === 'reactive') {
    return { allowed: true as const };
  }

  const enforceOptIn =
    process.env.ENFORCE_OPTIN === 'true' || settings?.autopilot?.requireOptIn === true;
  const enforce24h = (process.env.AUTOPILOT_ENFORCE_24H ?? 'true') === 'true';

  if (enforceOptIn) {
    const tags = contact?.tags?.map((t) => t.name.toLowerCase()) || [];
    const cf: UnknownRecord = contact?.customFields || {};
    const hasOptIn =
      contact?.optIn === true ||
      tags.includes('optin_whatsapp') ||
      cf.optin === true ||
      cf.optin_whatsapp === true;
    if (!hasOptIn) {
      return { allowed: false, reason: 'optin_required' as const };
    }
  }

  if (enforce24h) {
    const lastInbound = await prisma.message.findFirst({
      where: { workspaceId, contact: { phone }, direction: 'INBOUND' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    if (!lastInbound || lastInbound.createdAt.getTime() < cutoff) {
      return { allowed: false, reason: 'session_expired_24h' as const };
    }
  }

  return { allowed: true as const };
}
