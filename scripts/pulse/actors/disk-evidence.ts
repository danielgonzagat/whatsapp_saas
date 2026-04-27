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
      const result = loader.loadScenarioEvidenceFromDisk(rootDir);
      if (result.results.length > 0) {
        process.stderr.write(
          `[disk-evidence] Loaded ${result.results.length} results from disk (${new Date().toISOString()})\n`,
        );
      }
      return result;
    }
  } catch (err: unknown) {
    process.stderr.write(
      `[disk-evidence] Loader failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
  return { results: [] };
}

/**
 * Determine whether disk evidence qualifies as trustworthy.
 *
 * Anti-fraud: disk evidence must satisfy ALL of:
 *  1. truthMode === 'observed-from-disk' (set by loader after checks)
 *  2. executed === true
 *  3. Complete execution metadata: command, exitCode===0, startedAt,
 *     finishedAt, environmentUrl, and non-empty artifactPaths
 *
 * Evidence failing any check is rejected — it cannot replace fresh results.
 */
function isTrustworthyDiskEvidence(result: PulseScenarioResult): boolean {
  if (result.truthMode !== 'observed-from-disk' || !result.executed) return false;
  if (!result.command) return false;
  if (result.exitCode !== 0) return false;
  if (!result.startedAt || !result.finishedAt) return false;
  if (!result.environmentUrl) return false;
  if (!result.artifactPaths || result.artifactPaths.length === 0) return false;
  return true;
}

/**
 * Merge fresh scenario results with disk-backed evidence.
 *
 * Fresh results win for any scenarioId already present. Disk evidence is only
 * used as fallback when ALL of these hold:
 *  1. The disk result passed the loader's freshness + metadata checks
 *     (truthMode === 'observed-from-disk').
 *  2. The fresh result for the same scenarioId is weaker (missing_evidence,
 *     truthMode=inferred, or lacks truthMode).
 *
 * Disk evidence without observed-from-disk status is never used to replace
 * fresh results, preventing Hermes-style fake evidence inflation.
 */
export function mergeEvidenceWithDiskFallback(
  freshResults: PulseScenarioResult[],
  diskEvidence: DiskScenarioEvidence,
  actorKind: PulseScenarioResult['actorKind'] | 'soak',
): PulseScenarioResult[] {
  const freshById = new Map(freshResults.map((result) => [result.scenarioId, result]));
  const diskById = new Map<string, PulseScenarioResult>();

  // Index disk results by scenarioId, filtered by actorKind AND trustworthiness
  for (const result of diskEvidence.results) {
    if (!isTrustworthyDiskEvidence(result)) continue;
    if (actorKind === 'soak') {
      if (!(result as { timeWindowModes?: string[] }).timeWindowModes?.includes('soak')) continue;
    } else if (result.actorKind !== actorKind) {
      continue;
    }
    diskById.set(result.scenarioId, result);
  }

  const merged: PulseScenarioResult[] = [];
  let diskUsedCount = 0;

  for (const [scenarioId, fresh] of Array.from(freshById)) {
    const disk = diskById.get(scenarioId);
    if (disk && disk.executed && isTrustworthyDiskEvidence(disk)) {
      const freshIsWeak = fresh.status === 'missing_evidence';
      const freshHasInferred = fresh.truthMode === 'inferred';
      const freshLacksTruthMode = fresh.status === 'passed' && !fresh.truthMode;
      if (freshIsWeak || freshHasInferred || freshLacksTruthMode) {
        merged.push(disk);
        diskUsedCount++;
        diskById.delete(scenarioId);
        continue;
      }
    }
    merged.push(fresh);
    diskById.delete(scenarioId);
  }

  if (diskUsedCount > 0) {
    process.stderr.write(
      `[disk-evidence] Merge: used ${diskUsedCount} disk results for actorKind=${actorKind} (freshCount=${freshResults.length}, diskCount=${diskEvidence.results.length})\n`,
    );
  }

  // Append any remaining trustworthy disk results not covered by fresh
  for (const result of Array.from(diskById.values())) {
    merged.push(result);
  }

  return merged;
}
