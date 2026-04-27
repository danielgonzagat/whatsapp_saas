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
  const freshById = new Map(freshResults.map((result) => [result.scenarioId, result]));
  const diskById = new Map<string, PulseScenarioResult>();

  // Index disk results by scenarioId, filtered by actorKind
  for (const result of diskEvidence.results) {
    if (actorKind === 'soak') {
      if (!(result as { timeWindowModes?: string[] }).timeWindowModes?.includes('soak')) continue;
    } else if (result.actorKind !== actorKind) {
      continue;
    }
    diskById.set(result.scenarioId, result);
  }

  const merged: PulseScenarioResult[] = [];

  // Process fresh results: prefer disk evidence when fresh shows missing_evidence
  // OR when fresh has no truthMode but disk has real observed evidence
  for (const [scenarioId, fresh] of Array.from(freshById)) {
    const disk = diskById.get(scenarioId);
    if (disk && disk.executed) {
      const freshIsWeak = fresh.status === 'missing_evidence';
      const freshLacksTruthMode = fresh.status === 'passed' && !fresh.truthMode && disk.truthMode;
      if (freshIsWeak || freshLacksTruthMode) {
        // Disk has real evidence, fresh has none or incomplete — use disk
        merged.push(disk);
        diskById.delete(scenarioId);
        continue;
      }
    }
    merged.push(fresh);
    diskById.delete(scenarioId);
  }

  // Append any remaining disk results not covered by fresh
  for (const result of Array.from(diskById.values())) {
    merged.push(result);
  }

  return merged;
}
