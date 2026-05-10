import { WorkerLogger } from '../../logger';
import { prisma } from '../../db';
import { redis } from '../../redis-client';
import { publishAgentEvent } from '../../providers/agent-events';
import { autopilotDecisionCounter, autopilotPipelineCounter } from '../../metrics';
import {
  log,
  normalizeJsonObject,
  isAutonomousEnabled,
  SHARENON_DIGIT_REPLY_LOCK_MS,
  type UnknownRecord,
} from './shared';
import {
  isWorkspaceSelfTarget,
} from './identity';
import { logAutopilotAction } from './safeguard';
import {
  resolveScanDeliveryMode,
  getSharedReplyLockKey,
  findConversationAutomationState,
} from './backlog';
import { resolveConversationOwner } from '../../conversation-agent-state';
import { isRecentLiveConversation, notifyBillingSuspended } from './shared';

const scanLog = new WorkerLogger('autopilot:scan-ingestion');

export interface ScanIngestionResult {
  skip: boolean;
  summary: string;
  contactId: string;
  phone: string;
  chatId: string;
  contactName: string;
  messageContent: string;
  messageCount: number;
  messageIds: string[];
  providerMessageIds: string[];
  customerMessages: { content: string; quotedMessageId?: string; createdAt?: string }[];
  deliveryMode: 'reactive' | 'proactive';
  replyLockKey: string | null;
  keepReplyLock: boolean;
  workspaceRecord?: UnknownRecord;
  settings: UnknownRecord;
  smokeTestId?: string;
  smokeMode: string;
  runId?: string;
}

export async function runScanIngestion(params: {
  workspaceId: string;
  contactId?: string;
  phone?: string;
  chatId?: string;
  contactName?: string;
  messageContent?: string;
  smokeTestId?: string;
  smokeMode?: string;
  runId?: string;
  data?: UnknownRecord;
}): Promise<ScanIngestionResult | null> {
  const { workspaceId, smokeTestId, runId, data } = params;
  const smokeMode = params.smokeMode === 'live' ? 'live' : 'dry-run';
  const requestedDeliveryMode = resolveScanDeliveryMode(data || {});

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  const settings = (workspace?.providerSettings ?? {}) as UnknownRecord;

  return {
    skip: false,
    summary: '',
    contactId: '', phone: '', chatId: '', contactName: '',
    messageContent: '', messageCount: 0, messageIds: [], providerMessageIds: [],
    customerMessages: [],
    deliveryMode: 'proactive' as 'reactive' | 'proactive',
    replyLockKey: null, keepReplyLock: false,
    workspaceRecord: workspace as UnknownRecord, settings,
    smokeTestId, smokeMode, runId,
  };
}

export async function checkScanPreFlight(params: {
  workspaceId: string;
  contactId: string;
  phone: string;
  chatId: string;
  contactName: string;
  selfIdentity?: { phone?: string; chatId?: string } | null;
  data?: UnknownRecord;
  runId?: string;
  smokeTestId?: string;
  smokeMode?: string;
}): Promise<{ skip: boolean; summary: string; replyLockKey: string | null }> {
  const { workspaceId, contactId, phone, chatId, contactName, selfIdentity, data, runId, smokeTestId, smokeMode } = params;

  if (isWorkspaceSelfTarget({ phone, chatId, selfIdentity })) {
    await logAutopilotAction({
      workspaceId, contactId, phone, action: 'SCAN_CONTACT',
      intent: 'SELF_CONTACT', status: 'skipped',
      reason: 'workspace_self_contact',
      meta: { source: 'scan_contact', chatId: chatId || null },
    });
    return { skip: true, summary: 'O agente ignorou o próprio número da sessão.', replyLockKey: null };
  }

  const replyLockKey = getSharedReplyLockKey(workspaceId, contactId, phone);
  const replyReserved = await redis.set(
    replyLockKey, String(data?.messageId || runId || 'scan-contact'),
    'PX', SHARENON_DIGIT_REPLY_LOCK_MS, 'NX');
  if (replyReserved !== 'OK') {
    return { skip: true, summary: 'Contato já está sendo respondido por outro pipeline.', replyLockKey: null };
  }

  const conversation = await findConversationAutomationState({ workspaceId, contactId, phone });
  if (conversation && resolveConversationOwner(conversation) !== 'AGENT') {
    const blockedReason = conversation.assignedAgentId ? 'assigned_to_human' : 'human_mode_lock';
    await logAutopilotAction({
      workspaceId, contactId, phone, action: 'SCAN_CONTACT',
      intent: 'HUMAN_REVIEW_REQUIRED', status: 'skipped', reason: blockedReason,
      meta: { source: 'scan_contact', conversationId: conversation.id, conversationMode: conversation.mode, conversationStatus: conversation.status, assignedAgentId: conversation.assignedAgentId || null, owner: resolveConversationOwner(conversation) },
    });
    autopilotPipelineCounter.inc({ workspaceId, stage: 'scan_contact', result: blockedReason });
    await publishAgentEvent({
      type: 'status', workspaceId, runId, phase: 'human_mode_lock', persistent: true,
      message: `A conversa com ${contactName || phone} está aguardando ação humana.`,
      meta: { contactId, contactName, phone, conversationId: conversation.id, conversationMode: conversation.mode, assignedAgentId: conversation.assignedAgentId || null, owner: resolveConversationOwner(conversation) },
    });
    return { skip: true, summary: 'Conversa travada em modo humano.', replyLockKey: null };
  }

  return { skip: false, summary: '', replyLockKey };
}

export async function checkScanAutonomyBilling(params: {
  workspaceId: string;
  contactId: string;
  phone: string;
  settings: UnknownRecord;
  smokeTestId?: string;
}): Promise<{ skip: boolean; summary: string }> {
  const { workspaceId, contactId, phone, settings, smokeTestId } = params;

  if (!isAutonomousEnabled(settings)) {
    autopilotDecisionCounter.inc({ workspaceId, intent: 'DISABLED', action: 'NONE', result: 'skipped' });
    autopilotPipelineCounter.inc({ workspaceId, stage: 'scan_contact', result: 'disabled' });
    return { skip: true, summary: 'Autopilot desativado para este workspace.' };
  }

  if (settings?.billingSuspended === true) {
    log.info('autopilot_skip_billing_suspended', { workspaceId });
    try {
      await prisma.autopilotEvent.create({
        data: { workspaceId, contactId, intent: 'BILLING', action: 'SUSPENDED', status: 'skipped', reason: 'billing_suspended', meta: { source: 'autopilot_worker' } },
      });
    } catch (err: unknown) {
      const errInstanceofError = err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
      log.warn('autopilot_event_billing_skip_failed', { error: errInstanceofError?.message });
    }
    await notifyBillingSuspended(workspaceId);
    autopilotDecisionCounter.inc({ workspaceId, intent: 'BILLING_SUSPENDED', action: 'NONE', result: 'skipped' });
    autopilotPipelineCounter.inc({ workspaceId, stage: 'scan_contact', result: 'billing_suspended' });
    return { skip: true, summary: 'Billing suspenso. O contato não pode ser atendido automaticamente.' };
  }

  return { skip: false, summary: '' };
}

export { scanLog };
