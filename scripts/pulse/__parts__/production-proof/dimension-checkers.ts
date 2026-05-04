import * as path from 'path';
import { safeJoin } from '../../lib/safe-path';
import { pathExists } from '../../safe-fs';
import { isRuntimeProbeProofEligible } from '../../runtime-probes';
import type { ProofStatus } from '../../types.production-proof';
import {
  safeReadJson,
  loadRuntimeProbesArtifact,
  proofStatusForProbeSet,
  SCENARIO_EVIDENCE_FILENAME,
  OBSERVABILITY_FILENAME,
  SENTRY_ADAPTER_FILENAME,
  RUNTIME_PROBES_FILENAME,
} from './path-resolution';
import { isRollbackPossible } from './rollback';

export function checkDeployStatus(_capabilityId: string, rootDir: string): ProofStatus {
  const runtimeProbes = loadRuntimeProbesArtifact(rootDir);
  if (!runtimeProbes) {
    return 'unproven';
  }
  if (runtimeProbes.status === 'failed') {
    return 'failed';
  }
  if (runtimeProbes.status === 'stale') {
    return 'stale';
  }
  if (runtimeProbes.probes.some(isRuntimeProbeProofEligible)) {
    return 'proven';
  }

  return 'unproven';
}

export function checkHealthCheck(_capabilityId: string, rootDir: string): ProofStatus {
  const runtimeProbes = loadRuntimeProbesArtifact(rootDir);
  if (runtimeProbes) {
    return proofStatusForProbeSet(
      runtimeProbes.probes.filter(
        (p) => p.probeId === 'backend-health' || p.probeId === 'frontend-reachability',
      ),
    );
  }
  return 'unproven';
}

export function checkScenarioPass(_capabilityId: string, rootDir: string): ProofStatus {
  const scenarioEvidence = safeReadJson<Record<string, unknown>>(
    rootDir,
    SCENARIO_EVIDENCE_FILENAME,
  );
  if (scenarioEvidence && Array.isArray(scenarioEvidence.scenarios)) {
    const scenarios = scenarioEvidence.scenarios as Array<Record<string, unknown>>;
    const total = scenarios.length;
    if (total === 0) {
      return 'unproven';
    }
    const passed = scenarios.filter((s) => s.status === 'passed').length;
    const failed = scenarios.filter((s) => s.status === 'failed').length;
    if (failed > 0) {
      return 'failed';
    }
    if (passed / total >= 0.5) {
      return 'proven';
    }
    return 'unproven';
  }

  const scenarioDir = safeJoin(rootDir, '.pulse', 'current');
  const hasScenarioFile = pathExists(path.join(scenarioDir, SCENARIO_EVIDENCE_FILENAME));
  return hasScenarioFile ? 'stale' : 'unproven';
}

export function checkRuntimeProbe(_capabilityId: string, rootDir: string): ProofStatus {
  const runtimeProbes = loadRuntimeProbesArtifact(rootDir);
  if (runtimeProbes) {
    return proofStatusForProbeSet(runtimeProbes.probes);
  }
  return 'unproven';
}

export function checkObservability(_capabilityId: string, rootDir: string): ProofStatus {
  const obsEvidence = safeReadJson<Record<string, unknown>>(rootDir, OBSERVABILITY_FILENAME);
  if (obsEvidence && typeof obsEvidence.executed === 'boolean') {
    if (obsEvidence.executed) {
      return 'proven';
    }
    return 'failed';
  }
  return 'unproven';
}

export function checkSentryRegression(_capabilityId: string, rootDir: string): ProofStatus {
  const signalState = safeReadJson<Record<string, unknown>>(rootDir, SENTRY_ADAPTER_FILENAME);
  if (!signalState) {
    return 'unproven';
  }

  const adapters = Array.isArray(signalState.adapters)
    ? (signalState.adapters as Array<Record<string, unknown>>)
    : [];

  const sentryAdapter = adapters.find((a) => a.source === 'sentry' && a.status === 'ready');

  if (sentryAdapter && Array.isArray(sentryAdapter.signals)) {
    const highSeveritySignals = (sentryAdapter.signals as Array<Record<string, unknown>>).filter(
      (s) => typeof s.severity === 'number' && s.severity >= 7,
    );
    if (highSeveritySignals.length === 0) {
      return 'proven';
    }
    return 'failed';
  }

  const signals = Array.isArray(signalState.signals)
    ? (signalState.signals as Array<Record<string, unknown>>)
    : [];

  const sentrySignals = signals.filter((s) => s.source === 'sentry');
  if (sentrySignals.length > 0) {
    const highSeverity = sentrySignals.filter(
      (s) => typeof s.severity === 'number' && s.severity >= 7,
    );
    return highSeverity.length === 0 ? 'proven' : 'failed';
  }

  return 'unproven';
}

export function checkDbSideEffects(_capabilityId: string, rootDir: string): ProofStatus {
  const runtimeProbes = loadRuntimeProbesArtifact(rootDir);
  if (runtimeProbes) {
    return proofStatusForProbeSet(
      runtimeProbes.probes.filter((p) => p.probeId === 'db-connectivity'),
    );
  }
  return 'unproven';
}

export function checkRollbackFeasibility(rootDir: string): ProofStatus {
  return isRollbackPossible(rootDir) ? 'proven' : 'unproven';
}

export function checkPerformanceBudget(_capabilityId: string, _rootDir: string): ProofStatus {
  return 'unproven';
}
