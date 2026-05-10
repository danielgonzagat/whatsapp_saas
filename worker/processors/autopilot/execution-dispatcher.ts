import { autopilotQueue } from '../../queue';
import { publishAgentEvent } from '../../providers/agent-events';
import { autopilotDecisionCounter, autopilotGhostCloserCounter, autopilotPipelineCounter } from '../../metrics';
import { channelEnabled, logFallback, sendEmail } from '../../providers/channel-dispatcher';
import { log, type UnknownRecord, type QuotedCustomerMessage } from './shared';
import {
  findRecentDuplicateOutbound, dispatchAutonomousReplyPlan,
  buildAutonomyExecutionKey, beginAutonomyExecution, finishAutonomyExecution,
} from './cognition';
import { logAutopilotAction, buildWorkspaceConfig } from './safeguard';
import { sendAudioResponse } from './cycle';
import { isRecentLiveConversation, isExplicitProactiveOutreachAllowed, reportSmokeTest } from './shared';
import { persistFallbackMessage } from './execution-audit';

export interface DispatchInput {
  workspaceId: string;
  action: string;
  contactId?: string;
  contactRecord?: UnknownRecord | null;
  contactRecordId?: string;
  conversationId?: string;
  phone: string;
  chatId?: string;
  contactName?: string;
  message: string;
  settings: UnknownRecord;
  workspaceRecord?: UnknownRecord;
  intent?: string;
  reason?: string;
  intentConfidence?: number;
  usedHistory?: boolean;
  usedKb?: boolean;
  deliveryMode: 'reactive' | 'proactive';
  smokeTestId?: string;
  smokeMode?: 'dry-run' | 'live';
  runId?: string;
  customerMessages?: QuotedCustomerMessage[];
  idempotencyContext?: Record<string, unknown>;
  latestQuotedMessageId?: string;
  hasEmailFallback?: boolean;
  contactEmail?: string;
  followupEligible?: boolean;
  isAudioAction?: boolean;
}

export interface DispatchResult {
  status: 'executed' | 'skipped' | 'failed';
  error?: string;
}

export async function checkIdempotencyAndDuplicates(params: {
  workspaceId: string;
  action: string;
  contactId?: string;
  contactRecordId?: string;
  conversationId?: string;
  phone: string;
  message: string;
  intent?: string;
  reason?: string;
  deliveryMode: string;
  customerMessages?: QuotedCustomerMessage[];
  idempotencyContext?: Record<string, unknown>;
  smokeTestId?: string;
}) {
  const {
    workspaceId, action, contactId, contactRecordId, conversationId,
    phone, message, intent, reason, deliveryMode,
    customerMessages, idempotencyContext, smokeTestId,
  } = params;

  const idemCtx = idempotencyContext || {};
  const idempotencyKey = buildAutonomyExecutionKey({
    workspaceId, actionType: action, contactId, conversationId, phone,
    payload: {
      source: idemCtx.source || 'dispatch',
      message, intent, reason, deliveryMode,
      customerMessages: customerMessages || null,
      context: idempotencyContext || null,
    },
  });

  const execution = await beginAutonomyExecution({
    workspaceId, actionType: action, contactId, conversationId,
    workItemId: (idemCtx.workItemId as string | null) || null,
    proofId: (idemCtx.conversationProofId as string | null) ||
      (idemCtx.accountProofId as string | null) ||
      (idemCtx.cycleProofId as string | null) || null,
    capabilityCode: (idemCtx.capabilityCode as string | null) || action,
    tacticCode: (idemCtx.conversationTactic as string | null) || null,
    idempotencyKey, request: { phone, message, intent, reason, deliveryMode, customerMessages: customerMessages || null, context: idempotencyContext || null },
  });

  if (!execution.allowed) {
    await logAutopilotAction({ workspaceId, contactId, phone, action, intent, status: 'skipped', reason: execution.reason, meta: { duplicateExecution: true, idempotencyKey } });
    autopilotPipelineCounter.inc({ workspaceId, stage: 'reply', result: 'duplicate_execution' });
    await reportSmokeTest(smokeTestId, { status: 'skipped', workspaceId, contactId, phone, action, reason: execution.reason });
    return { allowed: false as const, reason: execution.reason };
  }

  const recentDuplicate = await findRecentDuplicateOutbound({
    workspaceId, contactId: contactId || contactRecordId || null, content: message,
  });
  if (recentDuplicate) {
    await finishAutonomyExecution(execution.record?.id, 'SKIPPED', {
      response: { duplicateMessageId: recentDuplicate.id, duplicateCreatedAt: recentDuplicate.createdAt?.toISOString?.() || null, mode: 'recent_duplicate_outbound' },
      error: 'recent_duplicate_outbound',
    });
    await logAutopilotAction({ workspaceId, contactId, phone, action, intent, status: 'skipped', reason: 'recent_duplicate_outbound', meta: { duplicateExecution: true, idempotencyKey, duplicateMessageId: recentDuplicate.id } });
    autopilotPipelineCounter.inc({ workspaceId, stage: 'reply', result: 'recent_duplicate_outbound' });
    return { allowed: false as const, reason: 'recent_duplicate_outbound' };
  }

  return { allowed: true as const, execution, idempotencyKey };
}

export async function dispatchAutopilotAction(input: DispatchInput): Promise<DispatchResult> {
  const {
    workspaceId, action, contactId, contactRecord, conversationId,
    phone, chatId, contactName, message, settings, workspaceRecord,
    intent, reason, intentConfidence, usedHistory, usedKb,
    deliveryMode, smokeTestId, smokeMode, runId, customerMessages,
    idempotencyContext, latestQuotedMessageId,
    hasEmailFallback, contactEmail, followupEligible, isAudioAction,
  } = input;
  const displayName = contactName || (contactRecord?.name as string | undefined) || phone || 'contato';

  const idempotencyResult = await checkIdempotencyAndDuplicates({
    workspaceId, action, contactId,
    contactRecordId: (contactRecord?.id as string | undefined),
    conversationId, phone, message, intent, reason, deliveryMode,
    customerMessages, idempotencyContext, smokeTestId,
  });

  if (!idempotencyResult.allowed) return { status: 'skipped' };

  await publishAgentEvent({
    type: 'typing', workspaceId, runId, phase: 'typing',
    message: `Digitando resposta para ${displayName}.`,
    meta: {
      contactId, contactName: contactName || (contactRecord?.name as string | undefined) || null,
      conversationId, phone, action,
      capabilityCode: (idempotencyContext?.capabilityCode as string | null) || action,
      tacticCode: (idempotencyContext?.conversationTactic as string | null) || null,
      conversationProofId: (idempotencyContext?.conversationProofId as string | null) || null,
      accountProofId: (idempotencyContext?.accountProofId as string | null) || null,
      cycleProofId: (idempotencyContext?.cycleProofId as string | null) || null,
    },
  });

  let sent = false;
  let sendError: string | undefined;
  let executionResponse: Record<string, unknown> | null = null;
  try {
    const started = Date.now();
    const workspaceCfg = buildWorkspaceConfig(workspaceId, settings, workspaceRecord);

    if (isAudioAction) {
      const audioSent = await sendAudioResponse(workspaceId, phone, chatId, message, settings, workspaceCfg, latestQuotedMessageId);
      if (!audioSent) {
        const replyPlan = await dispatchAutonomousReplyPlan({
          workspaceId, phone, chatId, message, idempotencyKey: idempotencyResult.idempotencyKey!,
          customerMessages, settings, quotedMessageId: latestQuotedMessageId,
          mirrorReplies: deliveryMode === 'reactive' && isRecentLiveConversation(customerMessages || []),
        });
        executionResponse = { channel: 'FLOW_SEND_MESSAGE', fallbackFromAudio: true, message, replyPlan };
      } else {
        executionResponse = { channel: 'WHATSAPP_AUDIO', message };
      }
    } else {
      const replyPlan = await dispatchAutonomousReplyPlan({
        workspaceId, phone, chatId, message, idempotencyKey: idempotencyResult.idempotencyKey!,
        customerMessages, settings, quotedMessageId: latestQuotedMessageId,
        mirrorReplies: deliveryMode === 'reactive' && isRecentLiveConversation(customerMessages || []),
      });
      executionResponse = { channel: 'FLOW_SEND_MESSAGE', message, replyPlan };
    }

    await logAutopilotAction({
      workspaceId, contactId, phone, action, intent, status: 'executed', reason,
      latencyMs: Date.now() - started, intentConfidence,
      meta: { usedHistory, usedKb, audioMode: !!isAudioAction },
    });
    autopilotDecisionCounter.inc({ workspaceId, intent: intent || 'UNKNOWN', action, result: 'executed' });
    autopilotPipelineCounter.inc({ workspaceId, stage: 'reply', result: 'sent' });
    await reportSmokeTest(smokeTestId, { status: 'completed', mode: smokeMode || 'live', workspaceId, contactId, phone, action, responseText: message });
    if (action === 'GHOST_CLOSER' || action === 'LEAD_UNLOCKER') {
      autopilotGhostCloserCounter.inc({ workspaceId, action, result: 'executed' });
    }
    sent = true;

    if (followupEligible && isExplicitProactiveOutreachAllowed(settings)) {
      await autopilotQueue.add('followup-contact', {
        workspaceId, contactId, phone, reason: 'buying_signal_followup', scheduledAt: new Date().toISOString(),
      }, { delay: 45 * 60 * 1000, jobId: `followup-${contactId || phone}-bs`, removeOnComplete: true });
    }
  } catch (err: unknown) {
    const errInstanceofError = err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    log.error('autopilot_send_error', { err: errInstanceofError.message });
    sendError = errInstanceofError?.message || 'send_error';
    await logAutopilotAction({
      workspaceId, contactId, phone, action, intent, status: 'error',
      reason: errInstanceofError?.message || 'send_error', intentConfidence,
      meta: { usedHistory, usedKb },
    });
    autopilotDecisionCounter.inc({ workspaceId, intent: intent || 'UNKNOWN', action, result: 'error' });
    autopilotPipelineCounter.inc({ workspaceId, stage: 'reply', result: 'failed' });
    if (action === 'GHOST_CLOSER' || action === 'LEAD_UNLOCKER') {
      autopilotGhostCloserCounter.inc({ workspaceId, action, result: 'error' });
    }
  }

  if (!sent && hasEmailFallback && contactEmail) {
    try {
      await sendEmail(contactEmail, 'Follow-up automático', message);
      logFallback('email', 'sent');
      await persistFallbackMessage({ workspaceId, contactId, channel: 'EMAIL', content: message });
      executionResponse = { channel: 'EMAIL_FALLBACK', message };
      await logAutopilotAction({
        workspaceId, contactId, phone, action: `${action}_EMAIL_FALLBACK`,
        intent, status: 'executed', reason: 'email_fallback',
      });
      autopilotDecisionCounter.inc({ workspaceId, intent: intent || 'UNKNOWN', action: `${action}_EMAIL_FALLBACK`, result: 'executed' });
      autopilotPipelineCounter.inc({ workspaceId, stage: 'reply', result: 'sent_email_fallback' });
      await reportSmokeTest(smokeTestId, { status: 'completed', mode: smokeMode || 'live', workspaceId, contactId, phone, action: `${action}_EMAIL_FALLBACK`, responseText: message });
      sent = true;
    } catch (err: unknown) {
      const errInstanceofError = err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
      logFallback('email', 'error', errInstanceofError?.message);
    }
  }

  if (!sent) {
    await finishAutonomyExecution(idempotencyResult.execution?.record?.id, 'FAILED', { error: sendError || 'dispatch_failed', response: executionResponse });
    return { status: 'failed', error: sendError || 'dispatch_failed' };
  }

  await finishAutonomyExecution(idempotencyResult.execution?.record?.id, 'SUCCESS', { response: executionResponse });

  await publishAgentEvent({
    type: 'contact', workspaceId, runId, phase: 'message_sent',
    message: `Enviei ${action} para ${displayName}.`,
    meta: {
      contactId, contactName: contactName || (contactRecord?.name as string | undefined) || null,
      conversationId, phone, action,
      capabilityCode: (idempotencyContext?.capabilityCode as string | null) || action,
      tacticCode: (idempotencyContext?.conversationTactic as string | null) || null,
      conversationProofId: (idempotencyContext?.conversationProofId as string | null) || null,
      accountProofId: (idempotencyContext?.accountProofId as string | null) || null,
      cycleProofId: (idempotencyContext?.cycleProofId as string | null) || null,
      messagePreview: String(message).slice(0, 240),
      autonomyExecutionId: idempotencyResult.execution?.record?.id || null,
    },
  });

  return { status: 'executed' };
}
