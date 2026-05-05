import type {
  PulseCertificationTarget,
  PulseExecutionEvidence,
  PulseExecutionMatrix,
  PulseManifest,
  PulseGateName,
  PulseGateResult,
} from '../../types';

import type { PulseProofReadinessSummary } from '../../cert-gate-overclaim';

import type { PulsePathCoverageGateState } from '../../cert-gate-execution-matrix';

import type { ComputeCertificationInput } from './helpers';

import { buildDefaultEvidence, mergeExecutionEvidence } from '../../cert-evidence-defaults';
import { buildGateEvidence } from '../../cert-gate-evidence';
import { withTemporaryGateAcceptance } from '../../cert-gate-pattern';
import { evaluateMultiCycleConvergenceGate } from '../../cert-gate-multi-cycle';

import {
  deriveZeroValue,
  discoverAllObservedArtifactFilenames,
} from '../../dynamic-reality-kernel';

import { PROOF_READINESS_ARTIFACT } from '../../proof-readiness-artifact';
import {
  NO_HARDCODED_REALITY_ARTIFACT,
  formatNoHardcodedRealityBlocker,
} from '../../no-hardcoded-reality-state';
import { formatProofReadinessGap } from '../../cert-gate-overclaim';

export interface CertificationEvidenceResult {
  multiCycleConvergenceResult: PulseGateResult;
  evidenceSummary: Partial<PulseExecutionEvidence>;
  gateEvidence: Partial<Record<PulseGateName, unknown[]>>;
}

export function buildCertificationEvidence(
  input: ComputeCertificationInput,
  manifest: PulseManifest | null,
  certificationTarget: PulseCertificationTarget,
  env: string,
  pathCoverage: PulsePathCoverageGateState | null,
  proofReadinessSummary: PulseProofReadinessSummary | undefined,
  productionProofReadinessGap: boolean,
  noHardcodedRealityGap: boolean,
  noHardcodedRealitySummary: Record<string, unknown>,
): CertificationEvidenceResult {
  const multiCycleConvergenceResult = withTemporaryGateAcceptance(
    'multiCycleConvergencePass',
    manifest,
    evaluateMultiCycleConvergenceGate(input.autonomyState),
  );

  const defaults = buildDefaultEvidence(
    env,
    manifest,
    input.parserInventory,
    input.health,
    input.codebaseTruth,
    input.resolvedManifest,
    certificationTarget,
  );
  const evidenceSummary = mergeExecutionEvidence(defaults, input.executionEvidence);
  const gateEvidence = buildGateEvidence(
    input.health,
    evidenceSummary,
    input.codebaseTruth,
    input.resolvedManifest,
    input.scopeState,
    input.scopeState.codacy,
    input.externalSignalState,
  );
  if (input.executionMatrix) {
    gateEvidence.executionMatrixCompletePass = [
      {
        kind: 'artifact',
        executed: true,
        summary: `Execution matrix classified ${input.executionMatrix.summary.totalPaths} path(s); unknown=${input.executionMatrix.summary.unknownPaths}.`,
        artifactPaths: discoverAllObservedArtifactFilenames().executionMatrix
          ? [discoverAllObservedArtifactFilenames().executionMatrix!]
          : [],
        metrics: {
          totalPaths: input.executionMatrix.summary.totalPaths,
          unknownPaths: input.executionMatrix.summary.unknownPaths,
          coveragePercent: input.executionMatrix.summary.coveragePercent,
        },
      },
    ];
    gateEvidence.criticalPathObservedPass = [
      {
        kind: 'coverage',
        executed: true,
        summary:
          pathCoverage?.summary?.criticalUnobserved &&
          pathCoverage.summary.criticalUnobserved > deriveZeroValue()
            ? `${pathCoverage.summary.criticalUnobserved} critical path(s) remain unobserved in path coverage.`
            : `${input.executionMatrix.summary.criticalUnobservedPaths} critical path(s) lack observed pass/fail evidence.`,
        artifactPaths: (() => {
          const artifacts = discoverAllObservedArtifactFilenames();
          const em = artifacts.executionMatrix;
          const pc = artifacts.pathCoverage;
          return pathCoverage ? ([em, pc].filter(Boolean) as string[]) : em ? [em] : [];
        })(),
        metrics: {
          criticalUnobservedPaths: input.executionMatrix.summary.criticalUnobservedPaths,
          criticalInferredOnlyPaths: pathCoverage?.summary?.criticalInferredOnly ?? 0,
          criticalPathCoverageUnobserved: pathCoverage?.summary?.criticalUnobserved ?? 0,
          pathCoveragePercent: pathCoverage?.summary?.coveragePercent ?? null,
          observedPass: input.executionMatrix.summary.observedPass,
          observedFail: input.executionMatrix.summary.observedFail,
        },
      },
    ];
    gateEvidence.breakpointPrecisionPass = [
      {
        kind: 'artifact',
        executed: true,
        summary: `${input.executionMatrix.summary.impreciseBreakpoints} observed failure(s) lack precise breakpoints.`,
        artifactPaths: discoverAllObservedArtifactFilenames().executionMatrix
          ? [discoverAllObservedArtifactFilenames().executionMatrix!]
          : [],
        metrics: {
          impreciseBreakpoints: input.executionMatrix.summary.impreciseBreakpoints,
        },
      },
    ];
  }
  if (proofReadinessSummary) {
    gateEvidence.noOverclaimPass = [
      ...(gateEvidence.noOverclaimPass || []),
      {
        kind: 'artifact',
        executed: true,
        summary: productionProofReadinessGap
          ? `Proof readiness blocks completion: ${formatProofReadinessGap(proofReadinessSummary)}.`
          : `Proof readiness is complete: ${formatProofReadinessGap(proofReadinessSummary)}.`,
        artifactPaths: [PROOF_READINESS_ARTIFACT],
        metrics: {
          canAdvance: proofReadinessSummary.canAdvance === true ? 1 : 0,
          plannedEvidence: proofReadinessSummary.plannedEvidence ?? 0,
          plannedOrUnexecutedEvidence: proofReadinessSummary.plannedOrUnexecutedEvidence ?? 0,
          inferredEvidence: proofReadinessSummary.inferredEvidence ?? 0,
          notAvailableEvidence: proofReadinessSummary.notAvailableEvidence ?? 0,
          nonObservedEvidence: proofReadinessSummary.nonObservedEvidence ?? 0,
          executableUnproved: proofReadinessSummary.executableUnproved ?? 0,
          blockedHumanRequired: proofReadinessSummary.blockedHumanRequired ?? 0,
          blockedNotExecutable: proofReadinessSummary.blockedNotExecutable ?? 0,
        },
      },
    ];
  }
  if (noHardcodedRealityGap) {
    gateEvidence.noOverclaimPass = [
      ...(gateEvidence.noOverclaimPass || []),
      {
        kind: 'artifact',
        executed: true,
        summary: `No-hardcoded-reality state blocks completion: ${formatNoHardcodedRealityBlocker(noHardcodedRealitySummary as ReturnType<typeof import('../../no-hardcoded-reality-state').summarizeNoHardcodedRealityState>)}`,
        artifactPaths: [NO_HARDCODED_REALITY_ARTIFACT],
        metrics: {
          totalEvents: (noHardcodedRealitySummary as Record<string, unknown>).totalEvents as number,
          scannedFiles: (noHardcodedRealitySummary as Record<string, unknown>)
            .scannedFiles as number,
        },
      },
    ];
  }

  return {
    multiCycleConvergenceResult,
    evidenceSummary,
    gateEvidence,
  };
}
