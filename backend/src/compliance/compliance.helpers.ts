import { randomBytes } from 'node:crypto';

/**
 * Nested object keys that must never be traversed when walking
 * attacker-supplied payloads (prototype pollution guard).
 */
export const BLOCKED_NESTED_KEYS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

/**
 * Walk a path of keys through a nested object and return a trimmed string
 * if the resolved value is a string. Returns '' on any miss, non-object
 * traversal, prototype-pollution key, array boundary, or non-string leaf.
 *
 * Pure — no IO, no globals.
 */
export function readNestedString(value: Record<string, unknown>, path: string[]): string {
  let cursor: unknown = value;
  for (const key of path) {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) {
      return '';
    }
    if (BLOCKED_NESTED_KEYS.has(key) || !Object.prototype.hasOwnProperty.call(cursor, key)) {
      return '';
    }
    cursor = Reflect.get(cursor, key);
  }

  return typeof cursor === 'string' ? cursor.trim() : '';
}

/**
 * Minimal shape of a Security Event Token payload required to extract a
 * subject identifier. Kept local so this module stays pure (no JWT imports).
 */
export interface SubjectExtractablePayload {
  sub?: unknown;
}

/**
 * Resolve the subject identifier for a Google RISC / SET event.
 *
 * Resolution order:
 *  1. `eventPayload.subject.sub`
 *  2. `eventPayload.subject.subject`
 *  3. `eventPayload.sub`
 *  4. top-level `payload.sub`
 *
 * Returns an empty string if no candidate is a non-empty string. Callers
 * decide how to surface the "no subject" condition (HTTP 400, log, etc).
 *
 * Pure — no IO, no exceptions.
 */
export function extractSubjectIdentifier(
  payload: SubjectExtractablePayload,
  eventPayload: Record<string, unknown>,
): string {
  return (
    readNestedString(eventPayload, ['subject', 'sub']) ||
    readNestedString(eventPayload, ['subject', 'subject']) ||
    readNestedString(eventPayload, ['sub']) ||
    String(payload?.sub ?? '').trim()
  );
}

/**
 * Generate a 16-character lowercase-hex confirmation code suitable for
 * public-facing data-deletion status URLs. 12 random bytes -> 24 hex chars,
 * trimmed to 16 to keep the URL compact while preserving ~64 bits of entropy.
 */
export function generateConfirmationCode(): string {
  return randomBytes(12).toString('hex').slice(0, 16);
}

/**
 * Normalize an email address for opt-out lookup: lowercase + trim. Mirrors
 * the case-insensitive matching already used by the Contact query path.
 */
export function normalizeUnsubscribeEmail(email: string): string {
  return String(email ?? '')
    .toLowerCase()
    .trim();
}

/**
 * Resolve the public site URL from env, falling back to the production
 * apex. Strips a trailing slash so callers can concatenate paths cleanly.
 *
 * Pure given an explicit env-like record (defaults to process.env). Tests
 * pass a fixture to avoid mutating real process state.
 */
export function resolveSiteUrl(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string {
  const raw = env.NEXT_PUBLIC_SITE_URL || env.FRONTEND_URL || 'https://kloel.com';
  return String(raw).replace(/\/$/, '');
}

/**
 * Build the public deletion-status URL for a confirmation code.
 */
export function buildDeletionStatusUrl(
  confirmationCode: string,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string {
  return `${resolveSiteUrl(env)}/data-deletion/status/${confirmationCode}`;
}

/**
 * Classify a Google RISC event type into the action it should trigger.
 * Encapsulates the suffix-matching rules used by the service so they can
 * be unit-tested without spinning up Prisma.
 *
 * Returns one of:
 *  - 'sessions-revoked' — revoke refresh tokens only
 *  - 'tokens-revoked'   — clear SocialAccount tokens + revoke refresh tokens
 *  - 'account-disabled' — disable agent + revoke refresh tokens
 *  - 'account-purged'   — soft-delete agent
 *  - 'unknown'          — no action
 *
 * Pure — no IO.
 */
export type RiscEventAction =
  | 'sessions-revoked'
  | 'tokens-revoked'
  | 'account-disabled'
  | 'account-purged'
  | 'unknown';

export function classifyRiscEvent(eventType: string): RiscEventAction {
  const type = String(eventType ?? '');
  if (type.endsWith('/sessions-revoked')) {
    return 'sessions-revoked';
  }
  if (type.endsWith('/tokens-revoked')) {
    return 'tokens-revoked';
  }
  if (type.endsWith('/account-disabled')) {
    return 'account-disabled';
  }
  if (type.endsWith('/account-purged')) {
    return 'account-purged';
  }
  return 'unknown';
}

/**
 * Produce the redacted Agent record used when soft-deleting in compliance
 * flows. Centralized so future schema changes only touch one place.
 */
export interface RedactedAgentFields {
  name: string;
  email: string;
  phone: null;
  avatarUrl: null;
  provider: null;
  providerId: null;
  emailVerified: false;
  disabledAt: Date;
  deletedAt: Date;
}

export function buildRedactedAgentFields(
  agentId: string,
  now: Date = new Date(),
): RedactedAgentFields {
  return {
    name: 'Deleted User',
    email: `deleted-${agentId}@removed.local`,
    phone: null,
    avatarUrl: null,
    provider: null,
    providerId: null,
    emailVerified: false,
    disabledAt: now,
    deletedAt: now,
  };
}
