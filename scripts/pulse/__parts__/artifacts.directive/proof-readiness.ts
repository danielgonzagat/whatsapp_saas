import { unique } from '../../artifacts.io';
import { buildAutonomyReadiness, buildAutonomyProof } from '../../artifacts.autonomy';
import type { PulseProofReadinessSummary } from '../../cert-gate-overclaim';
import { buildDirectiveProofSurface } from '../../directive-proof-surface';
import type { DirectivePathProofSurface } from '../../directive-proof-surface';
import type { PulseMachineReadiness } from '../../artifacts.types';
import type { PathProofPlan } from '../../path-proof-runner';
import type { PathCoverageState } from '../../types.path-coverage-engine';
import {
  type DirectiveProofReadinessArtifact,
  type DirectiveAutonomyClaims,
  type PulseAutonomyProof,
  finiteCount,
  firstFiniteCount,
  directiveVerdict,
  readCurrentPulseArtifact,
  PATH_COVERAGE_ARTIFACT,
  PATH_PROOF_TASKS_ARTIFACT,
} from './helpers';

export function buildProofReadinessSummaryForDirective(
  artifact: DirectiveProofReadinessArtifact | null,
): PulseProofReadinessSummary | null {
  if (!artifact) {
    return null;
  }

  const source = artifact.summary ?? artifact.readinessGate?.summary;
  if (!source && artifact.readinessGate?.canAdvance === undefined) {
    return null;
  }

  return {
    canAdvance: source?.canAdvance ?? artifact.readinessGate?.canAdvance,
    status: source?.status ?? artifact.readinessGate?.status,
    plannedEvidence: finiteCount(source?.plannedEvidence),
    inferredEvidence: finiteCount(source?.inferredEvidence),
    notAvailableEvidence: finiteCount(source?.notAvailableEvidence),
    nonObservedEvidence: finiteCount(source?.nonObservedEvidence),
    executableUnproved: finiteCount(source?.executableUnproved),
    plannedOrUnexecutedEvidence: finiteCount(source?.plannedOrUnexecutedEvidence),
    blockedHumanRequired: finiteCount(source?.blockedHumanRequired),
    blockedNotExecutable: finiteCount(source?.blockedNotExecutable),
  };
}

function hasProofReadinessProductionBlocker(summary: PulseProofReadinessSummary | null): boolean {
  if (!summary) {
    return false;
  }

  return (
    summary.canAdvance === false ||
    (summary.status !== undefined && summary.status !== 'ready') ||
    firstFiniteCount(summary.plannedEvidence, summary.plannedOrUnexecutedEvidence) > 0 ||
    finiteCount(summary.inferredEvidence) > 0 ||
    finiteCount(summary.notAvailableEvidence) > 0 ||
    firstFiniteCount(summary.nonObservedEvidence, summary.plannedOrUnexecutedEvidence) > 0 ||
    finiteCount(summary.executableUnproved) > 0 ||
    finiteCount(summary.blockedHumanRequired) > 0 ||
    finiteCount(summary.blockedNotExecutable) > 0
  );
}

function proofReadinessProductionBlockerReason(summary: PulseProofReadinessSummary): string {
  return [
    `proofReadiness status=${summary.status ?? 'unknown'}`,
    `canAdvance=${String(summary.canAdvance ?? 'unknown')}`,
    `planned=${firstFiniteCount(summary.plannedEvidence, summary.plannedOrUnexecutedEvidence)}`,
    `inferred=${finiteCount(summary.inferredEvidence)}`,
    `not_available=${finiteCount(summary.notAvailableEvidence)}`,
    `nonObserved=${firstFiniteCount(summary.nonObservedEvidence, summary.plannedOrUnexecutedEvidence)}`,
    `executableUnproved=${finiteCount(summary.executableUnproved)}`,
  ].join(', ');
}

export function applyProofReadinessToAutonomyClaims(
  autonomyReadiness: ReturnType<typeof buildAutonomyReadiness>,
  autonomyProof: PulseAutonomyProof,
  proofReadiness: PulseProofReadinessSummary | null,
): DirectiveAutonomyClaims {
  const productionBlocked = hasProofReadinessProductionBlocker(proofReadiness);
  if (!productionBlocked || !proofReadiness) {
    return {
      productionAutonomyVerdict: directiveVerdict(autonomyProof.verdicts.productionAutonomy),
      productionAutonomyReason: autonomyProof.productionAutonomyReason,
      canDeclareComplete: autonomyProof.verdicts.canDeclareComplete,
      autonomyReadiness,
      autonomyProof: proofReadiness
        ? {
            ...autonomyProof,
            proofReadiness,
          }
        : autonomyProof,
    };
  }

  const reason = `NAO: production proof readiness is not fully observed (${proofReadinessProductionBlockerReason(proofReadiness)}).`;
  const productionAutonomyReason =
    autonomyProof.verdicts.productionAutonomy === 'SIM'
      ? reason
      : `${autonomyProof.productionAutonomyReason} | ${reason}`;

  return {
    productionAutonomyVerdict: 'NAO',
    productionAutonomyReason,
    canDeclareComplete: false,
    autonomyReadiness: {
      ...autonomyReadiness,
      canDeclareComplete: false,
      warnings: unique([...autonomyReadiness.warnings, reason]),
    },
    autonomyProof: {
      ...autonomyProof,
      productionAutonomyAnswer: 'NAO',
      productionAutonomyReason,
      verdicts: {
        ...autonomyProof.verdicts,
        productionAutonomy: 'NAO',
        canDeclareComplete: false,
      },
      proofReadiness,
    },
  };
}

export function buildPathProofSurfaceForDirective(
  machineReadiness: PulseMachineReadiness,
): DirectivePathProofSurface {
  return buildDirectiveProofSurface({
    pathProofPlan: readCurrentPulseArtifact<PathProofPlan>(PATH_PROOF_TASKS_ARTIFACT),
    pathCoverage: readCurrentPulseArtifact<PathCoverageState>(PATH_COVERAGE_ARTIFACT),
    machineReadiness,
    now: machineReadiness.generatedAt,
  });
}
