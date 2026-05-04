import type {
  PulseActorEvidence,
  PulseActorKind,
  PulseManifestScenarioSpec,
  PulseScenarioResult,
  PulseWorldState,
} from '../types';
import {
  actorKindForWorldStateSession,
  getActorEvidenceKeys,
  inferActorEvidenceKeyForScenario,
  normalizeEvidenceKey,
  uniqueValues,
} from '../scenario-mode-registry';
import { COVERAGE_ARTIFACT, WORLD_STATE_ARTIFACT, getArtifactName, unique } from './coverage';
import type { RunSyntheticActorsInput } from './types';

/** Build PulseActorEvidence for one actorKind from full scenario+result lists. */
export function buildActorEvidence(
  actorKind: PulseActorEvidence['actorKind'],
  scenarios: PulseManifestScenarioSpec[],
  results: PulseScenarioResult[],
): PulseActorEvidence {
  const relevantResults = results.filter((result) => {
    if (actorKind === 'soak') {
      return scenarios.some((scenario) => scenario.id === result.scenarioId);
    }
    return result.actorKind === actorKind;
  });
  const declared = scenarios.map((scenario) => scenario.id);
  const executed = relevantResults
    .filter((result) => result.executed)
    .map((result) => result.scenarioId);
  const missing = relevantResults
    .filter((result) => result.status === 'missing_evidence')
    .map((result) => result.scenarioId);
  const passed = relevantResults
    .filter((result) => result.status === 'passed')
    .map((result) => result.scenarioId);
  const failed = relevantResults
    .filter((result) => result.status === 'failed' || result.status === 'checker_gap')
    .map((result) => result.scenarioId);
  const summary =
    declared.length === 0
      ? `No ${actorKind} scenarios are declared.`
      : `${actorKind} scenarios: ${passed.length} passed, ${failed.length} failed/checker-gap, ${missing.length} missing evidence.`;
  return {
    actorKind,
    declared,
    executed,
    missing,
    passed,
    failed,
    artifactPaths:
      declared.length > 0
        ? [getArtifactName(actorKind), WORLD_STATE_ARTIFACT, COVERAGE_ARTIFACT]
        : [],
    summary,
    results: relevantResults,
  };
}

/** Build the PulseWorldState rollup for the run. */
export function buildWorldState(
  input: RunSyntheticActorsInput,
  results: PulseScenarioResult[],
): PulseWorldState {
  const allowedScenarioIds = new Set(input.scenarioIds || []);
  const scopedScenarioSpecs = input.resolvedManifest.scenarioSpecs.filter(
    (spec) => allowedScenarioIds.size === 0 || allowedScenarioIds.has(spec.id),
  );
  const actorProfiles = input.resolvedManifest.actorProfiles.map((profile) => profile.id);
  const scenarioById = new Map(scopedScenarioSpecs.map((scenario) => [scenario.id, scenario]));
  const evidenceKeys = uniqueValues(
    [
      ...getActorEvidenceKeys(input.resolvedManifest),
      ...results.flatMap((result) => {
        const scenario = scenarioById.get(result.scenarioId);
        return [
          scenario
            ? inferActorEvidenceKeyForScenario(scenario)
            : normalizeEvidenceKey(result.actorKind),
        ];
      }),
    ].filter((key): key is PulseActorEvidence['actorKind'] => Boolean(key)),
  );
  const pendingAsyncExpectations = unique(
    scopedScenarioSpecs
      .filter((spec) => spec.asyncExpectations.length > 0)
      .filter((spec) => {
        const result = results.find((item) => item.scenarioId === spec.id);
        return !result || result.status !== 'passed';
      })
      .flatMap((spec) => spec.asyncExpectations.map((expectation) => `${spec.id}:${expectation}`)),
  ).sort();
  const sessions: PulseWorldState['sessions'] = evidenceKeys.map((evidenceKey) => {
    const declaredScenarios = scopedScenarioSpecs.filter(
      (spec) => inferActorEvidenceKeyForScenario(spec) === evidenceKey,
    ).length;
    const executedScenarios = results.filter((result) => {
      const scenario = scenarioById.get(result.scenarioId);
      const resultEvidenceKey = scenario
        ? inferActorEvidenceKeyForScenario(scenario)
        : normalizeEvidenceKey(result.actorKind);
      return resultEvidenceKey === evidenceKey && result.executed;
    }).length;
    const passedScenarios = results.filter((result) => {
      const scenario = scenarioById.get(result.scenarioId);
      const resultEvidenceKey = scenario
        ? inferActorEvidenceKeyForScenario(scenario)
        : normalizeEvidenceKey(result.actorKind);
      return resultEvidenceKey === evidenceKey && result.status === 'passed';
    }).length;
    return {
      kind: actorKindForWorldStateSession(evidenceKey) as PulseActorKind,
      declaredScenarios,
      executedScenarios,
      passedScenarios,
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    backendUrl: input.runtimeEvidence.backendUrl,
    frontendUrl: input.runtimeEvidence.frontendUrl,
    actorProfiles,
    executedScenarios: results
      .filter((result) => result.executed)
      .map((result) => result.scenarioId)
      .sort(),
    pendingAsyncExpectations,
    entities: Object.fromEntries(
      results
        .filter((result) => result.worldStateTouches.length > 0)
        .map((result) => [result.scenarioId, result.worldStateTouches]),
    ),
    asyncExpectationsStatus: scopedScenarioSpecs.flatMap((spec) =>
      spec.asyncExpectations.map((expectation) => {
        const result = results.find((item) => item.scenarioId === spec.id);
        const status = !result
          ? ('not_executed' as const)
          : result.status === 'passed'
            ? ('satisfied' as const)
            : result.status === 'failed'
              ? /timed out/i.test(result.summary)
                ? ('timed_out' as const)
                : ('failed' as const)
              : result.status === 'missing_evidence'
                ? /timed out/i.test(result.summary)
                  ? ('timed_out' as const)
                  : ('missing_evidence' as const)
                : result.status === 'checker_gap'
                  ? ('missing_evidence' as const)
                  : ('not_executed' as const);
        return {
          scenarioId: spec.id,
          expectation,
          status,
        };
      }),
    ),
    artifactsByScenario: Object.fromEntries(
      results.map((result) => [result.scenarioId, result.artifactPaths]),
    ),
    sessions,
  };
}
