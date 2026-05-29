/**
 * @capability FlowUserKeyHelpers
 * @domain flows-automation
 */
/**
 * Pure helpers extracted from `FlowEngineGlobal` (worker/flow-engine-global.ts).
 *
 * These three functions encode the engine's user/workspace key conventions:
 *
 *  - `normalizeUser` strips every non-digit from a raw user/phone identifier,
 *    matching the convention used everywhere flow state is keyed by phone.
 *  - `flowContextKey` produces the ContextStore key (`flow:<workspace>:<user>`
 *    or `flow:<user>` for legacy fallback) under which `ExecutionState` is
 *    persisted.
 *  - `flowTimeoutMember` produces the ZSET member name (`<workspace>:<user>`
 *    or `<user>` legacy) used for the `timeouts` sorted set monitored by
 *    `checkTimeouts`.
 *
 * The helpers are pure (no IO, no Date.now, no globals) and therefore safe to
 * unit-test in isolation. The engine still owns lifecycle and orchestration —
 * this module just centralises the key-shape contract so tests can pin the
 * format used by every flow-execution code path (start, resume, timeout,
 * cleanup).
 */

/** Regex matching any non-digit character — exported for testing. */
export const NON_DIGIT_RE = /\D/g;

/**
 * Normalise a raw user identifier to digits only. Used as the canonical user
 * key everywhere the flow engine persists or routes execution state.
 *
 * Accepts `null` / `undefined` defensively because legacy call sites have
 * historically passed empty strings.
 */
export const normalizeUser = (user: string | null | undefined): string =>
  (user ?? '').replace(NON_DIGIT_RE, '');

/**
 * Build the ContextStore key under which `ExecutionState` is stored.
 *
 * Returns `flow:<workspaceId>:<normalisedUser>` when a workspace id is present
 * and `flow:<normalisedUser>` otherwise (legacy compat key — pre-multi-tenant
 * executions wrote to the bare form).
 */
export const flowContextKey = (user: string, workspaceId?: string): string => {
  const normalised = normalizeUser(user);
  return workspaceId ? `flow:${workspaceId}:${normalised}` : `flow:${normalised}`;
};

/**
 * Build the ZSET member name used in the global `timeouts` sorted set.
 *
 * Returns `<workspaceId>:<normalisedUser>` when scoped to a workspace and
 * `<normalisedUser>` otherwise (legacy compat).
 */
export const flowTimeoutMember = (user: string, workspaceId?: string): string => {
  const normalised = normalizeUser(user);
  return workspaceId ? `${workspaceId}:${normalised}` : normalised;
};
