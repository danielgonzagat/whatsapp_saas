import type { PulseActorEvidence, PulseManifestScenarioSpec, PulseScenarioResult } from '../types';
import { inferActorEvidenceKeyForScenario } from '../scenario-mode-registry';
import { SCENARIO_GROUP_ARTIFACT, WORLD_STATE_ARTIFACT, getArtifactName, unique } from './coverage';

/** Choose the artifact set for a scenario+actor combination. */
export function chooseScenarioArtifact(
  kind: PulseActorEvidence['actorKind'],
  scenario: PulseManifestScenarioSpec,
): string[] {
  return unique([
    getArtifactName(kind),
    WORLD_STATE_ARTIFACT,
    SCENARIO_GROUP_ARTIFACT,
    ...scenario.requiredArtifacts,
  ]);
}

/** Build a PulseScenarioResult by merging defaults with overrides. */
export function buildScenarioResult(
  scenario: PulseManifestScenarioSpec,
  actorArtifact: PulseActorEvidence['actorKind'],
  overrides: Partial<PulseScenarioResult>,
): PulseScenarioResult {
  const defaultMetrics: NonNullable<PulseScenarioResult['metrics']> = {
    executionMode: scenario.executionMode,
    requiresBrowser: scenario.requiresBrowser,
    requiresPersistence: scenario.requiresPersistence,
    asyncExpectations: scenario.asyncExpectations.length,
  };
  return {
    scenarioId: scenario.id,
    actorKind: scenario.actorKind,
    scenarioKind: scenario.scenarioKind,
    critical: scenario.critical,
    requested: false,
    runner: scenario.runner,
    status: 'skipped',
    executed: false,
    providerModeUsed: scenario.providerMode,
    smokeExecuted: false,
    replayExecuted: scenario.providerMode === 'replay' || scenario.providerMode === 'hybrid',
    worldStateConverged: false,
    summary: scenario.notes,
    artifactPaths: chooseScenarioArtifact(actorArtifact, scenario),
    specsExecuted: [],
    durationMs: 0,
    worldStateTouches: scenario.worldStateKeys,
    moduleKeys: scenario.moduleKeys,
    routePatterns: scenario.routePatterns,
    ...overrides,
    metrics: {
      ...defaultMetrics,
      ...(overrides.metrics || {}),
    },
  };
}

/** Determine the actor artifact bucket for a scenario (soak overrides actorKind). */
export function inferActorArtifact(
  scenario: PulseManifestScenarioSpec,
): PulseActorEvidence['actorKind'] {
  return inferActorEvidenceKeyForScenario(scenario) ?? 'soak';
}
