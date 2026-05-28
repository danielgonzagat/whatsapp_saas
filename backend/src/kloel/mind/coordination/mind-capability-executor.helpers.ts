/**
 * Pure helpers extracted from `mind-capability-executor.service.ts` so the
 * service stays focused on Prisma/event orchestration. Anything that touches
 * Prisma, the event spine, or NestJS DI stays in the service; only
 * side-effect-free parsing/derivation lives here.
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
  const pulseVerdict = walkPath(root, ['pulseTruth', 'certificationVerdict']);
  if (typeof pulseVerdict === 'string' && pulseVerdict !== 'PASS') {
    gaps.push(`pulse_${pulseVerdict.toLowerCase()}`);
  }
  return gaps;
}
