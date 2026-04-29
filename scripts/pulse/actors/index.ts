import { buildSyntheticCoverage } from './coverage';
import { evaluateScenario } from './scenario-evaluator';
import { buildActorEvidence, buildWorldState } from './world-state';
import { loadScenarioEvidenceFromDisk, mergeEvidenceWithDiskFallback } from './disk-evidence';
import {
  getActorEvidenceKeys,
  inferActorEvidenceKeyForScenario,
  normalizeEvidenceKey,
  uniqueValues,
} from '../scenario-mode-registry';
import type {
  PulseSyntheticActorBundle,
  PulseSyntheticRunMode,
  RunSyntheticActorsInput,
} from './types';
import type { PulseActorEvidence, PulseScenarioResult } from '../types';

export type {
  PulseSyntheticActorBundle,
  PulseSyntheticRunMode,
  RunSyntheticActorsInput,
} from './types';

/**
 * Run synthetic actors for a PULSE invocation.
 *
 * The implementation is decomposed across sibling modules to satisfy the
 * 600-line architecture cap on touched files:
 *  - `./coverage` builds synthetic coverage and shared classification helpers.
 *  - `./scenario-evaluator` evaluates each scenario.
 *  - `./scenario-result` constructs scenario result objects.
 *  - `./playwright-runner` executes Playwright-backed scenarios.
 *  - `./world-state` builds actor evidence and the world-state rollup.
 *  - `./disk-evidence` provides the disk-evidence fallback merge.
 *
 * The public contract (`runSyntheticActors`, `PulseSyntheticActorBundle`,
 * `PulseSyntheticRunMode`, `RunSyntheticActorsInput`) is unchanged.
 */
export function runSyntheticActors(input: RunSyntheticActorsInput): PulseSyntheticActorBundle {
  const requestedModes = new Set<PulseSyntheticRunMode>(input.requestedModes || []);
  const allowedScenarioIds = new Set(input.scenarioIds || []);
  const scenarios = input.resolvedManifest.scenarioSpecs.filter(
    (spec) => allowedScenarioIds.size === 0 || allowedScenarioIds.has(spec.id),
  );
  const results = scenarios.map((spec) => evaluateScenario(input, spec, requestedModes));
  const scenarioById = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  const manifestEvidenceKeys = getActorEvidenceKeys(input.resolvedManifest);
  const outputEvidenceKeys = uniqueValues<PulseActorEvidence['actorKind']>([
    ...manifestEvidenceKeys,
    'customer',
    'operator',
    'admin',
    'soak',
  ]);
  const evidenceKeyForResult = (result: PulseScenarioResult): PulseActorEvidence['actorKind'] => {
    const scenario = scenarioById.get(result.scenarioId);
    if (scenario) {
      return inferActorEvidenceKeyForScenario(scenario) ?? 'soak';
    }
    return normalizeEvidenceKey(result.actorKind) ?? 'soak';
  };
  const coverage = buildSyntheticCoverage(
    input.codebaseTruth,
    input.resolvedManifest,
    allowedScenarioIds.size > 0 ? allowedScenarioIds : undefined,
  );

  // Load disk evidence as fallback for scenarios not executed fresh.
  const diskEvidence = loadScenarioEvidenceFromDisk(input.rootDir);

  const scenariosByEvidenceKey = new Map<PulseActorEvidence['actorKind'], typeof scenarios>();
  const resultsByEvidenceKey = new Map<PulseActorEvidence['actorKind'], typeof results>();
  for (const key of outputEvidenceKeys) {
    scenariosByEvidenceKey.set(
      key,
      scenarios.filter((scenario) => inferActorEvidenceKeyForScenario(scenario) === key),
    );
    resultsByEvidenceKey.set(
      key,
      results.filter((result) => evidenceKeyForResult(result) === key),
    );
  }

  const mergedByEvidenceKey = new Map<PulseActorEvidence['actorKind'], PulseScenarioResult[]>();
  for (const key of outputEvidenceKeys) {
    mergedByEvidenceKey.set(
      key,
      mergeEvidenceWithDiskFallback(resultsByEvidenceKey.get(key) || [], diskEvidence, key),
    );
  }

  // Phase 5 hardening: when disk evidence was loaded with observed-from-disk,
  // ensure the final merged results carry that truthMode through to gate evaluation.
  // If any actor has no observed evidence but disk had it, promote the first critical
  // scenario to observed-from-disk with staging metadata.
  for (const [label, actorResults] of mergedByEvidenceKey) {
    if (label === 'soak') {
      continue;
    }
    const hasObserved = actorResults.some(
      (r) =>
        r.critical &&
        r.status === 'passed' &&
        (r.truthMode === 'observed' || r.truthMode === 'observed-from-disk'),
    );
    if (!hasObserved && diskEvidence.results.length > 0) {
      const diskObserved = diskEvidence.results.filter(
        (r) =>
          evidenceKeyForResult(r) === label && r.truthMode === 'observed-from-disk' && r.critical,
      );
      if (diskObserved.length > 0) {
        // Inject disk-observed evidence into results for scenarios that lack it
        for (const disk of diskObserved) {
          const idx = actorResults.findIndex((r) => r.scenarioId === disk.scenarioId);
          if (idx >= 0 && !actorResults[idx].truthMode) {
            actorResults[idx] = { ...actorResults[idx], ...disk, truthMode: 'observed-from-disk' };
          }
        }
      }
    }
  }

  return {
    customer: buildActorEvidence(
      'customer',
      scenariosByEvidenceKey.get('customer') || [],
      mergedByEvidenceKey.get('customer') || [],
    ),
    operator: buildActorEvidence(
      'operator',
      scenariosByEvidenceKey.get('operator') || [],
      mergedByEvidenceKey.get('operator') || [],
    ),
    admin: buildActorEvidence(
      'admin',
      scenariosByEvidenceKey.get('admin') || [],
      mergedByEvidenceKey.get('admin') || [],
    ),
    soak: buildActorEvidence(
      'soak',
      scenariosByEvidenceKey.get('soak') || [],
      mergedByEvidenceKey.get('soak') || [],
    ),
    syntheticCoverage: coverage,
    worldState: buildWorldState(input, results),
  };
}
