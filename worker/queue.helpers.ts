/**
 * Pure helpers extracted from `worker/queue.ts` so they can be unit-tested
 * without spinning up Redis/BullMQ. Behaviour is byte-identical to the
 * original inline implementations.
 *
 * Keep this module **free of side effects** — no imports of `ioredis`,
 * `bullmq`, or anything that opens sockets at import time. The whole point
 * of the lazy-queue refactor is that importing `worker/queue.ts` should
 * cost zero Redis connections; pure helpers must respect that contract.
 */
import type { RedisOptions } from 'ioredis';

/**
 * Merge an arbitrary list of `Redis['duplicate']` argument objects into a
 * single `RedisOptions` override bag. Non-object / array entries are
 * ignored, matching the historical behaviour of the inline helper.
 */
export function collectRedisDuplicateOverrides(args: unknown[]): RedisOptions {
  const overrides: RedisOptions = {};
  for (const arg of args) {
    if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
      Object.assign(overrides, arg);
    }
  }
  return overrides;
}

/**
 * Best-effort extraction of a `workspaceId` from arbitrary BullMQ job data
 * for DLQ routing. Returns `undefined` when the shape is not recognized so
 * the DLQ payload simply omits the field instead of crashing.
 *
 * Supported shapes:
 *   - `{ workspaceId: 'ws_xxx', ... }`
 *   - `{ workspace: { id: 'ws_xxx' }, ... }`
 */
export function extractWorkspaceIdFromJobData(data: unknown): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return undefined;
  }
  const record = data as Record<string, unknown>;
  if (typeof record.workspaceId === 'string') {
    return record.workspaceId;
  }
  const workspace = record.workspace;
  if (workspace && typeof workspace === 'object' && !Array.isArray(workspace)) {
    return (workspace as Record<string, unknown>).id;
  }
  return undefined;
}

/**
 * Type guard that returns `true` for any value that exposes an
 * EventEmitter-style `.on('error', handler)` signature. Used to safely
 * attach error loggers to BullMQ primitives without depending on the
 * concrete class.
 */
export type ErrorEmitter = {
  on: (event: 'error', handler: (err: Error) => void) => unknown;
};

export function hasErrorEmitter(value: unknown): value is ErrorEmitter {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'on' in value &&
    typeof (value as { on?: unknown }).on === 'function',
  );
}

/**
 * Resolve the queue `attempts` setting from the environment, clamped at a
 * minimum of `1`. Falls back to `3` when the variable is missing or not a
 * positive integer. Matches the inline default from `worker/queue.ts`.
 */
export function resolveQueueAttempts(raw: string | undefined): number {
  const parsed = Number.parseInt(raw || '3', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 3;
  }
  return Math.max(1, parsed);
}

/**
 * Resolve the exponential-backoff base delay (ms), clamped at a minimum of
 * `1000`. Falls back to `5000` when the variable is missing or not a
 * positive integer.
 */
export function resolveQueueBackoffMs(raw: string | undefined): number {
  const parsed = Number.parseInt(raw || '5000', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 5000;
  }
  return Math.max(1000, parsed);
}
