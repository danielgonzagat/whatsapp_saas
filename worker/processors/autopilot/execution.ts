import { prisma } from '../../db';
import { autopilotQueue, flowQueue } from '../../queue';
import { publishAgentEvent } from '../../providers/agent-events';
import {
  autopilotDecisionCounter,
  autopilotGhostCloserCounter,
  autopilotPipelineCounter,
} from '../../metrics';
import {
  log,
  normalizeJsonObject,
  type UnknownRecord,
  type QuotedCustomerMessage,
} from './shared';
import {
  findRecentDuplicateOutbound,
  dispatchAutonomousReplyPlan,
  buildAutonomyExecutionKey,
  beginAutonomyExecution,
  finishAutonomyExecution,
} from './cognition';
import { logAutopilotAction, buildWorkspaceConfig } from './safeguard';
import { sendAudioResponse } from './cycle';
import { isRecentLiveConversation, isExplicitProactiveOutreachAllowed, reportSmokeTest } from './shared';
import { ensureTrustedContactProfile } from './profile';
import { channelEnabled, logFallback, sendEmail } from '../../providers/channel-dispatcher';
import { buildMessage } from './execution-planner';
import { checkDeliveryGuards, resolveContactForExecution, type GuardResult } from './execution-guards';
import { persistFallbackMessage } from './execution-audit';

export { persistFallbackMessage, buildMessage };
export { checkDeliveryGuards, ensureCompliance, resolveContactForExecution } from './execution-guards';

async function beginExecutionAndCheckDuplicates(params: {
  workspaceId: string;
  action: string;
  contactId?: string;
  contactRecordId?: string;
  conversationId?: string;
  phone: string;
  message: string;
  intent?: string;
  reason?: string;
  deliveryMode: 'reactive' | 'proactive';
  customerMessages?: QuotedCustomerMessage[];
  idempotencyContext?: Record<string, unknown>;
  smokeTestId?: string;
  runId?: string;
}) {
  const {
    workspaceId, action, contactId, contactRecordId, conversationId,
    phone, message, intent, reason, deliveryMode,
    customerMessages, idempotencyContext, smokeTestId, runId,
  } = params;

  const idemCtx = idempotencyContext || {};
  const idempotencyKey = buildAutonomyExecutionKey({
    workspaceId,
    actionType: action,
    contactId,
    conversationId,
    phone,
    payload: {
      source: idemCtx.source || 'execute_action',
      message,
      intent,
      reason,
      deliveryMode,
      customerMessages: customerMessages || null,
      context: idempotencyContext || null,
    },
  });

  const execution = await beginAutonomyExecution({
    workspaceId,
    actionType: action,
    contactId,
    conversationId,
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
      phone,
      message,
      intent,
      reason,
      deliveryMode,
      customerMessages: customerMessages || null,
      context: idempotencyContext || null,
    },
  });

  if (!execution.allowed) {
    await logAutopilotAction({
      workspaceId,
      contactId,
      phone,
      action,
      intent,
      status: 'skipped',
      reason: execution.reason,
      meta: { duplicateExecution: true, idempotencyKey },
    });
    autopilotPipelineCounter.inc({
      workspaceId, stage: 'reply', result: 'duplicate_execution',
    });
    await reportSmokeTest(smokeTestId, {
      status: 'skipped', workspaceId, contactId, phone, action, reason: execution.reason,
    });
    return { allowed: false as const, reason: execution.reason };
  }

  const recentDuplicate = await findRecentDuplicateOutbound({
    workspaceId,
    contactId: contactId || contactRecordId || null,
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
      workspaceId,
      contactId,
      phone,
      action,
      intent,
      status: 'skipped',
      reason: 'recent_duplicate_outbound',
      meta: { duplicateExecution: true, idempotencyKey, duplicateMessageId: recentDuplicate.id },
    });
    autopilotPipelineCounter.inc({
      workspaceId, stage: 'reply', result: 'recent_duplicate_outbound',
    });
    return { allowed: false as const, reason: 'recent_duplicate_outbound' };
  }

  return { allowed: true as const, execution, idempotencyKey };
}

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
  if (!action || action === 'NONE') return 'skipped';

  let contactEmail: string | undefined;
  let contactRecord: UnknownRecord | undefined;
  let targetPhone = input.phone;

  if (!targetPhone && input.contactId) {
    const contact = await prisma.contact.findUnique({
      where: { id: input.contactId },
      select: { phone: true, email: true, customFields: true, optIn: true, optedOutAt: true, id: true, workspaceId: true, name: true, tags: { select: { name: true } } },
    });
    contactRecord = contact as UnknownRecord | undefined;
    targetPhone = contact?.phone || input.contactId;
    contactEmail = contact?.email || undefined;
  }
  if (!targetPhone) return 'skipped';

  if (!contactEmail) {
    const resolved = await resolveContactForExecution(input.workspaceId, targetPhone, input.contactId);
    contactRecord = resolved.contactRecord || contactRecord;
    contactEmail = resolved.contactEmail || contactEmail;
    if (resolved.contactRecord?.id) input.contactId = input.contactId || (resolved.contactRecord.id as string);
  }

  const displayName = input.contactName || (contactRecord?.name as string | undefined) || targetPhone || 'contato';
  const deliveryMode = input.deliveryMode || 'proactive';

  const guard: GuardResult = await checkDeliveryGuards({
    workspaceId: input.workspaceId,
    contactId: input.contactId,
    phone: targetPhone,
    chatId: input.chatId,
    settings: input.settings || {},
    workspaceRecord: input.workspaceRecord,
    deliveryMode,
    action,
    intent: input.intent,
    intentConfidence: input.intentConfidence,
    usedHistory: input.usedHistory,
    usedKb: input.usedKb,
    smokeTestId: input.smokeTestId,
    customerMessages: input.customerMessages,
    contactName: input.contactName,
    conversationId: input.conversationId,
    idempotencyContext: input.idempotencyContext,
  });
  if (!guard.allowed) return 'skipped';

  const msg = await buildMessage(action, input.messageContent || '', input.settings || {});
  if (!msg) return 'skipped';

  const preDispatch = await beginExecutionAndCheckDuplicates({
    workspaceId: input.workspaceId,
    action,
    contactId: input.contactId,
    contactRecordId: (contactRecord?.id as string | undefined),
    conversationId: input.conversationId,
    phone: targetPhone,
    message: msg,
    intent: input.intent,
    reason: input.reason,
    deliveryMode,
    customerMessages: input.customerMessages,
    idempotencyContext: input.idempotencyContext,
    smokeTestId: input.smokeTestId,
    runId: input.runId,
  });
  if (!preDispatch.allowed) return 'skipped';

  await publishAgentEvent({
    type: 'typing',
    workspaceId: input.workspaceId,
    runId: input.runId,
    phase: 'typing',
    message: `Digitando resposta para ${displayName}.`,
    meta: {
      contactId: input.contactId,
      contactName: input.contactName || (contactRecord?.name as string | undefined) || null,
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
    const workspaceCfg = buildWorkspaceConfig(input.workspaceId, input.settings || {}, input.workspaceRecord);

    if (action === 'SEND_AUDIO') {
      const audioSent = await sendAudioResponse(
        input.workspaceId, targetPhone, input.chatId, msg, input.settings || {}, workspaceCfg, guard.context?.latestQuotedMessageId,
      );
      if (!audioSent) {
        const replyPlan = await dispatchAutonomousReplyPlan({
          workspaceId: input.workspaceId, phone: targetPhone, chatId: input.chatId,
          message: msg, idempotencyKey: preDispatch.idempotencyKey!,
          customerMessages: input.customerMessages, settings: input.settings,
          quotedMessageId: guard.context?.latestQuotedMessageId,
          mirrorReplies: deliveryMode === 'reactive' && isRecentLiveConversation(input.customerMessages || []),
        });
        executionResponse = { channel: 'FLOW_SEND_MESSAGE', fallbackFromAudio: true, message: msg, replyPlan };
      } else {
        executionResponse = { channel: 'WHATSAPP_AUDIO', message: msg };
      }
    } else {
      const replyPlan = await dispatchAutonomousReplyPlan({
        workspaceId: input.workspaceId, phone: targetPhone, chatId: input.chatId,
        message: msg, idempotencyKey: preDispatch.idempotencyKey!,
        customerMessages: input.customerMessages, settings: input.settings,
        quotedMessageId: guard.context?.latestQuotedMessageId,
        mirrorReplies: deliveryMode === 'reactive' && isRecentLiveConversation(input.customerMessages || []),
      });
      executionResponse = { channel: 'FLOW_SEND_MESSAGE', message: msg, replyPlan };
    }

    await logAutopilotAction({
      workspaceId: input.workspaceId, contactId: input.contactId, phone: targetPhone,
      action, intent: input.intent, status: 'executed', reason: input.reason,
      latencyMs: Date.now() - started, intentConfidence: input.intentConfidence,
      meta: { usedHistory: input.usedHistory, usedKb: input.usedKb, audioMode: action === 'SEND_AUDIO' },
    });
    autopilotDecisionCounter.inc({ workspaceId: input.workspaceId, intent: input.intent || 'UNKNOWN', action, result: 'executed' });
    autopilotPipelineCounter.inc({ workspaceId: input.workspaceId, stage: 'reply', result: 'sent' });
    await reportSmokeTest(input.smokeTestId, { status: 'completed', mode: input.smokeMode || 'live', workspaceId: input.workspaceId, contactId: input.contactId, phone: targetPhone, action, responseText: msg });
    if (action === 'GHOST_CLOSER' || action === 'LEAD_UNLOCKER') {
      autopilotGhostCloserCounter.inc({ workspaceId: input.workspaceId, action, result: 'executed' });
    }
    sent = true;

    if (followupEligible && isExplicitProactiveOutreachAllowed(input.settings || {})) {
      await autopilotQueue.add('followup-contact', {
        workspaceId: input.workspaceId, contactId: input.contactId, phone: targetPhone,
        reason: 'buying_signal_followup', scheduledAt: new Date().toISOString(),
      }, { delay: 45 * 60 * 1000, jobId: `followup-${input.contactId || targetPhone}-bs`, removeOnComplete: true });
    }
  } catch (err: unknown) {
    const errInstanceofError = err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    log.error('autopilot_send_error', { err: errInstanceofError.message });
    sendError = errInstanceofError?.message || 'send_error';
    await logAutopilotAction({
      workspaceId: input.workspaceId, contactId: input.contactId, phone: targetPhone,
      action, intent: input.intent, status: 'error', reason: errInstanceofError?.message || 'send_error',
      intentConfidence: input.intentConfidence, meta: { usedHistory: input.usedHistory, usedKb: input.usedKb },
    });
    autopilotDecisionCounter.inc({ workspaceId: input.workspaceId, intent: input.intent || 'UNKNOWN', action, result: 'error' });
    autopilotPipelineCounter.inc({ workspaceId: input.workspaceId, stage: 'reply', result: 'failed' });
    if (action === 'GHOST_CLOSER' || action === 'LEAD_UNLOCKER') {
      autopilotGhostCloserCounter.inc({ workspaceId: input.workspaceId, action, result: 'error' });
    }
  }

  if (!sent) {
    if (channelEnabled(input.settings || {}, 'email') && contactEmail) {
      try {
        await sendEmail(contactEmail, 'Follow-up automático', msg);
        logFallback('email', 'sent');
        await persistFallbackMessage({ workspaceId: input.workspaceId, contactId: input.contactId, channel: 'EMAIL', content: msg });
        executionResponse = { channel: 'EMAIL_FALLBACK', message: msg };
        await logAutopilotAction({
          workspaceId: input.workspaceId, contactId: input.contactId, phone: targetPhone,
          action: `${action}_EMAIL_FALLBACK`, intent: input.intent, status: 'executed', reason: 'email_fallback',
        });
        autopilotDecisionCounter.inc({ workspaceId: input.workspaceId, intent: input.intent || 'UNKNOWN', action: `${action}_EMAIL_FALLBACK`, result: 'executed' });
        autopilotPipelineCounter.inc({ workspaceId: input.workspaceId, stage: 'reply', result: 'sent_email_fallback' });
        await reportSmokeTest(input.smokeTestId, { status: 'completed', mode: input.smokeMode || 'live', workspaceId: input.workspaceId, contactId: input.contactId, phone: targetPhone, action: `${action}_EMAIL_FALLBACK`, responseText: msg });
        sent = true;
      } catch (err: unknown) {
        const errInstanceofError = err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
        logFallback('email', 'error', errInstanceofError?.message);
      }
    }
  }

  if (!sent) {
    await finishAutonomyExecution(preDispatch.execution?.record?.id, 'FAILED', { error: sendError || 'autopilot_send_failed', response: executionResponse });
    await reportSmokeTest(input.smokeTestId, { status: 'failed', workspaceId: input.workspaceId, contactId: input.contactId, phone: targetPhone, action, error: sendError || 'autopilot_send_failed' });
    throw new Error(sendError || 'autopilot_send_failed');
  }

  await finishAutonomyExecution(preDispatch.execution?.record?.id, 'SUCCESS', { response: executionResponse });

  await publishAgentEvent({
    type: 'contact', workspaceId: input.workspaceId, runId: input.runId, phase: 'message_sent',
    message: `Enviei ${action} para ${displayName}.`,
    meta: {
      contactId: input.contactId, contactName: input.contactName || (contactRecord?.name as string | undefined) || null,
      conversationId: input.conversationId, phone: targetPhone, action,
      capabilityCode: (input.idempotencyContext?.capabilityCode as string | null) || action,
      tacticCode: (input.idempotencyContext?.conversationTactic as string | null) || null,
      conversationProofId: (input.idempotencyContext?.conversationProofId as string | null) || null,
      accountProofId: (input.idempotencyContext?.accountProofId as string | null) || null,
      cycleProofId: (input.idempotencyContext?.cycleProofId as string | null) || null,
      messagePreview: msg.slice(0, 240),
      autonomyExecutionId: preDispatch.execution?.record?.id || null,
    },
  });

  if (action === 'SEND_OFFER') {
    const hotFlowId = input.settings?.autopilot?.hotFlowId;
    if (hotFlowId) {
      await flowQueue.add('run-flow', {
        workspaceId: input.workspaceId, flowId: hotFlowId,
        user: targetPhone, initialVars: { source: 'autopilot_hot', lastMessage: input.messageContent || '' },
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
  if (!message) return 'skipped';

  let targetPhone = input.phone;
  let contactRecord: UnknownRecord | null = null;

  if (!targetPhone && input.contactId) {
    contactRecord = await prisma.contact.findFirst({
      where: { id: input.contactId, workspaceId: input.workspaceId },
      select: { id: true, phone: true, name: true, customFields: true, optIn: true, optedOutAt: true, tags: { select: { name: true } } },
    });
    targetPhone = contactRecord?.phone;
  }
  if (!contactRecord && input.contactId) {
    contactRecord = await prisma.contact.findFirst({
      where: { id: input.contactId, workspaceId: input.workspaceId },
      select: { id: true, phone: true, name: true, customFields: true, optIn: true, optedOutAt: true, tags: { select: { name: true } } },
    });
  }

  const displayName = input.contactName || contactRecord?.name || targetPhone || 'contato';
  if (!targetPhone) return 'skipped';

  const contactCustomFields = normalizeJsonObject(contactRecord?.customFields);
  const resolvedChatId =
    String(input.chatId || '').trim() ||
    String(contactCustomFields.lastRemoteChatId || '').trim() ||
    String(contactCustomFields.lastCatalogChatId || '').trim() ||
    String(contactCustomFields.lastResolvedChatId || '').trim() ||
    undefined;
  const trustedProfile = await ensureTrustedContactProfile({
    workspaceId: input.workspaceId, contactId: input.contactId, phone: targetPhone,
    chatId: resolvedChatId, contactName: displayName, existingContact: contactRecord,
  }).catch(() => ({ contactId: '', trustedName: '', savedToWhatsapp: false }));
  if (trustedProfile.contactId && !input.contactId) input.contactId = trustedProfile.contactId;

  const deliveryMode = input.deliveryMode || 'proactive';

  const guard: GuardResult = await checkDeliveryGuards({
    workspaceId: input.workspaceId,
    contactId: input.contactId,
    phone: targetPhone,
    chatId: resolvedChatId,
    settings: input.settings || {},
    workspaceRecord: input.workspaceRecord,
    deliveryMode,
    action,
    intent: input.intent,
    intentConfidence: input.intentConfidence,
    usedHistory: input.usedHistory,
    usedKb: input.usedKb,
    smokeTestId: input.smokeTestId,
    customerMessages: input.customerMessages,
    contactName: displayName,
    conversationId: input.conversationId,
    idempotencyContext: input.idempotencyContext,
  });
  if (!guard.allowed) return 'skipped';

  const preDispatch = await beginExecutionAndCheckDuplicates({
    workspaceId: input.workspaceId,
    action,
    contactId: input.contactId,
    contactRecordId: (contactRecord?.id as string | undefined),
    conversationId: input.conversationId,
    phone: targetPhone,
    message,
    intent: input.intent,
    reason: input.reason,
    deliveryMode,
    customerMessages: input.customerMessages,
    idempotencyContext: input.idempotencyContext,
    smokeTestId: input.smokeTestId,
    runId: input.runId,
  });
  if (!preDispatch.allowed) return 'skipped';

  try {
    const started = Date.now();
    await publishAgentEvent({
      type: 'typing', workspaceId: input.workspaceId, runId: input.runId, phase: 'typing',
      message: `Digitando resposta para ${displayName}.`,
      meta: {
        contactId: input.contactId, contactName: input.contactName || contactRecord?.name || null,
        conversationId: input.conversationId, phone: targetPhone, action,
        capabilityCode: (input.idempotencyContext?.capabilityCode as string | null) || action,
        tacticCode: (input.idempotencyContext?.conversationTactic as string | null) || null,
        conversationProofId: (input.idempotencyContext?.conversationProofId as string | null) || null,
        accountProofId: (input.idempotencyContext?.accountProofId as string | null) || null,
        cycleProofId: input.idempotencyContext?.cycleProofId || null,
      },
    });
    const replyPlan = await dispatchAutonomousReplyPlan({
      workspaceId: input.workspaceId, phone: targetPhone, chatId: resolvedChatId,
      message, idempotencyKey: preDispatch.idempotencyKey!,
      quotedMessageId: guard.context?.latestQuotedMessageId,
      customerMessages: input.customerMessages, settings: input.settings,
      mirrorReplies: deliveryMode === 'reactive' && isRecentLiveConversation(input.customerMessages || []),
    });
    const responseText = replyPlan.map((item) => item.text).join('\n');
    await logAutopilotAction({
      workspaceId: input.workspaceId, contactId: input.contactId, phone: targetPhone,
      action, intent: input.intent, status: 'executed', reason: input.reason,
      latencyMs: Date.now() - started, intentConfidence: input.intentConfidence,
      meta: { usedHistory: input.usedHistory, usedKb: input.usedKb, mode: 'direct_generated_response' },
    });
    autopilotDecisionCounter.inc({ workspaceId: input.workspaceId, intent: input.intent || 'UNKNOWN', action, result: 'executed' });
    autopilotPipelineCounter.inc({ workspaceId: input.workspaceId, stage: 'reply', result: 'sent' });
    await reportSmokeTest(input.smokeTestId, { status: 'completed', mode: input.smokeMode || 'live', workspaceId: input.workspaceId, contactId: input.contactId, phone: targetPhone, action, responseText });
    await finishAutonomyExecution(preDispatch.execution?.record?.id, 'SUCCESS', {
      response: { channel: 'FLOW_SEND_MESSAGE', message, replyPlan, mode: 'direct_generated_response' },
    });
    await publishAgentEvent({
      type: 'contact', workspaceId: input.workspaceId, runId: input.runId, phase: 'message_sent',
      message: `Enviei ${action} para ${displayName}.`,
      meta: {
        contactId: input.contactId, contactName: trustedProfile.trustedName || input.contactName || contactRecord?.name || null,
        conversationId: input.conversationId, phone: targetPhone, action,
        capabilityCode: (input.idempotencyContext?.capabilityCode as string | null) || action,
        tacticCode: (input.idempotencyContext?.conversationTactic as string | null) || null,
        conversationProofId: (input.idempotencyContext?.conversationProofId as string | null) || null,
        accountProofId: (input.idempotencyContext?.accountProofId as string | null) || null,
        cycleProofId: input.idempotencyContext?.cycleProofId || null,
        messagePreview: responseText.slice(0, 240),
        autonomyExecutionId: preDispatch.execution?.record?.id || null,
      },
    });
    return 'executed';
  } catch (err: unknown) {
    const errInstanceofError = err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    await finishAutonomyExecution(preDispatch.execution?.record?.id, 'FAILED', {
      error: errInstanceofError?.message || 'send_error',
      response: { channel: 'FLOW_SEND_MESSAGE', message, customerMessages: input.customerMessages || null, mode: 'direct_generated_response' },
    });
    await logAutopilotAction({
      workspaceId: input.workspaceId, contactId: input.contactId, phone: targetPhone,
      action, intent: input.intent, status: 'error', reason: errInstanceofError?.message || 'send_error',
      intentConfidence: input.intentConfidence, meta: { usedHistory: input.usedHistory, usedKb: input.usedKb, mode: 'direct_generated_response' },
    });
    autopilotDecisionCounter.inc({ workspaceId: input.workspaceId, intent: input.intent || 'UNKNOWN', action, result: 'error' });
    autopilotPipelineCounter.inc({ workspaceId: input.workspaceId, stage: 'reply', result: 'failed' });
    await reportSmokeTest(input.smokeTestId, { status: 'failed', workspaceId: input.workspaceId, contactId: input.contactId, phone: targetPhone, action, error: errInstanceofError?.message || 'direct_send_failed' });
    throw err;
  }
}
