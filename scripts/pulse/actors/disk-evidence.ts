import { createRequire } from 'node:module';
import type { PulseScenarioResult } from '../types';

const localRequire = createRequire(__filename);

/**
 * Disk-backed evidence shape consumed by the actors index.
 *
 * The full implementation lives behind a separate scenario-evidence loader
 * that is exercised by `__tests__/scenario-evidence-loader.spec.ts`. When the
 * loader is not present (current state of the repository), this module acts
 * as a no-op so the synthetic-actors pipeline still returns its computed
 * results unchanged.
 */
export interface DiskScenarioEvidence {
  /** Scenario results loaded from on-disk artifacts (if any). */
  results: PulseScenarioResult[];
}

/**
 * Load scenario evidence from previous PULSE artifact files on disk.
 *
 * This is the entry point that downstream code expects. When the loader
 * module is unavailable, an empty bundle is returned so callers can still
 * proceed without altering the live results.
 */
export function loadScenarioEvidenceFromDisk(rootDir: string): DiskScenarioEvidence {
  // The dedicated loader (scenario-evidence-loader.ts) is consumed via
  // dynamic require so this file remains usable even if the loader is
  // not present in the working tree. See test
  // `scripts/pulse/__tests__/scenario-evidence-loader.spec.ts`.
  try {
    const loader = localRequire('../scenario-evidence-loader') as {
      loadScenarioEvidenceFromDisk?: (rootDir: string) => DiskScenarioEvidence;
    };
    if (typeof loader.loadScenarioEvidenceFromDisk === 'function') {
      return loader.loadScenarioEvidenceFromDisk(rootDir);
    }
  } catch {
    // Loader module is not available; fall through to the no-op default.
  }
  return { results: [] };
}

/**
 * Merge fresh scenario results with disk-backed evidence.
 *
 * Fresh results win for any scenarioId already present. When a scenarioId
 * exists only on disk and matches the requested actor kind, it is appended
 * so that historical evidence is not lost between runs.
 */
export function mergeEvidenceWithDiskFallback(
  freshResults: PulseScenarioResult[],
  diskEvidence: DiskScenarioEvidence,
  actorKind: PulseScenarioResult['actorKind'] | 'soak',
): PulseScenarioResult[] {
  const seen = new Set(freshResults.map((result) => result.scenarioId));
  const fallback = diskEvidence.results.filter((result) => {
    if (seen.has(result.scenarioId)) {
      return false;
    }
    if (actorKind === 'soak') {
      return Boolean((result as { timeWindowModes?: string[] }).timeWindowModes?.includes('soak'));
    }
    return result.actorKind === actorKind;
  });
  return [...freshResults, ...fallback];
}
