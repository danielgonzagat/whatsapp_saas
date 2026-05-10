import { autopilotQueue } from '../../queue';
import { publishAgentEvent } from '../../providers/agent-events';
import { autopilotDecisionCounter, autopilotGhostCloserCounter, autopilotPipelineCounter } from '../../metrics';
import { logFallback, sendEmail } from '../../providers/channel-dispatcher';
import { log, type UnknownRecord, type QuotedCustomerMessage } from './shared';
import { logAutopilotAction, buildWorkspaceConfig } from './safeguard';
import { sendAudioResponse } from './cycle';
import { isRecentLiveConversation, isExplicitProactiveOutreachAllowed } from './shared';
import {
  findRecentDuplicateOutbound, dispatchAutonomousReplyPlan,
  buildAutonomyExecutionKey, beginAutonomyExecution, finishAutonomyExecution,
} from './cognition';
import { persistFallbackMessage } from './execution-audit';

export interface DispatchInput {
  workspaceId: string;
  action: string;
  contactId?: string | undefined;
  contactRecord?: UnknownRecord | null;
  contactRecordId?: string | undefined;
  conversationId?: string | undefined;
  phone: string;
  chatId?: string | undefined;
  contactName?: string | undefined;
  message: string;
  settings: UnknownRecord;
  workspaceRecord?: UnknownRecord;
  intent?: string | undefined;
  reason?: string | undefined;
  intentConfidence?: number | undefined;
  usedHistory?: boolean | undefined;
  usedKb?: boolean | undefined;
  deliveryMode: 'reactive' | 'proactive';
  smokeTestId?: string | undefined;
  smokeMode?: 'dry-run' | 'live' | undefined;
  runId?: string | undefined;
  customerMessages?: QuotedCustomerMessage[] | undefined;
  idempotencyContext?: Record<string, unknown> | undefined;
  latestQuotedMessageId?: string | undefined;
  hasEmailFallback?: boolean | undefined;
  contactEmail?: string | undefined;
  followupEligible?: boolean | undefined;
  isAudioAction?: boolean | undefined;
}

export interface DispatchResult {
  status: 'executed' | 'skipped' | 'failed';
  error?: string;
}

export async function dispatchAutopilotAction(input: DispatchInput): Promise<DispatchResult> {
  const {
    workspaceId, action, contactId, contactRecord,
    phone, chatId, contactName, message, settings, workspaceRecord,
    intent, reason, intentConfidence, usedHistory, usedKb,
    deliveryMode, runId, customerMessages,
    idempotencyContext, latestQuotedMessageId,
    hasEmailFallback, contactEmail, followupEligible, isAudioAction,
  } = input;

  const displayName = contactName || (contactRecord?.name as string | undefined) || phone || 'contato';

  const idemCtx = idempotencyContext || {};
  const idempotencyKey = buildAutonomyExecutionKey({
    workspaceId, actionType: action, phone,
    payload: { source: idemCtx.source || 'dispatch', message, intent, reason, deliveryMode, customerMessages: customerMessages || null, context: idempotencyContext || null },
  });

  const execution = await beginAutonomyExecution({
    workspaceId, actionType: action,
    workItemId: (idemCtx.workItemId as string | null) || null,
    proofId: (idemCtx.conversationProofId as string | null) || (idemCtx.accountProofId as string | null) || (idemCtx.cycleProofId as string | null) || null,
    capabilityCode: (idemCtx.capabilityCode as string | null) || action,
    tacticCode: (idemCtx.conversationTactic as string | null) || null,
    idempotencyKey, request: { phone, message, intent, reason, deliveryMode, customerMessages: customerMessages || null, context: idempotencyContext || null },
  });

  if (!execution.allowed) {
    await logAutopilotAction({ workspaceId, phone, action, intent, status: 'skipped', reason: execution.reason, meta: { duplicateExecution: true, idempotencyKey } });
    autopilotPipelineCounter.inc({ workspaceId, stage: 'reply', result: 'duplicate_execution' });
    return { status: 'skipped' };
  }

  const recentDuplicate = await findRecentDuplicateOutbound({ workspaceId, contactId: (contactId || (contactRecord?.id as string | undefined)) || null, content: message });
  if (recentDuplicate) {
    await finishAutonomyExecution(execution.record?.id, 'SKIPPED', {
      response: { duplicateMessageId: recentDuplicate.id, duplicateCreatedAt: recentDuplicate.createdAt?.toISOString?.() || null, mode: 'recent_duplicate_outbound' },
      error: 'recent_duplicate_outbound',
    });
    await logAutopilotAction({ workspaceId, phone, action, intent, status: 'skipped', reason: 'recent_duplicate_outbound', meta: { duplicateExecution: true, idempotencyKey, duplicateMessageId: recentDuplicate.id } });
    autopilotPipelineCounter.inc({ workspaceId, stage: 'reply', result: 'recent_duplicate_outbound' });
    return { status: 'skipped' };
  }

  const contactNameMeta = contactName || (contactRecord?.name as string | undefined) || null;
  await publishAgentEvent({
    type: 'typing', workspaceId, runId, phase: 'typing',
    message: `Digitando resposta para ${displayName}.`,
    meta: { phone, action, contactName: contactNameMeta, capabilityCode: (idempotencyContext?.capabilityCode as string | null) || action, tacticCode: (idempotencyContext?.conversationTactic as string | null) || null, conversationProofId: (idempotencyContext?.conversationProofId as string | null) || null, accountProofId: (idempotencyContext?.accountProofId as string | null) || null, cycleProofId: (idempotencyContext?.cycleProofId as string | null) || null },
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
        const replyPlan = await dispatchAutonomousReplyPlan({ workspaceId, phone, chatId, message, idempotencyKey, customerMessages, settings, quotedMessageId: latestQuotedMessageId, mirrorReplies: deliveryMode === 'reactive' && isRecentLiveConversation(customerMessages || []) });
        executionResponse = { channel: 'FLOW_SEND_MESSAGE', fallbackFromAudio: true, message, replyPlan };
      } else {
        executionResponse = { channel: 'WHATSAPP_AUDIO', message };
      }
    } else {
      const replyPlan = await dispatchAutonomousReplyPlan({ workspaceId, phone, chatId, message, idempotencyKey, customerMessages, settings, quotedMessageId: latestQuotedMessageId, mirrorReplies: deliveryMode === 'reactive' && isRecentLiveConversation(customerMessages || []) });
      executionResponse = { channel: 'FLOW_SEND_MESSAGE', message, replyPlan };
    }

    await logAutopilotAction({ workspaceId, phone, action, intent, status: 'executed', reason, latencyMs: Date.now() - started, intentConfidence, meta: { usedHistory, usedKb, audioMode: !!isAudioAction } });
    autopilotDecisionCounter.inc({ workspaceId, intent: intent || 'UNKNOWN', action, result: 'executed' });
    autopilotPipelineCounter.inc({ workspaceId, stage: 'reply', result: 'sent' });
    if (action === 'GHOST_CLOSER' || action === 'LEAD_UNLOCKER') {
      autopilotGhostCloserCounter.inc({ workspaceId, action, result: 'executed' });
    }
    sent = true;

    if (followupEligible && isExplicitProactiveOutreachAllowed(settings)) {
      await autopilotQueue.add('followup-contact', { workspaceId, phone, reason: 'buying_signal_followup', scheduledAt: new Date().toISOString() }, { delay: 45 * 60 * 1000, jobId: `followup-${contactId || phone}-bs`, removeOnComplete: true });
    }
  } catch (err: unknown) {
    const errInstanceofError = err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    log.error('autopilot_send_error', { err: errInstanceofError.message });
    sendError = errInstanceofError?.message || 'send_error';
    await logAutopilotAction({ workspaceId, phone, action, intent, status: 'error', reason: errInstanceofError?.message || 'send_error', intentConfidence, meta: { usedHistory, usedKb } });
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
      await persistFallbackMessage({ workspaceId, channel: 'EMAIL', content: message });
      await logAutopilotAction({ workspaceId, phone, action: `${action}_EMAIL_FALLBACK`, intent, status: 'executed', reason: 'email_fallback' });
      autopilotDecisionCounter.inc({ workspaceId, intent: intent || 'UNKNOWN', action: `${action}_EMAIL_FALLBACK`, result: 'executed' });
      autopilotPipelineCounter.inc({ workspaceId, stage: 'reply', result: 'sent_email_fallback' });
      sent = true;
    } catch (err: unknown) {
      const errInstanceofError = err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
      logFallback('email', 'error', errInstanceofError?.message);
    }
  }

  if (!sent) {
    await finishAutonomyExecution(execution.record?.id, 'FAILED', { error: sendError || 'dispatch_failed', response: executionResponse });
    return { status: 'failed', error: sendError || 'dispatch_failed' };
  }

  await finishAutonomyExecution(execution.record?.id, 'SUCCESS', { response: executionResponse });
  const finalContactName = contactName || (contactRecord?.name as string | undefined) || displayName;
  await publishAgentEvent({
    type: 'contact', workspaceId, runId, phase: 'message_sent',
    message: `Enviei ${action} para ${displayName}.`,
    meta: { phone, action, contactName: finalContactName, messagePreview: String(message).slice(0, 240), autonomyExecutionId: execution.record?.id || null, capabilityCode: (idempotencyContext?.capabilityCode as string | null) || action, tacticCode: (idempotencyContext?.conversationTactic as string | null) || null, conversationProofId: (idempotencyContext?.conversationProofId as string | null) || null, accountProofId: (idempotencyContext?.accountProofId as string | null) || null, cycleProofId: (idempotencyContext?.cycleProofId as string | null) || null },
  });
  return { status: 'executed' };
}
