/**
 * Cognitive-state introspection helpers extracted from
 * `mind-capability-executor.service.ts`. Pure projections / readers that walk
 * the REAL cognitive-state ABI and dissolution surfaces to derive the gap and
 * work-queue lists surfaced by `inspect_self`.
 */

/**
 * Coerce an arbitrary value into a positive integer, falling back to the
 * provided default. Non-finite numbers, zero, and negative values all
 * resolve to the fallback. The result is floored to ensure an integer.
 */
export function readOptionalNum(value: unknown, fb: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fb;
}

/**
 * Coerce an arbitrary value into a trimmed string, falling back to the
 * provided default. Non-string values or strings that are empty after
 * trimming resolve to the fallback (default empty string).
 */
export function readOptionalStr(value: unknown, fb = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fb;
}

const ARRAY_GAP_CHECKS: ReadonlyArray<readonly [readonly string[], string]> = [
  [['capabilities'], 'no_capabilities_declared'],
  [['capabilities', 'available'], 'no_capabilities_available'],
  [['beliefs'], 'no_beliefs_formed'],
  [['memory', 'workingMemory'], 'working_memory_empty'],
  [['memory', 'episodicRefs'], 'no_episodic_memory'],
  [['memory', 'consolidatedRefs'], 'no_consolidated_memory'],
  [['predictions', 'active'], 'no_active_predictions'],
  [['perception', 'recentSalientEvents'], 'perception_loop_silent'],
];

function walkPath(root: Record<string, unknown>, path: readonly string[]): unknown {
  return path.reduce<unknown>(
    (acc, key) =>
      acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined,
    root,
  );
}

function isEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length === 0;
}

/**
 * Derive an HONEST gap list from the REAL cognitive-state ABI object.
 * Nothing here is hardcoded: it walks the actual returned structure and
 * reports which cognitive loops are still empty/unclosed. Missing paths
 * are simply skipped (no invented field names). This is the data the
 * self-introspection organ surfaces so Kloel can tell, through the chat,
 * what is genuinely not working in itself.
 */
export function computeCognitiveGaps(abi: unknown): string[] {
  if (!abi || typeof abi !== 'object') {
    return ['cognitive_state_unavailable'];
  }
  const root = abi as Record<string, unknown>;
  const gaps: string[] = [];

  for (const [path, label] of ARRAY_GAP_CHECKS) {
    if (isEmptyArray(walkPath(root, path))) {
      gaps.push(label);
    }
  }

  const lineageStatus = walkPath(root, ['lineage', 'status']);
  if (typeof lineageStatus === 'string' && lineageStatus !== 'intact') {
    gaps.push(`lineage_${lineageStatus}`);
  }
  const readinessVerdict = walkPath(root, ['readinessTruth', 'certificationVerdict']);
  if (typeof readinessVerdict === 'string' && readinessVerdict !== 'PASS') {
    gaps.push(`readiness_${readinessVerdict.toLowerCase()}`);
  }
  return gaps;
}

/**
 * Identity audience union accepted by the introspection ABI. Mirrors
 * `IdentityProjectorService.IdentityAudience` so the helpers stay decoupled
 * from the projector module. Keep in sync if that contract changes.
 */
export type IdentityAudienceLike = 'public' | 'technical' | 'origin' | 'internal';

const IDENTITY_AUDIENCES: readonly IdentityAudienceLike[] = [
  'public',
  'technical',
  'origin',
  'internal',
];

/**
 * Coerce an arbitrary value into one of the known identity audiences.
 * Anything that is not a recognised audience resolves to `'internal'` —
 * the safest default for self-introspection.
 */
export function normalizeIdentityAudience(value: unknown): IdentityAudienceLike {
  return IDENTITY_AUDIENCES.includes(value as IdentityAudienceLike)
    ? (value as IdentityAudienceLike)
    : 'internal';
}

/**
 * Minimal shape of a dissolution gap consumed by the work-queue builder.
 * Kept structural so callers don't need to import the substrate types.
 */
export interface DissolutionGapLike {
  readonly surface: string;
  readonly status: 'dissolved' | 'partial' | 'silent';
}

/**
 * Combine cognitive `gaps` with dissolution surface statuses into the
 * `workQueue` surfaced by `inspect_self`. Silent surfaces become
 * `dissolve_surface:<surface>` entries; partial surfaces become
 * `emit_canonical_events:<surface>` entries; dissolved surfaces are
 * skipped. The relative order is preserved: gaps first, then silent
 * surfaces, then partial surfaces.
 */
export function buildInspectSelfWorkQueue(
  gaps: readonly string[],
  dissolution: readonly DissolutionGapLike[],
): string[] {
  return [
    ...gaps,
    ...dissolution.filter((d) => d.status === 'silent').map((d) => `dissolve_surface:${d.surface}`),
    ...dissolution
      .filter((d) => d.status === 'partial')
      .map((d) => `emit_canonical_events:${d.surface}`),
  ];
}

/**
 * Surfaces that have NOT yet reached the `dissolved` status. Mirrors the
 * derivation used to decide the `emergent` flag in `inspect_self`.
 */
export function selectSilentSurfaces(dissolution: readonly DissolutionGapLike[]): string[] {
  return dissolution.filter((d) => d.status !== 'dissolved').map((d) => d.surface);
}
