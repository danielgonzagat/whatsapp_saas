import { buildSyntheticCoverage } from './coverage';
import { evaluateScenario } from './scenario-evaluator';
import { buildActorEvidence, buildWorldState } from './world-state';
import { loadScenarioEvidenceFromDisk, mergeEvidenceWithDiskFallback } from './disk-evidence';
import type {
  PulseSyntheticActorBundle,
  PulseSyntheticRunMode,
  RunSyntheticActorsInput,
} from './types';

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
  const coverage = buildSyntheticCoverage(
    input.codebaseTruth,
    input.resolvedManifest,
    allowedScenarioIds.size > 0 ? allowedScenarioIds : undefined,
  );

  // Load disk evidence as fallback for scenarios not executed fresh.
  const diskEvidence = loadScenarioEvidenceFromDisk(input.rootDir);

  const customerScenarios = scenarios.filter((spec) => spec.actorKind === 'customer');
  const operatorScenarios = scenarios.filter((spec) => spec.actorKind === 'operator');
  const adminScenarios = scenarios.filter((spec) => spec.actorKind === 'admin');
  const soakScenarios = scenarios.filter((spec) => spec.timeWindowModes.includes('soak'));

  const customerResults = results.filter((r) => r.actorKind === 'customer');
  const operatorResults = results.filter((r) => r.actorKind === 'operator');
  const adminResults = results.filter((r) => r.actorKind === 'admin');
  const soakResults = results.filter(
    (r) =>
      // Soak scenarios may surface either as actorKind=soak or via the
      // soak time-window. Both are routed into the same bucket.
      r.actorKind === ('soak' as typeof r.actorKind) ||
      Boolean((r as { timeWindowModes?: string[] }).timeWindowModes?.includes('soak')),
  );

  const mergedCustomer = mergeEvidenceWithDiskFallback(customerResults, diskEvidence, 'customer');
  const mergedOperator = mergeEvidenceWithDiskFallback(operatorResults, diskEvidence, 'operator');
  const mergedAdmin = mergeEvidenceWithDiskFallback(adminResults, diskEvidence, 'admin');
  const mergedSoak = mergeEvidenceWithDiskFallback(soakResults, diskEvidence, 'soak');

  return {
    customer: buildActorEvidence('customer', customerScenarios, mergedCustomer),
    operator: buildActorEvidence('operator', operatorScenarios, mergedOperator),
    admin: buildActorEvidence('admin', adminScenarios, mergedAdmin),
    soak: buildActorEvidence('soak', soakScenarios, mergedSoak),
    syntheticCoverage: coverage,
    worldState: buildWorldState(input, results),
  };
}
