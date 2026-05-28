import { Prisma } from '@prisma/client';
import { NON_DIGIT_RE } from '../common/phone';
import type { UnknownRecord } from '../common/types';

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
 * Strips non-digit characters from a phone candidate. Returns `undefined`
 * when the input is empty/undefined, matching the existing
 * `phone?.replace(NON_DIGIT_RE, '') || undefined` idiom inside the service.
 *
 * Pure — no I/O, deterministic.
 */
export function normalizePhoneDigits(phone: string | undefined): string | undefined {
  if (!phone) {
    return undefined;
  }
  const cleaned = phone.replace(NON_DIGIT_RE, '');
  return cleaned || undefined;
}
