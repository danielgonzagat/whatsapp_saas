import { readOptionalJson, unique } from '../../artifacts.io';
import {
  normalizeArtifactStatus,
  normalizeArtifactExecutionMode,
  normalizeArtifactText,
  normalizeCanonicalArtifactValue,
} from '../../artifacts.queue';
import type { QueueUnit } from '../../artifacts.queue';
import type { PulseArtifactSnapshot, PulseMachineReadiness } from '../../artifacts.types';
import {
  buildArtifactRegistry,
  type PulseArtifactDefinition,
  type PulseArtifactRegistry,
} from '../../artifact-registry';
import type { PulseCertification, PulseGateName, PulseGateResult } from '../../types';
import { safeJoin } from '../../safe-path';
import type { PulseProofReadinessSummary } from '../../cert-gate-overclaim';
import type { buildAutonomyProof, buildAutonomyReadiness } from '../../artifacts.autonomy';

type DirectiveExecutionMatrixPath = PulseArtifactSnapshot['executionMatrix']['paths'][number];
type DirectiveExecutionMatrixSummary = PulseArtifactSnapshot['executionMatrix']['summary'];
type DirectiveExternalSignalSummary = PulseArtifactSnapshot['externalSignalState']['summary'];
type PulseMachineDirectiveUnit = Record<string, string | number | boolean | string[] | null>;
type PulseAutonomyProof = ReturnType<typeof buildAutonomyProof>;
type DirectiveGateEvidencePatch = { [key: string]: PulseGateName[] };

const CURRENT_PULSE_ARTIFACT_DIR = '.pulse/current';
const PATH_PROOF_TASKS_ARTIFACT = 'PULSE_PATH_PROOF_TASKS.json';
const PATH_COVERAGE_ARTIFACT = 'PULSE_PATH_COVERAGE.json';
const PROOF_READINESS_ARTIFACT = 'PULSE_PROOF_READINESS.json';

type MachineProofRegistryEvidence = {
  authority: 'artifact_registry' | 'registry_gap';
  artifactPaths: string[];
  relatedFiles: string[];
  proofBasis: string[];
};

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

function finiteCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function firstFiniteCount(...values: unknown[]): number {
  return values.map(finiteCount).find((value) => value > 0) ?? 0;
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

function tokenizeGateName(gateName: PulseGateName): string[] {
  const spaced = gateName
    .replace(/Pass$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase();
  return unique(spaced.split(/\s+/).filter((token) => token.length > 2));
}

function artifactRegistrySearchText(artifact: PulseArtifactDefinition): string {
  return [
    artifact.id,
    artifact.relativePath,
    artifact.schema.module,
    artifact.schema.exportName,
    artifact.producer.module,
    artifact.producer.exportName,
    ...artifact.consumers,
    artifact.freshness.mode,
    artifact.truthMode,
  ]
    .join(' ')
    .toLowerCase();
}

function moduleRefToPulseFile(moduleRef: string): string | null {
  if (!moduleRef.startsWith('./')) {
    return null;
  }
  const normalized = moduleRef.replace(/^\.\//, '');
  if (!/^[a-z0-9.\/-]+$/i.test(normalized)) {
    return null;
  }
  return `scripts/pulse/${normalized}.ts`;
}

function artifactRelatedFiles(artifact: PulseArtifactDefinition): string[] {
  return unique(
    [
      moduleRefToPulseFile(artifact.schema.module),
      moduleRefToPulseFile(artifact.producer.module),
      ...artifact.consumers.map(moduleRefToPulseFile),
    ].filter((filePath): filePath is string => filePath !== null),
  );
}

function buildRegistryEvidenceForDirective(
  identifier: string,
  registry: PulseArtifactRegistry = buildArtifactRegistry(process.cwd()),
): MachineProofRegistryEvidence {
  const tokens = tokenizeGateName(identifier as PulseGateName);
  const artifacts = registry.artifacts.filter((artifact) => {
    const searchText = artifactRegistrySearchText(artifact);
    return tokens.some((token) => searchText.includes(token));
  });
  const artifactPaths = unique(artifacts.map((artifact) => artifact.relativePath));
  const relatedFiles = unique(artifacts.flatMap(artifactRelatedFiles)).filter((filePath) =>
    filePath.startsWith('scripts/pulse/'),
  );

  if (artifactPaths.length > 0 && relatedFiles.length > 0) {
    return {
      authority: 'artifact_registry',
      artifactPaths,
      relatedFiles,
      proofBasis: artifacts.map(
        (artifact) =>
          `${artifact.id}:${artifact.producer.module}.${artifact.producer.exportName}:${artifact.freshness.mode}:${artifact.truthMode}`,
      ),
    };
  }

  return {
    authority: 'registry_gap',
    artifactPaths: [],
    relatedFiles: [],
    proofBasis: [
      `registry gap: no artifact producer/consumer/freshness evidence matched ${identifier}`,
    ],
  };
}

function buildMachineProofRegistryEvidence(
  gateName: PulseGateName,
  registry: PulseArtifactRegistry = buildArtifactRegistry(process.cwd()),
): MachineProofRegistryEvidence {
  return buildRegistryEvidenceForDirective(gateName, registry);
}

function buildMachineCriterionRegistryEvidence(
  criterionId: string,
  registry: PulseArtifactRegistry = buildArtifactRegistry(process.cwd()),
): MachineProofRegistryEvidence {
  return buildRegistryEvidenceForDirective(criterionId, registry);
}

function isMachineProofGate(_gateName: PulseGateName, gate: PulseGateResult): boolean {
  const machineOwnedFailure =
    gate.failureClass === 'missing_evidence' || gate.failureClass === 'checker_gap';
  return gate.status === 'fail' && machineOwnedFailure;
}

function deriveMachineProofGateNames(
  gates: Partial<Record<PulseGateName, PulseGateResult>>,
): PulseGateName[] {
  return (Object.keys(gates) as PulseGateName[]).filter((gateName) => {
    const gate = gates[gateName];
    return gate ? isMachineProofGate(gateName, gate) : false;
  });
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

function shouldEmitMachineCriterionWork(
  criterion: PulseMachineReadiness['criteria'][number],
): boolean {
  if (criterion.status !== 'pass') {
    return true;
  }
  if (criterion.id !== 'critical_path_terminal') {
    return false;
  }
  return evidenceNumber(criterion, 'terminalWithoutObservedEvidence') > 0;
}

export type {
  DirectiveExecutionMatrixPath,
  DirectiveExecutionMatrixSummary,
  DirectiveExternalSignalSummary,
  PulseMachineDirectiveUnit,
  PulseAutonomyProof,
  DirectiveGateEvidencePatch,
  MachineProofRegistryEvidence,
  DirectiveProofReadinessArtifact,
  DirectiveAutonomyClaims,
};

export {
  CURRENT_PULSE_ARTIFACT_DIR,
  PATH_PROOF_TASKS_ARTIFACT,
  PATH_COVERAGE_ARTIFACT,
  PROOF_READINESS_ARTIFACT,
  summarizeMachineProofGates,
  normalizeMatrixStatusForDirective,
  normalizeExecutionMatrixSummaryForDirective,
  normalizeExecutionMatrixPathForDirective,
  normalizeExternalSignalSummaryForDirective,
  artifactJsonReplacer,
  readCurrentPulseArtifact,
  finiteCount,
  firstFiniteCount,
  directiveVerdict,
  verdictGateEvidenceKey,
  directiveGateEvidencePatch,
  tokenizeGateName,
  artifactRegistrySearchText,
  moduleRefToPulseFile,
  artifactRelatedFiles,
  buildRegistryEvidenceForDirective,
  buildMachineProofRegistryEvidence,
  buildMachineCriterionRegistryEvidence,
  isMachineProofGate,
  deriveMachineProofGateNames,
  evidenceNumber,
  evidenceString,
  directiveLabelFromIdentifier,
  machineUnitTitle,
  machineProofGateTitle,
  buildDefaultExitCriteria,
  shouldEmitMachineCriterionWork,
};
