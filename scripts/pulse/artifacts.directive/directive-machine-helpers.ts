/**
 * Directive machine-work internal helpers — registry evidence, gate classification,
 * and unit title builders. NOT re-exported from the shim.
 */
import { unique } from '../../artifacts.io';
import { deriveZeroValue } from '../../dynamic-reality-kernel/catalog-arithmetic';
import { discoverGateFailureClassLabels } from '../../dynamic-reality-kernel/type-contract-labels';
import { buildArtifactRegistry } from '../../artifact-registry/registry';
import { normalizeArtifactExecutionMode } from '../../artifacts.queue';
import { deriveRequiredValidations } from '../../autonomy-decision';
import {
  buildPreconditions,
  buildAllowedActions,
  buildForbiddenActions,
  buildSuccessCriteria,
} from '../../artifacts.directive.helpers';
import type {
  PulseArtifactDefinition,
  PulseArtifactRegistry,
} from '../../artifact-registry/__parts__/discovery';
import type { PulseArtifactSnapshot, PulseMachineReadiness } from '../../artifacts.types';
import type { QueueUnit } from '../../artifacts.queue';
import type { PulseGateName } from '../../types.manifest';
import type { PulseGateResult } from '../../types.evidence';
import {
  buildDefaultExitCriteria,
  OBSERVED_ARTIFACT_FILENAMES,
  type MachineProofRegistryEvidence,
  type PulseMachineDirectiveUnit,
} from './directive-shared';

export function directiveLabelFromIdentifier(identifier: string): string {
  const label = identifier
    .replace(/Pass$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return label.length > 0 ? label : identifier;
}

export function machineUnitTitle(criterionId: string): string {
  return `Close PULSE ${directiveLabelFromIdentifier(criterionId)} criterion`;
}

export function machineProofGateTitle(gateName: PulseGateName): string {
  return `Repair PULSE ${directiveLabelFromIdentifier(gateName)} proof`;
}

export function tokenizeGateName(gateName: PulseGateName): string[] {
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
  if (!/^[a-z0-9./-]+$/i.test(normalized)) {
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

export function buildRegistryEvidenceForDirective(
  identifier: string,
  registry: PulseArtifactRegistry = buildArtifactRegistry(process.cwd()),
): MachineProofRegistryEvidence {
  const tokens = tokenizeGateName(identifier as PulseGateName);
  const artifacts = registry.artifacts.filter((artifact) => {
    const searchText = artifactRegistrySearchText(artifact);
    return tokens.some((token) => searchText.includes(token));
  });
  const artifactPaths = unique(artifacts.map((artifactArg) => artifactArg.relativePath));
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

export function buildMachineProofRegistryEvidence(
  gateName: PulseGateName,
  registry: PulseArtifactRegistry = buildArtifactRegistry(process.cwd()),
): MachineProofRegistryEvidence {
  return buildRegistryEvidenceForDirective(gateName, registry);
}

export function buildMachineCriterionRegistryEvidence(
  criterionId: string,
  registry: PulseArtifactRegistry = buildArtifactRegistry(process.cwd()),
): MachineProofRegistryEvidence {
  return buildRegistryEvidenceForDirective(criterionId, registry);
}

export function isMachineProofGate(_gateName: PulseGateName, gate: PulseGateResult): boolean {
  const gateFailureClasses = discoverGateFailureClassLabels();
  const machineOwnedFailure =
    gateFailureClasses.has(gate.failureClass) &&
    gateFailureClasses.has('missing_evidence') &&
    gateFailureClasses.has('checker_gap')
      ? gate.failureClass === 'missing_evidence' || gate.failureClass === 'checker_gap'
      : false;
  return gate.status === 'fail' && machineOwnedFailure;
}

export function deriveMachineProofGateNames(
  gates: Partial<Record<PulseGateName, PulseGateResult>>,
): PulseGateName[] {
  return (Object.keys(gates) as PulseGateName[]).filter((gateName) => {
    const gate = gates[gateName];
    return gate ? isMachineProofGate(gateName, gate) : false;
  });
}

export function summarizeMachineProofGates(certification: {
  gates: Partial<Record<PulseGateName, PulseGateResult>>;
}): Array<{ gate: PulseGateName; status: PulseGateResult['status']; reason: string }> {
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

export function evidenceNumber(
  criterion: PulseMachineReadiness['criteria'][number],
  key: string,
): number {
  const value = criterion.evidence[key];
  return typeof value === 'number' ? value : 0;
}

export function evidenceString(
  criterion: PulseMachineReadiness['criteria'][number],
  key: string,
): string | null {
  const value = criterion.evidence[key];
  return typeof value === 'string' && value.length > 0 ? (value as string) : null;
}

export function shouldEmitMachineCriterionWork(
  criterion: PulseMachineReadiness['criteria'][number],
): boolean {
  if (criterion.status !== 'pass') {
    return true;
  }
  if (criterion.id !== 'critical_path_terminal') {
    return false;
  }
  return evidenceNumber(criterion, 'terminalWithoutObservedEvidence') > deriveZeroValue();
}

export function buildDirectiveUnit(snapshot: PulseArtifactSnapshot, unit: QueueUnit) {
  const executionMode = normalizeArtifactExecutionMode(unit.executionMode);
  const directiveUnit = {
    order: unit.order,
    id: unit.id,
    kind: unit.kind,
    priority: unit.priority,
    source: unit.source,
    executionMode,
    riskLevel: unit.riskLevel,
    evidenceMode: unit.evidenceMode,
    confidence: unit.confidence,
    productImpact: unit.productImpact,
    ownerLane: unit.ownerLane,
    title: unit.title,
    summary: unit.summary,
    whyNow: unit.visionDelta,
    visionDelta: unit.visionDelta,
    targetState: unit.targetState,
    affectedCapabilities: unit.affectedCapabilityIds,
    affectedFlows: unit.affectedFlowIds,
    gateNames: unit.gateNames,
    expectedGateShift: unit.expectedGateShift,
    validationTargets: unit.validationArtifacts,
    validationArtifacts: unit.validationArtifacts,
    relatedFiles: unit.relatedFiles,
    exitCriteria: unit.exitCriteria.length > 0 ? unit.exitCriteria : buildDefaultExitCriteria(unit),
    preconditions: buildPreconditions(snapshot, unit),
    allowedActions: buildAllowedActions(unit),
    forbiddenActions: buildForbiddenActions(snapshot),
    successCriteria: buildSuccessCriteria(unit),
  };
  return {
    ...directiveUnit,
    requiredValidations: deriveRequiredValidations({
      kind: unit.kind,
      gateNames: unit.gateNames,
      affectedCapabilities: unit.affectedCapabilityIds,
    }),
  };
}
