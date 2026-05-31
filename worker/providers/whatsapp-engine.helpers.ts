/**
 * @capability WhatsAppEngineHelpers
 * @domain channel
 */
/**
 * Pure helpers extracted from `worker/providers/whatsapp-engine.ts`.
 * Kept free of Redis / BullMQ / provider side effects so they can be
 * unit-tested in isolation.
 */

import { timingSafeEqual } from 'node:crypto';

// ─── Types ───────────────────────────────────────────────────────────────

export type ProviderErrorLike = {
  message?: string;
  response?: {
    status?: number;
  };
};

export type ActionLockConfig = {
  readonly isTestEnv: boolean;
  readonly ttlMs: number;
  readonly backoffMin: number;
  readonly backoffJitter: number;
};

// ─── Provider error helpers ──────────────────────────────────────────────

export function asProviderError(error: unknown): ProviderErrorLike {
  return error && typeof error === 'object' ? (error as ProviderErrorLike) : {};
}

export function errorMessage(error: unknown): string {
  return asProviderError(error).message || 'unknown_error';
}

export function errorStatus(error: unknown): number | undefined {
  return asProviderError(error).response?.status;
}

export function asReasonString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

// ─── Utility ─────────────────────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Action-lock helpers ─────────────────────────────────────────────────

export function isSameLockToken(current: string | null, token: string): boolean {
  if (!current) {
    return false;
  }
  const currentBytes = Buffer.from(current);
  const tokenBytes = Buffer.from(token);
  return currentBytes.length === tokenBytes.length && timingSafeEqual(currentBytes, tokenBytes);
}

export function shouldBypassActionLock(): boolean {
  const testEnforce = process.env.WHATSAPP_ACTION_LOCK_TEST_ENFORCE === 'true';
  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
  return isTestEnv && !testEnforce;
}

export function resolveActionLockConfig(): ActionLockConfig {
  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
  // Production minimum: 15 s.  Test mode: allow shorter values so the
  // lock-deadline test path runs quickly.
  const ttlMs = Math.max(
    isTestEnv ? 100 : 15_000,
    Number.parseInt(process.env.WHATSAPP_ACTION_LOCK_MS || '45000', 10) || 45_000,
  );
  // Keep production backoff at 250-500 ms.  Shorter in test mode only.
  const backoffMin = isTestEnv ? 50 : 250;
  const backoffJitter = isTestEnv ? 50 : 250;
  return { isTestEnv, ttlMs, backoffMin, backoffJitter };
}
// ─── Provider result assertion ──────────────────────────────────────────

/** Sent by the send-text and send-media provider paths. */
export type ProviderSendResult = {
  error?: unknown;
  reason?: unknown;
  message?: unknown;
  success?: boolean;
  [key: string]: unknown;
};

/**
 * Assert that a provider result is non-empty and successful.
 * Throws with a descriptive message on empty / errored / failed results;
 * otherwise returns the result unchanged.
 */
export function assertProviderSendResult<T extends ProviderSendResult>(
  result: T | null | undefined,
  channel: 'text' | 'media',
): T {
  if (!result) {
    throw new Error(`Meta ${channel} returned empty response`);
  }

  if (result?.error) {
    const reason =
      typeof result.error === 'string'
        ? result.error
        : asReasonString(result.reason, asReasonString(result.message, `unknown_${channel}_error`));
    throw new Error(reason);
  }

  if (result?.success === false) {
    throw new Error(
      asReasonString(result.reason, asReasonString(result.message, `Meta ${channel} send failed`)),
    );
  }

  return result;
}
