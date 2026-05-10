import { prisma } from '../../db';
import { connection } from '../../queue';
import {
  log,
  type UnknownRecord,
  CONTACT_DAILY_LIMIT,
  WORKSPACE_DAILY_LIMIT,
} from './shared';

export function buildWorkspaceConfig(
  workspaceId: string,
  settings: UnknownRecord,
  record?: UnknownRecord,
) {
  const providerSettings = (record as UnknownRecord | undefined)?.providerSettings || {};
  const whatsappApiSession = {
    ...(providerSettings?.whatsappApiSession || {}),
    ...(settings?.whatsappApiSession || {}),
  };
  const whatsappProvider = 'meta-cloud';

  return {
    id: workspaceId,
    whatsappProvider,
    jitterMin: (record as UnknownRecord | undefined)?.jitterMin,
    jitterMax: (record as UnknownRecord | undefined)?.jitterMax,
    sessionName: whatsappApiSession?.sessionName,
    providerSettings: {
      ...providerSettings,
      whatsappApiSession,
    },
  };
}

export async function checkRateLimits(
  workspaceId: string,
  phone: string,
  deliveryMode: 'reactive' | 'proactive' = 'proactive',
) {
  const bypassReactiveRateLimits =
    (process.env.AUTOPILOT_BYPASS_REACTIVE_RATELIMITS ?? 'true') === 'true';
  if (deliveryMode === 'reactive' && bypassReactiveRateLimits) {
    return { allowed: true as const };
  }
  if (process.env.TEST_AUTOPILOT_SKIP_RATELIMIT === '1') {
    return { allowed: true as const };
  }
  const day = new Date().toISOString().slice(0, 10);
  const contactKey = `autopilot:contact:${phone}:day:${day}`;
  const wsKey = `autopilot:ws:${workspaceId}:day:${day}`;

  const contactCount = await connection.incr(contactKey);
  if (contactCount === 1) {
    await connection.expire(contactKey, 86400);
  }

  const wsCount = await connection.incr(wsKey);
  if (wsCount === 1) {
    await connection.expire(wsKey, 86400);
  }

  if (contactCount > CONTACT_DAILY_LIMIT) {
    return { allowed: false, reason: 'contact_daily_limit' as const };
  }
  if (wsCount > WORKSPACE_DAILY_LIMIT) {
    return { allowed: false, reason: 'workspace_daily_limit' as const };
  }
  return { allowed: true as const };
}

export async function logAutopilotAction(input: {
  workspaceId: string;
  contactId?: string | undefined;
  phone?: string | undefined;
  action: string;
  intent?: string | undefined;
  status: 'executed' | 'error' | 'skipped';
  reason?: string | undefined;
  latencyMs?: number | undefined;
  intentConfidence?: number | undefined;
  meta?: Record<string, unknown> | undefined;
}) {
  try {
    const details = {
      action: input.action,
      intent: input.intent,
      status: input.status,
      reason: input.reason,
      phone: input.phone,
      latencyMs: input.latencyMs,
      confidence: input.intentConfidence,
      ...((input.meta as UnknownRecord) || {}),
    };

    await prisma.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        action: 'AUTOPILOT_ACTION',
        resource: 'contact',
        resourceId: input.contactId ?? null,
        details,
      },
    });

    const client = prisma as never as UnknownRecord;
    if (client.autopilotEvent) {
      await client.autopilotEvent.create({
        data: {
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          intent: input.intent || 'UNKNOWN',
          action: input.action,
          status: input.status,
          reason: input.reason,
          messageSent: input.phone ? `to:${input.phone}` : undefined,
          latencyMs: input.latencyMs,
          meta: details,
        },
      });
    }
  } catch (err: unknown) {
    const errInstanceofError =
      err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    log.warn('autopilot_audit_error', { error: errInstanceofError.message });
  }
}

export async function resolveLatestQuotedMessageId(input: {
  workspaceId: string;
  contactId?: string | undefined;
  conversationId?: string | undefined;
  phone?: string | undefined;
  providerMessageIds?: string[] | undefined;
}): Promise<string | undefined> {
  const fromContext =
    Array.isArray(input.providerMessageIds) && input.providerMessageIds.length > 0
      ? String(input.providerMessageIds[input.providerMessageIds.length - 1] || '').trim() ||
        undefined
      : undefined;
  if (fromContext) {
    return fromContext;
  }

  const message = await prisma.message.findFirst({
    where: {
      workspaceId: input.workspaceId,
      direction: 'INBOUND',
      externalId: { not: null },
      ...(input.conversationId
        ? { conversationId: input.conversationId }
        : input.contactId
          ? { contactId: input.contactId }
          : input.phone
            ? { contact: { phone: input.phone } }
            : {}),
    },
    orderBy: { createdAt: 'desc' },
    select: { externalId: true },
  });

  const externalId = String(message?.externalId || '').trim();
  return externalId || undefined;
}
