/**
 * Pure helpers extracted from KloelThinkerService for the ABI / handoff-gate
 * branch. Keeping these out of the service class makes the bounded-payload
 * math, env-flag parsing, error-extraction and log-payload shape unit-testable
 * without spinning up the full Nest container.
 *
 * The names mirror the inline blocks in `kloel-thinker.service.ts` so a reader
 * can grep `boundedAbi` / `HANDOFF_CONFIDENCE_GATE` and land on either side.
 */

import type { HandoffConfidenceSnapshot } from './handoff-confidence.helper';

/**
 * Hard cap on the stringified ABI payload after array-bounding. Sized so the
 * full enriched ABI fits well inside the DeepSeek V4 Pro context budget; the
 * slice path is therefore a never-reached last resort.
 */
export const ABI_MAX_STRING_LENGTH = 24000;

/**
 * Max array length retained while serializing the ABI payload. We keep only
 * the head of any array so a long user prompt cannot be inflated by the state
 * payload (root cause of the long-message hang).
 */
export const ABI_ARRAY_CAP = 8;

/** JSON.stringify replacer that slices every array down to `ABI_ARRAY_CAP`. */
export function capAbiArraysReplacer(_key: string, value: unknown): unknown {
  return Array.isArray(value) ? value.slice(0, ABI_ARRAY_CAP) : value;
}

export interface BoundedAbiPayload {
  /** ABI with arrays capped at `ABI_ARRAY_CAP`. Safe to embed in a prompt. */
  boundedAbi: Record<string, unknown>;
  /** Length of the stringified bounded ABI (post-truncation if it ran). */
  abiStrLen: number;
  /** Whether the slice path actually fired (>= ABI_MAX_STRING_LENGTH). */
  truncated: boolean;
}

/**
 * Bound an arbitrary ABI payload so it fits cleanly inside a system prompt:
 * caps every array to 8 entries, JSON-stringifies, and finally slices the
 * string at {@link ABI_MAX_STRING_LENGTH} as a last resort.
 *
 * The function is intentionally pure — no logger, no env, no IO — so it can
 * be stress-tested without mocks. The service is responsible for deciding
 * whether to call it (flag-gated) and for handling failure modes around it.
 */
export function buildBoundedAbiPayload(abi: Record<string, unknown>): BoundedAbiPayload {
  const boundedAbi = JSON.parse(JSON.stringify(abi, capAbiArraysReplacer)) as Record<
    string,
    unknown
  >;
  let abiStr = JSON.stringify(boundedAbi);
  let truncated = false;
  if (abiStr.length > ABI_MAX_STRING_LENGTH) {
    abiStr = `${abiStr.slice(0, ABI_MAX_STRING_LENGTH)}…(state_truncated)`;
    truncated = true;
  }
  return { boundedAbi, abiStrLen: abiStr.length, truncated };
}

export interface HandoffGateFlags {
  /** Either gate is on → emit the snapshot log. */
  observe: boolean;
  /** Blocking gate is on → may short-circuit the stream with an escalation. */
  blocking: boolean;
}

/**
 * Read the two handoff-confidence env flags. Pure read of `process.env`
 * keeps the service free of env-string literals at call sites.
 */
export function readHandoffGateFlags(env: NodeJS.ProcessEnv = process.env): HandoffGateFlags {
  const enabled = env['HANDOFF_CONFIDENCE_GATE_ENABLED'] === 'true';
  const blocking = env['HANDOFF_CONFIDENCE_GATE_BLOCKING_ENABLED'] === 'true';
  return { observe: enabled || blocking, blocking };
}

/**
 * Decide whether the blocking handoff gate should fire for this snapshot.
 * Stays pure so we can fuzz composite scores against the threshold without
 * touching the streaming code.
 */
export function shouldEscalateForHandoff(
  snapshot: Pick<HandoffConfidenceSnapshot, 'wouldEscalateAtThreshold04'>,
  flags: Pick<HandoffGateFlags, 'blocking'>,
): boolean {
  return flags.blocking && snapshot.wouldEscalateAtThreshold04;
}

/**
 * Build the structured log payload for a handoff-confidence escalation. The
 * resulting object is what the service ships into `logger.warn` — having it
 * pure means the test can assert the exact keys/values that downstream
 * dashboards rely on.
 */
export function buildHandoffEscalationLog(params: {
  snapshot: HandoffConfidenceSnapshot;
  workspaceId: string | undefined;
  threshold: number;
}): {
  context: string;
  workspaceId: string | undefined;
  composite: number;
  meanBeliefConfidence: number;
  capabilityHealth: number;
  overclaimRisk: number;
  beliefCount: number;
  threshold: number;
} {
  const { snapshot, workspaceId, threshold } = params;
  return {
    context: 'kloel.handoff.confidence.blocking',
    workspaceId,
    composite: snapshot.composite,
    meanBeliefConfidence: snapshot.meanBeliefConfidence,
    capabilityHealth: snapshot.capabilityHealth,
    overclaimRisk: snapshot.overclaimRisk,
    beliefCount: snapshot.beliefCount,
    threshold,
  };
}

/**
 * Normalize an unknown caught from the ABI build branch into a stable
 * message string. Mirrors the inline ladder that previously lived in the
 * service.
 */
export function extractAbiBuildExceptionMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'unknown error';
}

/**
 * Format the initial ABI outcome label, mirroring the inline ternary that
 * decides whether the build was attempted / skipped / disabled. Keeps the
 * single source of truth for the `KLOEL_ABI_PATH` log line readable.
 */
export function initialAbiOutcomeLabel(params: {
  useAbi: boolean;
  hasAbiBuilder: boolean;
}): string {
  if (!params.useAbi) {
    return 'flag_off';
  }
  return params.hasAbiBuilder ? 'attempted' : 'no_abiBuilder';
}
