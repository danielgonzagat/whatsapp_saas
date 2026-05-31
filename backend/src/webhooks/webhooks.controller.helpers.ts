import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Pure helpers extracted from `webhooks.controller.ts` (Claude-w120 decomposition).
 *
 * All functions here are side-effect free: they take raw inputs and return either
 * a value or throw a typed error code. The controller maps those error codes to
 * `HttpException` instances. Keeping the helpers framework-agnostic makes them
 * trivially unit-testable without spinning up Nest.
 */

/** Default Redis dedupe TTL (5 minutes) for inbound webhook idempotency keys. */
export const WEBHOOK_DEDUPE_TTL_SECONDS = 300;

/** Default cap on the alerts:webhooks Redis list. */
export const WEBHOOK_ALERTS_LIST_MAX = 50;

/** Length of the truncated SHA-256 digest used as a stable externalId fallback. */
export const WEBHOOK_EXTERNAL_ID_LENGTH = 24;

/**
 * Minimal shape of the raw HTTP request consumed by the webhook controller.
 * Mirrors {@link WebhookRequestLike} in the controller so helpers can be tested
 * without pulling express types.
 */
export interface WebhookRequestLike {
  body?: unknown;
  rawBody?: string | Buffer;
  url?: string;
}

export type WebhookSignatureError =
  | { code: 'SECRET_NOT_CONFIGURED'; productionOnly: true }
  | { code: 'MISSING_SIGNATURE' }
  | { code: 'INVALID_SIGNATURE' };

/**
 * Normalize the raw payload that should be used as the HMAC input. Prefers an
 * explicit `rawBody` (Buffer or string) when present, otherwise falls back to a
 * deterministic JSON.stringify of the parsed body. Mirrors what the original
 * controller does, but in a single pure function.
 */
export function resolveRawBody(req?: WebhookRequestLike): Buffer {
  const raw = req?.rawBody ?? JSON.stringify(req?.body ?? '');
  return Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw));
}

/**
 * Constant-time string comparison for HMAC digests. Falls back to plain
 * equality for length mismatches (which fail fast anyway).
 */
export function safeSignatureEqual(actual: string, expected: string): boolean {
  if (actual.length !== expected.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Compute the canonical webhook externalId. If the caller supplied an
 * `x-event-id` header (or any other deterministic id), we use that. Otherwise
 * we derive a stable 24-char digest from the body using the hooks secret
 * (falling back to a fixed salt for dev environments where the secret is
 * intentionally missing).
 */
export function computeExternalId(
  eventId: string | undefined,
  body: unknown,
  secret?: string,
): string {
  if (eventId && eventId.trim().length > 0) {
    return eventId;
  }
  const salt = secret && secret.length > 0 ? secret : 'hooks_salt';
  const payload = Buffer.from(JSON.stringify(body ?? {}));
  return createHmac('sha256', salt)
    .update(payload)
    .digest('hex')
    .slice(0, WEBHOOK_EXTERNAL_ID_LENGTH);
}

/**
 * Build the Redis dedupe key used by `checkIdempotencyOrThrow`. Encapsulating
 * the prefix here means tests can assert the key shape without reaching into
 * Redis state.
 */
export function buildDedupeKey(eventId: string | undefined, raw: Buffer, secret?: string): string {
  const salt = secret && secret.length > 0 ? secret : 'hooks_salt';
  const id =
    eventId && eventId.trim().length > 0
      ? eventId
      : createHmac('sha256', salt).update(raw).digest('hex').slice(0, WEBHOOK_EXTERNAL_ID_LENGTH);
  return `webhook:hooks:${id}`;
}

/**
 * Validate an HMAC-SHA256 signature against the request body. Returns
 * `{ ok: true }` when validation succeeds (or when the secret is not configured
 * outside of production, which intentionally bypasses verification for local
 * dev). Returns a typed error otherwise — the controller maps it to the
 * appropriate `HttpException`.
 */
export function verifyHookSignature(
  signature: string | undefined,
  secret: string | undefined,
  raw: Buffer,
  isProduction: boolean,
): { ok: true } | WebhookSignatureError {
  if (!secret) {
    if (isProduction) {
      return { code: 'SECRET_NOT_CONFIGURED', productionOnly: true };
    }
    return { ok: true };
  }
  if (!signature) {
    return { code: 'MISSING_SIGNATURE' };
  }
  const expected = createHmac('sha256', secret).update(raw).digest('hex');
  if (!safeSignatureEqual(signature, expected)) {
    return { code: 'INVALID_SIGNATURE' };
  }
  return { ok: true };
}

/**
 * Validate the Meta/Facebook `X-Hub-Signature-256` header. Meta prefixes the
 * digest with `sha256=`, so we construct the expected value the same way and
 * compare in constant time.
 */
export function verifyMetaSignature(
  signature: string | undefined,
  appSecret: string | undefined,
  raw: Buffer,
  // Retained for call-site signature parity; the Meta path now fails closed
  // regardless of environment, so production-ness no longer gates the result.
  _isProduction: boolean,
): { ok: true } | WebhookSignatureError {
  // Fail closed regardless of NODE_ENV: a missing secret can never auto-pass.
  // Previously, when META_APP_SECRET was unset outside production, unsigned Meta
  // webhooks were accepted unconditionally — a fail-open hole now closed.
  if (!appSecret) {
    return { code: 'SECRET_NOT_CONFIGURED', productionOnly: true };
  }
  if (!signature) {
    return { code: 'MISSING_SIGNATURE' };
  }
  const digest = createHmac('sha256', appSecret).update(raw).digest('hex');
  const expected = `sha256=${digest}`;
  if (!safeSignatureEqual(signature, expected)) {
    return { code: 'INVALID_SIGNATURE' };
  }
  return { ok: true };
}

/**
 * Resolve the destination URL for the ops alert. Mirrors the original env-var
 * priority: `OPS_WEBHOOK_URL` → `AUTOPILOT_ALERT_WEBHOOK` → `DLQ_WEBHOOK_URL`.
 * Returns `undefined` when no destination is configured so the caller can skip
 * the network call.
 */
export function resolveOpsAlertUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.OPS_WEBHOOK_URL || env.AUTOPILOT_ALERT_WEBHOOK || env.DLQ_WEBHOOK_URL || undefined;
}

/**
 * Build the JSON payload sent to ops on duplicate-webhook detection. Includes
 * an ISO timestamp at the moment of construction; pass `now` to make tests
 * deterministic.
 */
export function buildOpsAlertPayload(
  message: string,
  meta: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
): {
  type: string;
  meta: Record<string, unknown>;
  at: string;
  env: string;
} {
  return {
    type: message,
    meta,
    at: now.toISOString(),
    env: env.NODE_ENV || 'dev',
  };
}

/**
 * Returns true when the given error is a Prisma P2002 unique-constraint
 * violation (used to detect duplicate `WebhookEvent` rows). Encapsulated so we
 * can swap the detection strategy if Prisma changes the shape.
 */
export function isPrismaUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'P2002';
}

/**
 * Normalize an unknown error value into an `Error` instance. The controller
 * uses this when logging failures from downstream services that may throw
 * strings or arbitrary objects.
 */
export function toErrorInstance(err: unknown): Error {
  if (err instanceof Error) {
    return err;
  }
  if (typeof err === 'string') {
    return new Error(err);
  }
  return new Error('unknown error');
}

/**
 * Clamp the `recentFinance` limit to a sensible default+cap. Centralizes the
 * (50, 200) policy so callers and tests share one definition.
 */
export function clampRecentFinanceLimit(input: number | undefined): number {
  const proposed = input && input > 0 ? input : 50;
  return Math.min(proposed, 200);
}
