import { Prisma } from '@prisma/client';
import { NON_DIGIT_RE } from '../common/phone';
import type { UnknownRecord } from '../common/types';

// NOTE: a former `normalizePhoneDigits` helper used to live here. It was a
// near-duplicate of {@link extractAsciiDigits} from
// `backend/src/common/phone/phone-normalization.util.ts` (canonical per
// ADR-0012). Per the canonicalization gate, callers now consume the
// canonical {@link extractAsciiDigits} directly and apply `|| undefined`
// at the call site when the field must be omitted from a Prisma write.

/**
 * Loose shape consumed by {@link extractPhone} — arbitrary JSON bag from an
 * upstream provider (Stripe, Hotmart, Shopify, etc.).
 */
export type PhoneBearingPayload = Record<string, unknown>;

/** Finance settings bag pulled from `providerSettings.finance`. */
export type WebhookFinanceSettings = Record<string, unknown>;

/**
 * Runtime-narrow helper: returns an object when `value` is a non-null record.
 *
 * Pure — no I/O, deterministic.
 */
export function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null ? (value as UnknownRecord) : null;
}

/**
 * Best-effort serialization of an arbitrary value into Prisma's JSON shape.
 * Falls back to a structured error marker when the value cannot be JSON-
 * round-tripped (e.g. cyclic references), so that audit-trail writes never
 * propagate a serialization exception back to the webhook processor.
 *
 * Pure — no I/O, deterministic given the same input.
 */
export function toPrismaJsonValue(value: unknown): Prisma.InputJsonValue {
  try {
    return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
  } catch {
    return {
      serializationError: true,
      valueType: typeof value,
    };
  }
}

/**
 * Heuristic phone-number extractor. Walks a known list of flat and nested
 * candidate fields commonly emitted by payment / checkout webhooks, returning
 * the first value with at least 10 digits once non-digits are stripped.
 *
 * Returns `null` when no candidate yields a long-enough digit string.
 *
 * Pure — no I/O, deterministic.
 */
export function extractPhone(payload: PhoneBearingPayload): string | null {
  const data = asRecord(payload.data);
  const dataObject = data ? asRecord(data.object) : null;
  const customerDetails = dataObject ? asRecord(dataObject.customer_details) : null;
  const buyer = asRecord(payload.buyer);
  const candidates: unknown[] = [
    payload.phone,
    payload.mobile,
    payload.whatsapp,
    payload.telephone,
    payload.celular,
    payload.contact_phone,
    // Stripe specific
    customerDetails?.phone,
    dataObject?.phone,
    // Hotmart specific
    buyer?.phone,
    payload.checkout_phone,
  ];

  for (const c of candidates) {
    if (c && typeof c === 'string') {
      const cleaned = c.replace(NON_DIGIT_RE, '');
      if (cleaned.length >= 10) {
        return cleaned;
      }
    }
  }

  return null;
}

/**
 * Resolves the workspace-configured finance flow id for the given payment
 * status. Falls back to `flowDefaultId` when no status-specific flow is set.
 *
 * Status is normalised to lowercase before lookup, mirroring the existing
 * runtime behaviour.
 *
 * Pure — no I/O, deterministic.
 */
export function resolveFinanceFlowId(
  finance: WebhookFinanceSettings,
  status: string,
): string | undefined {
  const normalized = String(status || '').toLowerCase();
  const map: Record<string, string | undefined> = {
    paid: finance.flowPaidId as string | undefined,
    pending: finance.flowPendingId as string | undefined,
    canceled: finance.flowCanceledId as string | undefined,
    overdue: finance.flowOverdueId as string | undefined,
  };
  return map[normalized] || (finance.flowDefaultId as string | undefined);
}

/**
 * Normalises a status string to upper-case (mirrors the existing branch in
 * {@link WebhooksService.updateMessageStatus}).
 *
 * Pure — no I/O, deterministic.
 */
export function normalizeMessageStatus(status: string | undefined): string {
  return (status || '').toUpperCase();
}

/**
 * Minimal message row shape emitted over gateway/pubsub after a status update.
 * Re-exported so callers building/consuming the event payloads can share the
 * exact contract used by the webhooks service.
 */
export interface MessageStatusTarget {
  id: string;
  conversationId: string | null;
  contactId: string | null;
  externalId: string | null;
}

/**
 * Shape of the row Prisma returns for {@link WebhooksService.getRecentFinanceEvents}.
 * Loosely typed because the `details` column is a Prisma `Json` value.
 */
export interface FinanceAuditLogRow {
  createdAt: Date;
  details: unknown;
  resourceId: string | null;
}

/** Outbound finance-event row exposed by the recent-events endpoint. */
export interface FinanceEventDto {
  at: Date;
  flowId: string | null;
  status: string | undefined;
  phone: string | undefined;
  amount: number | undefined;
  provider: string | undefined;
}

/**
 * Maps a Prisma {@link FinanceAuditLogRow} to the public-facing finance event
 * DTO. Pure — no I/O, deterministic.
 */
export function mapFinanceLogToEvent(row: FinanceAuditLogRow): FinanceEventDto {
  const details = (asRecord(row.details) ?? {}) as {
    status?: string;
    phone?: string;
    amount?: number;
    provider?: string;
  };
  return {
    at: row.createdAt,
    flowId: row.resourceId,
    status: details.status,
    phone: details.phone,
    amount: details.amount,
    provider: details.provider,
  };
}

/**
 * Builds the structured payload persisted as the `details` column of the
 * `FINANCE_EVENT` audit log entry.
 *
 * Pure — no I/O, deterministic.
 */
export function buildFinanceAuditDetails(input: {
  status: string;
  phone: string;
  amount?: number;
  provider?: string;
}): { status: string; phone: string; amount: number | undefined; provider: string | undefined } {
  return {
    status: input.status,
    phone: input.phone,
    amount: input.amount,
    provider: input.provider,
  };
}

/**
 * Builds the `message:status` event payload broadcast over the inbox gateway
 * and the `ws:inbox` Redis channel.
 *
 * Pure — no I/O, deterministic.
 */
export function buildStatusEventPayload(
  target: MessageStatusTarget,
  status: string,
  errorCode: string | null,
): MessageStatusTarget & { status: string; errorCode: string | null } {
  return {
    id: target.id,
    conversationId: target.conversationId,
    contactId: target.contactId,
    externalId: target.externalId,
    status,
    errorCode,
  };
}

/**
 * Builds the `conversation:update` event payload (last-message status sync).
 *
 * Pure — no I/O, deterministic. Returns `null` when the message is not bound
 * to a conversation, so callers can skip the emit cleanly.
 */
export function buildConversationUpdatePayload(
  target: MessageStatusTarget,
  status: string,
  errorCode: string | null,
): {
  id: string;
  lastMessageStatus: string;
  lastMessageErrorCode: string | null;
  lastMessageId: string;
} | null {
  if (!target.conversationId) {
    return null;
  }
  return {
    id: target.conversationId,
    lastMessageStatus: status,
    lastMessageErrorCode: errorCode,
    lastMessageId: target.id,
  };
}

/**
 * Wraps a `message:status` payload in the canonical pub/sub envelope used on
 * the `ws:inbox` Redis channel.
 *
 * Pure — no I/O, deterministic.
 */
export function buildStatusPubSubEnvelope(
  workspaceId: string,
  payload: ReturnType<typeof buildStatusEventPayload>,
): string {
  return JSON.stringify({
    type: 'message:status',
    workspaceId,
    payload,
  });
}

/**
 * Wraps a `conversation:update` payload in the canonical pub/sub envelope.
 *
 * Pure — no I/O, deterministic.
 */
export function buildConversationPubSubEnvelope(
  workspaceId: string,
  conversation: NonNullable<ReturnType<typeof buildConversationUpdatePayload>>,
): string {
  return JSON.stringify({
    type: 'conversation:update',
    workspaceId,
    conversation,
  });
}

