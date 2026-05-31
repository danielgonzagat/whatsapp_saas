/**
 * Pure helpers extracted from {@link MindEventSpine} (ADR-0013 Wave M1).
 *
 * No side effects, no DI, no Prisma queries — only JSON sanitisation and event
 * name → intent / status classification. Keeping these isolated lets the spine
 * service focus on transactional outbox handling and makes the routing rules
 * trivially unit-testable.
 *
 * @cluster Mind/Coordination
 * @canonical backend/src/kloel/mind/coordination/mind-event-spine.helpers.ts
 */
import { Prisma } from '@prisma/client';
import type { BrainEventName } from './mind-event-taxonomy';

/**
 * Narrows an unknown value to a plain JSON-record shape (object, non-null,
 * non-array). Mirrors the historical inline check used by the spine.
 */
export function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Maps unsupported JSON value types (bigint, function, symbol, undefined) to a
 * stable string sentinel so callers never crash on persistence.
 */
export function toUnsupportedJsonValue(value: unknown): string {
  const valueType = typeof value;
  const candidates: Array<[boolean, string]> = [
    [valueType === 'bigint', String(value)],
    [valueType === 'function', 'function'],
    [valueType === 'symbol', 'symbol'],
    [valueType === 'undefined', 'undefined'],
  ];
  return candidates.find(([matches]) => matches)?.[1] ?? 'unsupported';
}

/**
 * Coerces any value into a Prisma-safe {@link Prisma.InputJsonValue}. Nullish
 * inputs collapse to `null`; non-finite numbers and exotic types fall back to
 * {@link toUnsupportedJsonValue}.
 */
export function toInputJsonValue(value: unknown): Prisma.InputJsonValue | null {
  if (value === null || typeof value === 'undefined') {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => toInputJsonValue(item));
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (isJsonRecord(value)) {
    return toInputJsonObject(value);
  }
  return toUnsupportedJsonValue(value);
}

/**
 * Object-only variant of {@link toInputJsonValue}. Drops `undefined` entries
 * before recursing so Prisma never sees explicit `undefined` keys.
 */
export function toInputJsonObject(payload: Record<string, unknown>): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(payload)
      .filter(([, value]) => typeof value !== 'undefined')
      .map(([key, value]) => [key, toInputJsonValue(value)]),
  );
}

const INTENT_PREFIX_MAP: Array<[string, string]> = [
  ['sale.', 'sale_lifecycle'],
  ['checkout.', 'checkout_lifecycle'],
  ['message.', 'message_lifecycle'],
  ['lead.', 'lead_lifecycle'],
  ['campaign.', 'campaign_lifecycle'],
  ['product.', 'product_lifecycle'],
  ['brain.', 'brain_lifecycle'],
  ['mind.', 'mind_lifecycle'],
  ['capability.', 'capability_lifecycle'],
  ['contact.', 'contact_lifecycle'],
  ['channel.', 'channel_lifecycle'],
  ['identity.', 'identity_lifecycle'],
  ['concept.', 'concept_lifecycle'],
];

/**
 * Classifies a canonical event name into its lifecycle "intent" bucket. Falls
 * back to `commercial_lifecycle` for unrecognised prefixes so the audit row is
 * never left empty.
 */
export function resolveEventIntent(eventType: BrainEventName): string {
  const match = INTENT_PREFIX_MAP.find(([prefix]) => eventType.startsWith(prefix));
  return match?.[1] ?? 'commercial_lifecycle';
}

const SKIPPED_SUFFIXES = ['.cancelled', '.refunded', '.abandoned', '.disconnected'] as const;
const ERROR_SUFFIXES = ['.failed', '.externally_blocked'] as const;

/**
 * Maps a canonical event name to the {@link AutopilotEvent} status column. The
 * spine treats cancel/refund/abandon/disconnect as soft skips and failures as
 * hard errors; everything else is considered an executed lifecycle step.
 */
export function resolveEventStatus(eventType: BrainEventName): string {
  if (SKIPPED_SUFFIXES.some((suffix) => eventType.endsWith(suffix))) {
    return 'skipped';
  }
  if (ERROR_SUFFIXES.some((suffix) => eventType.endsWith(suffix))) {
    return 'error';
  }
  return 'executed';
}
