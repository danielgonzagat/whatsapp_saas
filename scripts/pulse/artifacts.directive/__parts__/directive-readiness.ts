/**
 * Directive proof-readiness and autonomy-claims builders.
 * Exports: buildProofReadinessSummaryForDirective, applyProofReadinessToAutonomyClaims,
 * buildPathProofSurfaceForDirective
 */
import { unique } from '../../artifacts.io';
import { deriveZeroValue } from '../../dynamic-reality-kernel/__parts__/catalog-arithmetic';
import { buildDirectiveProofSurface } from '../../directive-proof-surface';
import { buildAutonomyProof } from '../../artifacts.autonomy/__parts__/autonomy-proof';
import { buildAutonomyReadiness } from '../../artifacts.autonomy/__parts__/readiness';
import type { PulseArtifactSnapshot, PulseMachineReadiness } from '../../artifacts.types';
import type { PulseProofReadinessSummary } from '../../cert-gate-overclaim';
import type { PathProofPlan } from '../../__parts__/path-proof-runner/main';
import type { PathCoverageState } from '../../types.path-coverage-engine';
import {
  OBSERVED_ARTIFACT_FILENAMES,
  readCurrentPulseArtifact,
  type MachineProofRegistryEvidence,
} from './directive-shared';

type DirectiveProofReadinessArtifact = {
  summary?: Partial<PulseProofReadinessSummary>;
  readinessGate?: {
    canAdvance?: boolean;
    status?: string;
    summary?: Partial<PulseProofReadinessSummary>;
  };
};

type DirectiveAutonomyClaims = {
  productionAutonomyVerdict: 'SIM' | 'NAO';
  productionAutonomyReason: string;
  canDeclareComplete: boolean;
  autonomyReadiness: ReturnType<typeof buildAutonomyReadiness>;
  autonomyProof: ReturnType<typeof buildAutonomyProof> & {
    proofReadiness?: PulseProofReadinessSummary;
  };
};

function finiteCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : deriveZeroValue();
}

function firstFiniteCount(...values: unknown[]): number {
  return values.map(finiteCount).find((value) => value > deriveZeroValue()) ?? deriveZeroValue();
}

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
    firstFiniteCount(summary.plannedEvidence, summary.plannedOrUnexecutedEvidence) >
      deriveZeroValue() ||
    finiteCount(summary.inferredEvidence) > deriveZeroValue() ||
    finiteCount(summary.notAvailableEvidence) > deriveZeroValue() ||
    firstFiniteCount(summary.nonObservedEvidence, summary.plannedOrUnexecutedEvidence) >
      deriveZeroValue() ||
    finiteCount(summary.executableUnproved) > deriveZeroValue() ||
    finiteCount(summary.blockedHumanRequired) > deriveZeroValue() ||
    finiteCount(summary.blockedNotExecutable) > deriveZeroValue()
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

function directiveVerdict(value: string): 'SIM' | 'NAO' {
  return value === 'SIM' ? 'SIM' : 'NAO';
}

function verdictGateEvidenceKey(verdictName: string): string {
  return verdictName as string;
}

function directiveGateEvidencePatch(...verdictNames: string[]): { gateNames: string[] } {
  return {
    gateNames: verdictNames.map(verdictGateEvidenceKey),
  };
}

export function applyProofReadinessToAutonomyClaims(
  autonomyReadiness: ReturnType<typeof buildAutonomyReadiness>,
  autonomyProof: ReturnType<typeof buildAutonomyProof>,
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
): ReturnType<typeof buildDirectiveProofSurface> {
  return buildDirectiveProofSurface({
    pathProofPlan: readCurrentPulseArtifact<PathProofPlan>(
      OBSERVED_ARTIFACT_FILENAMES.pathProofTasks,
    ),
    pathCoverage: readCurrentPulseArtifact<PathCoverageState>(
      OBSERVED_ARTIFACT_FILENAMES.pathCoverage,
    ),
    machineReadiness,
    now: machineReadiness.generatedAt,
  });
}
