/**
 * Actor, synthetic coverage, and world state evidence builders.
 * Companion to cert-evidence-defaults.ts.
 */
import type {
  PulseActorEvidence,
  PulseCodebaseTruth,
  PulseEnvironment,
  PulseExecutionEvidence,
  PulseResolvedManifest,
  PulseSyntheticCoverageEvidence,
  PulseWorldState,
} from './types';
import { unique, routeMatches } from './cert-helpers';

export function buildDefaultActorEvidence(
  actorKind: PulseActorEvidence['actorKind'],
  resolvedManifest: PulseResolvedManifest,
): PulseActorEvidence {
  const scenarios =
    actorKind === 'soak'
      ? resolvedManifest.scenarioSpecs.filter((spec) => spec.timeWindowModes.includes('soak'))
      : resolvedManifest.scenarioSpecs.filter((spec) => spec.actorKind === actorKind);
  const declared = scenarios.map((spec) => spec.id);
  const artifactPaths =
    declared.length > 0
      ? [
          `PULSE_${actorKind.toUpperCase()}_EVIDENCE.json`,
          'PULSE_WORLD_STATE.json',
          'PULSE_SCENARIO_COVERAGE.json',
        ]
      : [];
  return {
    actorKind,
    declared,
    executed: [],
    missing: declared,
    passed: [],
    failed: [],
    artifactPaths,
    summary:
      declared.length > 0
        ? `No ${actorKind} actor evidence is attached for ${declared.length} declared scenario(s).`
        : `No ${actorKind} scenarios are declared in the resolved manifest.`,
    results: scenarios.map((spec) => ({
      scenarioId: spec.id,
      actorKind: spec.actorKind,
      scenarioKind: spec.scenarioKind,
      critical: spec.critical,
      requested: false,
      runner: spec.runner,
      status: 'missing_evidence',
      executed: false,
      failureClass: 'missing_evidence',
      summary: `No actor evidence is attached for scenario ${spec.id}.`,
      artifactPaths,
      specsExecuted: [],
      durationMs: 0,
      worldStateTouches: spec.worldStateKeys,
      moduleKeys: [],
      routePatterns: [],
    })),
  };
}

export function buildDefaultSyntheticCoverage(
  codebaseTruth: PulseCodebaseTruth,
  resolvedManifest: PulseResolvedManifest,
): PulseSyntheticCoverageEvidence {
  const results = codebaseTruth.pages.map((page) => {
    const matchingScenarios = resolvedManifest.scenarioSpecs.filter(
      (spec) =>
        spec.moduleKeys.includes(page.moduleKey) ||
        spec.routePatterns.some((pattern) => routeMatches(page.route, pattern)),
    );
    const covered = matchingScenarios.length > 0;
    return {
      route: page.route,
      group: page.group,
      moduleKey: page.moduleKey,
      moduleName: page.moduleName,
      classification: 'certified_interaction' as const,
      covered,
      actorKinds: unique(matchingScenarios.map((spec) => spec.actorKind)).sort(),
      scenarioIds: matchingScenarios.map((spec) => spec.id).sort(),
      totalInteractions: page.totalInteractions,
      persistedInteractions: page.persistedInteractions,
    };
  });
  const uncoveredPages = results
    .filter((entry) => !entry.covered)
    .map((entry) => entry.route)
    .sort();
  return {
    executed: true,
    artifactPaths: ['PULSE_SCENARIO_COVERAGE.json'],
    summary:
      uncoveredPages.length === 0
        ? `Synthetic coverage maps all ${results.length} discovered page(s) to declared scenarios.`
        : `Synthetic coverage is missing for ${uncoveredPages.length} discovered page(s).`,
    totalPages: results.length,
    userFacingPages: codebaseTruth.summary.userFacingPages,
    coveredPages: results.filter((entry) => entry.covered).length,
    uncoveredPages,
    results,
  };
}

export function buildDefaultWorldState(
  resolvedManifest: PulseResolvedManifest,
  evidence: {
    runtime: PulseExecutionEvidence['runtime'];
    customer: PulseActorEvidence;
    operator: PulseActorEvidence;
    admin: PulseActorEvidence;
    soak: PulseActorEvidence;
  },
): PulseWorldState {
  return {
    generatedAt: new Date().toISOString(),
    backendUrl: evidence.runtime.backendUrl,
    frontendUrl: evidence.runtime.frontendUrl,
    actorProfiles: resolvedManifest.actorProfiles.map((profile) => profile.id),
    executedScenarios: [],
    pendingAsyncExpectations: resolvedManifest.scenarioSpecs
      .filter((spec) => spec.asyncExpectations.length > 0)
      .flatMap((spec) => spec.asyncExpectations.map((expectation) => `${spec.id}:${expectation}`)),
    entities: {},
    asyncExpectationsStatus: resolvedManifest.scenarioSpecs.flatMap((spec) =>
      spec.asyncExpectations.map((expectation) => ({
        scenarioId: spec.id,
        expectation,
        status: 'pending' as const,
      })),
    ),
    artifactsByScenario: {},
    sessions: ['customer', 'operator', 'admin', 'system'].map((kind) => {
      const declaredScenarios = resolvedManifest.scenarioSpecs.filter(
        (spec) => spec.actorKind === kind,
      ).length;
      return {
        kind: kind as PulseWorldState['sessions'][number]['kind'],
        declaredScenarios,
        executedScenarios: 0,
        passedScenarios: 0,
      };
    }),
  };
}
