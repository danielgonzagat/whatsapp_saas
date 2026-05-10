import { prisma } from '../../db';
import { flowQueue } from '../../queue';
import {
  normalizeJsonObject,
  type UnknownRecord,
  type QuotedCustomerMessage,
} from './shared';
import { ensureTrustedContactProfile } from './profile';
import { buildMessage } from './execution-planner';
import { checkDeliveryGuards, resolveContactForExecution, type GuardResult } from './execution-guards';
import { dispatchAutopilotAction } from './execution-dispatcher';

export { buildMessage } from './execution-planner';
export { persistFallbackMessage } from './execution-audit';
export { checkDeliveryGuards, ensureCompliance, resolveContactForExecution } from './execution-guards';
export { dispatchAutopilotAction } from './execution-dispatcher';

export async function executeAction(
  action: string,
  input: {
    workspaceId: string;
    contactId?: string | undefined;
    conversationId?: string | undefined;
    phone?: string | undefined;
    chatId?: string | undefined;
    contactName?: string | undefined;
    messageContent?: string | undefined;
    settings?: UnknownRecord | undefined;
    intent?: string | undefined;
    reason?: string | undefined;
    workspaceRecord?: UnknownRecord | undefined;
    intentConfidence?: number | undefined;
    usedHistory?: boolean | undefined;
    usedKb?: boolean | undefined;
    deliveryMode?: 'reactive' | 'proactive' | undefined;
    smokeTestId?: string | undefined;
    smokeMode?: 'dry-run' | 'live' | undefined;
    runId?: string | undefined;
    idempotencyContext?: Record<string, unknown> | undefined;
    customerMessages?: QuotedCustomerMessage[] | undefined;
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
    workspaceId: input.workspaceId, contactId: input.contactId, phone: targetPhone,
    chatId: input.chatId, settings: input.settings || {}, workspaceRecord: input.workspaceRecord,
    deliveryMode, action, intent: input.intent, intentConfidence: input.intentConfidence,
    usedHistory: input.usedHistory, usedKb: input.usedKb,
    smokeTestId: input.smokeTestId, conversationId: input.conversationId,
    idempotencyContext: input.idempotencyContext,
  });
  if (!guard.allowed) return 'skipped';

  const msg = await buildMessage(action, input.messageContent || '', input.settings || {});
  if (!msg) return 'skipped';

  const dispatchResult = await dispatchAutopilotAction({
    workspaceId: input.workspaceId, action, contactId: input.contactId,
    contactRecord, conversationId: input.conversationId, phone: targetPhone,
    chatId: input.chatId, contactName: displayName, message: msg,
    settings: input.settings || {}, workspaceRecord: input.workspaceRecord,
    intent: input.intent, reason: input.reason, intentConfidence: input.intentConfidence,
    usedHistory: input.usedHistory, usedKb: input.usedKb,
    deliveryMode, smokeTestId: input.smokeTestId, smokeMode: input.smokeMode,
    runId: input.runId, customerMessages: input.customerMessages,
    idempotencyContext: input.idempotencyContext,
    latestQuotedMessageId: guard.context?.latestQuotedMessageId,
    hasEmailFallback: true, contactEmail,
    followupEligible: action === 'SEND_OFFER' || action === 'GHOST_CLOSER',
    isAudioAction: action === 'SEND_AUDIO',
  });

  if (dispatchResult.status === 'failed') {
    throw new Error(dispatchResult.error || 'autopilot_send_failed');
  }

  if (action === 'SEND_OFFER') {
    const hotFlowId = input.settings?.autopilot?.hotFlowId;
    if (hotFlowId) {
      await flowQueue.add('run-flow', {
        workspaceId: input.workspaceId, flowId: hotFlowId,
        user: targetPhone, initialVars: { source: 'autopilot_hot', lastMessage: input.messageContent || '' },
      });
    }
  }

  return dispatchResult.status === 'executed' ? 'executed' : 'skipped';
}

export async function sendDirectAutopilotText(input: {
  workspaceId: string;
  contactId?: string | undefined;
  conversationId?: string | undefined;
  phone?: string | undefined;
  chatId?: string | undefined;
  contactName?: string | undefined;
  text: string;
  settings?: UnknownRecord | undefined;
  intent?: string | undefined;
  reason?: string | undefined;
  workspaceRecord?: UnknownRecord | undefined;
  intentConfidence?: number | undefined;
  actionLabel?: string | undefined;
  usedHistory?: boolean | undefined;
  usedKb?: boolean | undefined;
  deliveryMode?: 'reactive' | 'proactive' | undefined;
  smokeTestId?: string | undefined;
  smokeMode?: 'dry-run' | 'live' | undefined;
  runId?: string | undefined;
  idempotencyContext?: Record<string, unknown> | undefined;
  customerMessages?: QuotedCustomerMessage[] | undefined;
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
    workspaceId: input.workspaceId, contactId: input.contactId, phone: targetPhone,
    chatId: resolvedChatId, settings: input.settings || {}, workspaceRecord: input.workspaceRecord,
    deliveryMode, action, intent: input.intent, intentConfidence: input.intentConfidence,
    usedHistory: input.usedHistory, usedKb: input.usedKb,
    smokeTestId: input.smokeTestId, conversationId: input.conversationId,
    idempotencyContext: input.idempotencyContext,
  });
  if (!guard.allowed) return 'skipped';

  const dispatchResult = await dispatchAutopilotAction({
    workspaceId: input.workspaceId, action, contactId: input.contactId,
    contactRecord, conversationId: input.conversationId, phone: targetPhone,
    chatId: resolvedChatId, contactName: displayName, message,
    settings: input.settings || {}, workspaceRecord: input.workspaceRecord,
    intent: input.intent, reason: input.reason, intentConfidence: input.intentConfidence,
    usedHistory: input.usedHistory, usedKb: input.usedKb,
    deliveryMode, smokeTestId: input.smokeTestId, smokeMode: input.smokeMode,
    runId: input.runId, customerMessages: input.customerMessages,
    idempotencyContext: input.idempotencyContext,
    latestQuotedMessageId: guard.context?.latestQuotedMessageId,
    hasEmailFallback: false,
  });

  if (dispatchResult.status === 'failed') {
    throw new Error(dispatchResult.error || 'direct_send_failed');
  }

  return dispatchResult.status === 'executed' ? 'executed' : 'skipped';
}
