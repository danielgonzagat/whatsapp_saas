/**
 * PULSE Run Identity System
 *
 * Every PULSE execution run is assigned a canonical run identity.
 * All artifacts generated within the same run MUST carry identical
 * runId and generatedAt values. Artifacts reused from a previous run
 * MUST be explicitly marked with preservedFromPreviousRun: true.
 */

import { execSync } from 'child_process';

/** Canonical run identity attached to every PULSE artifact. */
export interface PulseRunIdentity {
  /** UUID v4 unique to this PULSE execution. */
  runId: string;
  /** ISO-8601 timestamp at which this run started. */
  generatedAt: string;
  /** HEAD commit SHA at the start of this run, or null if unavailable. */
  commitSha: string | null;
  /** Execution mode of this PULSE run. */
  mode: PulseRunMode;
  /** Certification profile used, or null if default. */
  profile: string | null;
}

/** PULSE execution modes. */
export type PulseRunMode = 'scan' | 'deep' | 'total' | 'autonomous';

/** Fields added to an artifact that is reused from a previous run. */
export interface PulsePreservedIdentity {
  /** Always true for reused artifacts. */
  preservedFromPreviousRun: true;
  /** The runId from the original run that produced this artifact. */
  originalRunId: string;
  /** The generatedAt from the original run that produced this artifact. */
  originalGeneratedAt: string;
  /** Human-readable explanation of why this artifact was reused. */
  reuseReason: string;
}

/** Identity keys injected into every PULSE artifact. */
const IDENTITY_KEYS = ['runId', 'generatedAt'] as const;

/** Preserved-identity keys for reused artifacts. */
const PRESERVED_KEYS: ReadonlyArray<keyof PulsePreservedIdentity> = [
  'preservedFromPreviousRun',
  'originalRunId',
  'originalGeneratedAt',
  'reuseReason',
];

/**
 * Create a canonical run identity for a PULSE execution.
 *
 * Uses crypto.randomUUID() for a Version 4 UUID and Date.now()
 * for the ISO-8601 generatedAt timestamp, so they remain stable
 * for the entire process lifetime.
 */
export function createRunIdentity(mode: PulseRunMode, profile?: string | null): PulseRunIdentity {
  return {
    runId: crypto.randomUUID(),
    generatedAt: new Date().toISOString(),
    commitSha: getCommitSha(),
    mode,
    profile: profile ?? null,
  };
}

/**
 * Resolve the HEAD commit SHA from the current git repository.
 * Returns null when git is unavailable or the command fails.
 */
export function getCommitSha(): string | null {
  try {
    const sha = execSync('git rev-parse HEAD', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    }).trim();
    return sha || null;
  } catch {
    return null;
  }
}

/**
 * Inject the run identity into a JSON artifact string.
 *
 * - If the artifact already carries the same runId and generatedAt,
 *   it is returned unchanged (idempotent).
 * - If the artifact carries preservedFromPreviousRun markers,
 *   those are preserved — the artifact is NOT overwritten.
 * - Otherwise, the identity fields are injected at the top level.
 *
 * @param jsonContent  Valid JSON string representing the artifact.
 * @param identity     The canonical run identity for this execution.
 * @returns            A new JSON string with identity fields injected.
 */
export function injectRunIdentity(jsonContent: string, identity: PulseRunIdentity): string {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonContent);
  } catch {
    // Not valid JSON — return as-is (e.g. markdown reports).
    return jsonContent;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return jsonContent;
  }

  // If this artifact is already marked as preserved, leave it untouched.
  if (parsed['preservedFromPreviousRun'] === true) {
    return jsonContent;
  }

  // If identity already matches, do nothing (idempotent).
  if (parsed['runId'] === identity.runId && parsed['generatedAt'] === identity.generatedAt) {
    return jsonContent;
  }

  // Inject identity fields.
  parsed['runId'] = identity.runId;
  parsed['generatedAt'] = identity.generatedAt;

  return JSON.stringify(parsed, null, 2);
}

/**
 * Wrap an existing artifact as reused from a previous run.
 *
 * The original runId and generatedAt are extracted from the artifact's
 * current identity fields (if present) and the new identity is injected
 * as the wrapping layer. The artifact's actual content is preserved.
 *
 * @param jsonContent  Valid JSON string of the reused artifact.
 * @param reuseReason  Human-readable reason for the reuse.
 * @returns            A new JSON string with preserved-identity markers.
 */
export function markAsPreserved(jsonContent: string, reuseReason: string): string {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonContent);
  } catch {
    return jsonContent;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return jsonContent;
  }

  const originalRunId =
    typeof parsed['runId'] === 'string' ? (parsed['runId'] as string) : 'unknown';
  const originalGeneratedAt =
    typeof parsed['generatedAt'] === 'string'
      ? (parsed['generatedAt'] as string)
      : new Date().toISOString();

  parsed['preservedFromPreviousRun'] = true;
  parsed['originalRunId'] = originalRunId;
  parsed['originalGeneratedAt'] = originalGeneratedAt;
  parsed['reuseReason'] = reuseReason;

  return JSON.stringify(parsed, null, 2);
}

/**
 * Extract the runId from a parsed artifact object.
 * Returns null when the field is missing or not a string.
 */
export function extractRunId(data: Record<string, unknown>): string | null {
  const value = data['runId'];
  return typeof value === 'string' ? value : null;
}

/**
 * Extract the generatedAt from a parsed artifact object.
 * Returns null when the field is missing or not a string.
 */
export function extractGeneratedAt(data: Record<string, unknown>): string | null {
  const value = data['generatedAt'];
  return typeof value === 'string' ? value : null;
}

/**
 * Check whether an artifact has been explicitly marked as preserved
 * (reused from a previous run).
 */
export function isPreservedArtifact(
  data: Record<string, unknown>,
): data is Record<string, unknown> & PulsePreservedIdentity {
  return data['preservedFromPreviousRun'] === true;
}

/**
 * Verify that two parsed artifacts share the same runId.
 *
 * If either artifact is explicitly marked as preserved, it is
 * excluded from the comparison (its runId is expected to differ).
 *
 * @returns  true if the runIds match or at least one is preserved.
 */
export function verifyRunIdConsistency(
  dataA: Record<string, unknown>,
  dataB: Record<string, unknown>,
): { consistent: boolean; runIdA: string | null; runIdB: string | null } {
  const runIdA = extractRunId(dataA);
  const runIdB = extractRunId(dataB);
  const preservedA = isPreservedArtifact(dataA);
  const preservedB = isPreservedArtifact(dataB);

  // If either artifact is preserved, runIds are allowed to differ.
  if (preservedA || preservedB) {
    return { consistent: true, runIdA, runIdB };
  }

  // Both must have runIds and they must match.
  if (runIdA === null || runIdB === null) {
    return { consistent: false, runIdA, runIdB };
  }

  return { consistent: runIdA === runIdB, runIdA, runIdB };
}
