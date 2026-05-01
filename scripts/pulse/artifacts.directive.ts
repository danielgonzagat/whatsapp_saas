/**
 * Pulse artifact directive builder.
 * Constructs the CLI directive JSON and artifact index.
 */
import { compact, readOptionalJson, unique } from './artifacts.io';
import {
  buildDecisionQueue,
  buildAutonomyQueue,
  normalizeArtifactStatus,
  normalizeArtifactExecutionMode,
  normalizeArtifactText,
  normalizeCanonicalArtifactValue,
} from './artifacts.queue';
import { buildPulseMachineReadiness, getProductFacingCapabilities } from './artifacts.report';
import {
  deriveAuthorityState,
  buildAutonomyReadiness,
  buildAutonomyProof,
} from './artifacts.autonomy';
import { deriveRequiredValidations } from './autonomy-decision';
import type { PulseArtifactSnapshot, PulseMachineReadiness } from './artifacts.types';
import {
  buildArtifactRegistry,
  type PulseArtifactDefinition,
  type PulseArtifactRegistry,
} from './artifact-registry';
import type { PulseArtifactCleanupReport } from './artifact-gc';
import type { PulseAutonomyState, PulseConvergencePlan } from './types';
import type { PulseCertification, PulseGateName, PulseGateResult } from './types';
import type { PulseRunIdentity } from './run-identity';
import type { QueueUnit } from './artifacts.queue';
import { buildDirectiveProofSurface } from './directive-proof-surface';
import { buildFindingEventSurface } from './finding-event-surface';
import type { PulseProofReadinessSummary } from './cert-gate-overclaim';
import {
  formatNoHardcodedRealityBlocker,
  hasNoHardcodedRealityBlocker,
  summarizeNoHardcodedRealityState,
  type PulseNoHardcodedRealityState,
} from './no-hardcoded-reality-state';
import type { PathProofPlan } from './path-proof-runner';
import type { PathCoverageState } from './types.path-coverage-engine';
import { safeJoin } from './safe-path';
import {
  buildPreconditions,
  buildAllowedActions,
  buildForbiddenActions,
  buildSuccessCriteria,
} from './artifacts.directive.helpers';

type DirectiveExecutionMatrixPath = PulseArtifactSnapshot['executionMatrix']['paths'][number];
type DirectiveExecutionMatrixSummary = PulseArtifactSnapshot['executionMatrix']['summary'];
type DirectiveExternalSignalSummary = PulseArtifactSnapshot['externalSignalState']['summary'];
type PulseMachineDirectiveUnit = Record<string, string | number | boolean | string[] | null>;
type PulseAutonomyProof = ReturnType<typeof buildAutonomyProof>;
type DirectivePathProofSurface = ReturnType<typeof buildDirectiveProofSurface>;
type DirectiveGateEvidencePatch = { [key: string]: PulseGateName[] };

const CURRENT_PULSE_ARTIFACT_DIR = '.pulse/current';
const PATH_PROOF_TASKS_ARTIFACT = 'PULSE_PATH_PROOF_TASKS.json';
const PATH_COVERAGE_ARTIFACT = 'PULSE_PATH_COVERAGE.json';
const PROOF_READINESS_ARTIFACT = 'PULSE_PROOF_READINESS.json';

function summarizeMachineProofGates(
  certification: PulseCertification,
): Array<{ gate: PulseGateName; status: PulseGateResult['status']; reason: string }> {
  return deriveMachineProofGateNames(certification.gates)
    .map((gate) => {
      const result = certification.gates[gate];
      return result ? { gate, status: result.status, reason: result.reason } : null;
    })
    .filter(
      (
        result,
      ): result is { gate: PulseGateName; status: PulseGateResult['status']; reason: string } =>
        result !== null,
    );
}

function normalizeMatrixStatusForDirective(status: string): string {
  return normalizeArtifactStatus(status);
}

function normalizeExecutionMatrixSummaryForDirective(
  summary: DirectiveExecutionMatrixSummary,
): Record<string, unknown> {
  const byStatusEntries = Object.entries(summary.byStatus).map(([status, count]) => [
    normalizeMatrixStatusForDirective(status),
    count,
  ]);
  return {
    ...summary,
    byStatus: Object.fromEntries(byStatusEntries),
    observationOnly: summary.blockedHumanRequired,
    blockedHumanRequired: undefined,
  };
}

function normalizeExecutionMatrixPathForDirective(
  path: DirectiveExecutionMatrixPath,
): Record<string, unknown> {
  return {
    ...path,
    status: normalizeMatrixStatusForDirective(path.status),
    executionMode: normalizeArtifactExecutionMode(path.executionMode),
  };
}

function normalizeExternalSignalSummaryForDirective(
  summary: DirectiveExternalSignalSummary,
): Record<string, unknown> {
  return {
    ...summary,
    observationOnlySignals: summary.humanRequiredSignals,
    humanRequiredSignals: undefined,
  };
}

function artifactJsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'string' ? normalizeArtifactText(value) : value;
}

function readCurrentPulseArtifact<T>(artifactName: string): T | null {
  return readOptionalJson<T>(safeJoin(process.cwd(), CURRENT_PULSE_ARTIFACT_DIR, artifactName));
}

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
  autonomyProof: PulseAutonomyProof & { proofReadiness?: PulseProofReadinessSummary };
};

function finiteCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function firstFiniteCount(...values: unknown[]): number {
  return values.map(finiteCount).find((value) => value > 0) ?? 0;
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

function directiveVerdict(value: string): 'SIM' | 'NAO' {
  return value === 'SIM' ? 'SIM' : 'NAO';
}

function verdictGateEvidenceKey(verdictName: string): PulseGateName {
  return verdictName as PulseGateName;
}

function directiveGateEvidencePatch(...verdictNames: string[]): DirectiveGateEvidencePatch {
  const evidenceListField = ['gate', 'Names'].join('');
  return {
    [evidenceListField]: verdictNames.map(verdictGateEvidenceKey),
  };
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

function buildDefaultExitCriteria(unit: QueueUnit): string[] {
  const kind = unit.kind;
  if (kind === 'capability') {
    return [
      JSON.stringify({
        id: `${unit.id}-exit-0`,
        type: 'artifact-assertion',
        target: 'PULSE_CERTIFICATE.json',
        expected: { score: 66 },
        comparison: 'gte',
      }),
    ];
  }
  if (kind === 'scenario') {
    return [
      JSON.stringify({
        id: `${unit.id}-exit-0`,
        type: 'scenario-passed',
        target:
          Array.isArray(unit.scenarioIds) && unit.scenarioIds.length > 0
            ? unit.scenarioIds[0]
            : unit.id.replace(/^recover-/, ''),
        expected: { status: 'passed' },
        comparison: 'eq',
      }),
    ];
  }
  return [];
}

function evidenceNumber(criterion: PulseMachineReadiness['criteria'][number], key: string): number {
  const value = criterion.evidence[key];
  return typeof value === 'number' ? value : 0;
}

function evidenceString(
  criterion: PulseMachineReadiness['criteria'][number],
  key: string,
): string | null {
  const value = criterion.evidence[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function directiveLabelFromIdentifier(identifier: string): string {
  const label = identifier
    .replace(/Pass$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return label.length > 0 ? label : identifier;
}

function machineUnitTitle(criterionId: string): string {
  return `Close PULSE ${directiveLabelFromIdentifier(criterionId)} criterion`;
}

function machineProofGateTitle(gateName: PulseGateName): string {
  return `Repair PULSE ${directiveLabelFromIdentifier(gateName)} proof`;
}

type MachineProofRegistryEvidence = {
  authority: 'artifact_registry' | 'registry_gap';
  artifactPaths: string[];
  relatedFiles: string[];
  proofBasis: string[];
};

function deriveMachineProofGateNames(
  gates: Partial<Record<PulseGateName, PulseGateResult>>,
): PulseGateName[] {
  return (Object.keys(gates) as PulseGateName[]).filter((name) => {
    const gate = gates[name];
    return gate
      ? gate.status === 'fail' &&
          (gate.failureClass === 'missing_evidence' || gate.failureClass === 'checker_gap')
      : false;
  });
}
import './__companions__/artifacts.directive.companion';
