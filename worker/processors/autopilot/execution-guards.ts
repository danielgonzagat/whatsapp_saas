import { prisma } from '../../db';
import { PlanLimitsProvider } from '../../providers/plan-limits';
import {
  autopilotDecisionCounter,
  autopilotGhostCloserCounter,
  autopilotPipelineCounter,
} from '../../metrics';
import {
  type UnknownRecord,
} from './shared';
import {
  isWorkspaceSelfTarget,
  resolveWorkspaceSelfIdentity,
} from './identity';
import { logAutopilotAction, checkRateLimits, resolveLatestQuotedMessageId } from './safeguard';
import { reportSmokeTest } from './shared';

export interface GuardContext {
  latestQuotedMessageId: string | undefined;
}

export interface GuardResult {
  allowed: boolean;
  reason?: string;
  context?: GuardContext;
}

export async function checkDeliveryGuards(params: {
  workspaceId: string;
  contactId?: string | undefined;
  phone: string;
  chatId?: string | undefined;
  settings: UnknownRecord;
  workspaceRecord?: UnknownRecord;
  deliveryMode: 'reactive' | 'proactive';
  action: string;
  intent?: string | undefined;
  intentConfidence?: number | undefined;
  usedHistory?: boolean | undefined;
  usedKb?: boolean | undefined;
  smokeTestId?: string | undefined;
  conversationId?: string | undefined;
  idempotencyContext?: Record<string, unknown> | undefined;
}): Promise<GuardResult> {
  const {
    workspaceId, contactId, phone, settings, workspaceRecord,
    deliveryMode, action, intent, intentConfidence,
    usedHistory, usedKb, smokeTestId, conversationId, idempotencyContext,
  } = params;

  const selfIdentity = await resolveWorkspaceSelfIdentity(
    workspaceId, settings || workspaceRecord?.providerSettings);

  if (isWorkspaceSelfTarget({ phone, selfIdentity })) {
    await logAutopilotAction({
      workspaceId, contactId, phone, action, intent,
      status: 'skipped', reason: 'workspace_self_contact',
      intentConfidence, meta: { source: 'guard_pipeline' },
    });
    return { allowed: false, reason: 'workspace_self_contact' };
  }

  const latestQuotedMessageId = await resolveLatestQuotedMessageId({
    workspaceId, contactId, conversationId, phone,
    providerMessageIds: idempotencyContext?.providerMessageIds as string[] | undefined,
  });

  const compliance = await ensureCompliance(workspaceId, phone, settings, undefined, deliveryMode);
  if (!compliance.allowed) {
    await logAutopilotAction({
      workspaceId, contactId, phone, action, intent, status: 'skipped',
      reason: compliance.reason, intentConfidence, meta: { compliance: true },
    });
    autopilotDecisionCounter.inc({ workspaceId, intent: intent || 'UNKNOWN', action, result: 'skipped_compliance' });
    autopilotPipelineCounter.inc({ workspaceId, stage: 'reply', result: 'skipped_compliance' });
    await reportSmokeTest(smokeTestId, { status: 'skipped', workspaceId, contactId, phone, action, reason: compliance.reason });
    return { allowed: false, reason: compliance.reason };
  }

  const rate = await checkRateLimits(workspaceId, phone, deliveryMode);
  if (!rate.allowed) {
    await logAutopilotAction({
      workspaceId, contactId, phone, action, intent, status: 'skipped',
      reason: rate.reason || 'rate_limit',
    });
    autopilotDecisionCounter.inc({ workspaceId, intent: intent || 'UNKNOWN', action, result: 'rate_limited' });
    autopilotPipelineCounter.inc({ workspaceId, stage: 'reply', result: 'rate_limited' });
    await reportSmokeTest(smokeTestId, { status: 'skipped', workspaceId, contactId, phone, action, reason: rate.reason || 'rate_limit' });
    if (action === 'GHOST_CLOSER' || action === 'LEAD_UNLOCKER') {
      autopilotGhostCloserCounter.inc({ workspaceId, action, result: 'rate_limited' });
    }
    return { allowed: false, reason: rate.reason || 'rate_limit' };
  }

  const canSend = await PlanLimitsProvider.checkMessageLimit(workspaceId);
  if (!canSend.allowed) {
    await logAutopilotAction({
      workspaceId, contactId, phone, action, intent, status: 'skipped',
      reason: canSend.reason || 'plan_limit', intentConfidence,
      meta: { usedHistory, usedKb },
    });
    autopilotPipelineCounter.inc({ workspaceId, stage: 'reply', result: 'blocked_plan_limit' });
    await reportSmokeTest(smokeTestId, { status: 'skipped', workspaceId, contactId, phone, action, reason: canSend.reason || 'plan_limit' });
    return { allowed: false, reason: canSend.reason || 'plan_limit' };
  }

  return { allowed: true, context: { latestQuotedMessageId } };
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
    contact = (await prisma.contact.findFirst({
      where: { workspaceId, phone },
      select: {
        id: true, optIn: true, optedOutAt: true,
        customFields: true, tags: { select: { name: true } },
      },
    })) as unknown as typeof contact;
  }

  if (contact && contact.optIn === false) {
    return { allowed: false, reason: 'opted_out' as const };
  }

  if (deliveryMode === 'reactive') {
    return { allowed: true as const };
  }

  const enforceOptIn = process.env.ENFORCE_OPTIN === 'true' || settings?.autopilot?.requireOptIn === true;
  const enforce24h = (process.env.AUTOPILOT_ENFORCE_24H ?? 'true') === 'true';

  if (enforceOptIn) {
    const tags = contact?.tags?.map((t) => t.name.toLowerCase()) || [];
    const cf: UnknownRecord = contact?.customFields || {};
    const hasOptIn = contact?.optIn === true || tags.includes('optin_whatsapp') || cf.optin === true || cf.optin_whatsapp === true;
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

export async function resolveContactForExecution(
  workspaceId: string,
  targetPhone: string,
  contactId?: string,
) {
  let contactRecord: UnknownRecord | undefined;
  let contactEmail: string | undefined;

  if (contactId) {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { phone: true, email: true, customFields: true, optIn: true, optedOutAt: true, id: true, workspaceId: true, name: true, tags: { select: { name: true } } },
    });
    contactRecord = contact as UnknownRecord | undefined;
    contactEmail = contact?.email || undefined;
  }

  if (!contactEmail && workspaceId) {
    const byPhone = await prisma.contact.findFirst({
      where: { workspaceId, phone: targetPhone },
      select: { id: true, email: true, customFields: true, optIn: true, optedOutAt: true, workspaceId: true, name: true, tags: { select: { name: true } } },
    });
    if (byPhone) {
      contactRecord = byPhone;
      contactEmail = byPhone.email || undefined;
    }
  }

  return { contactRecord, contactEmail };
}
