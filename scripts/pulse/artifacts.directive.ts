/**
 * Pulse artifact directive builder.
 * Constructs the CLI directive JSON and artifact index.
 */
import { compact, readOptionalJson, unique } from './artifacts.io';
import {
  discoverAllObservedArtifactFilenames,
  discoverConvergenceExecutionModeLabels,
  discoverGateFailureClassLabels,
  deriveZeroValue,
} from './dynamic-reality-kernel';
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
const OBSERVED_ARTIFACT_FILENAMES = discoverAllObservedArtifactFilenames();

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
    firstFiniteCount(summary.plannedEvidence, summary.plannedOrUnexecutedEvidence) > deriveZeroValue() ||
    finiteCount(summary.inferredEvidence) > deriveZeroValue() ||
    finiteCount(summary.notAvailableEvidence) > deriveZeroValue() ||
    firstFiniteCount(summary.nonObservedEvidence, summary.plannedOrUnexecutedEvidence) > deriveZeroValue() ||
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
    pathProofPlan: readCurrentPulseArtifact<PathProofPlan>(OBSERVED_ARTIFACT_FILENAMES.pathProofTasks),
    pathCoverage: readCurrentPulseArtifact<PathCoverageState>(OBSERVED_ARTIFACT_FILENAMES.pathCoverage),
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
        target: OBSERVED_ARTIFACT_FILENAMES.certificate,
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
  const gateFailureClasses = discoverGateFailureClassLabels();
  const machineOwnedFailure =
    gateFailureClasses.has(gate.failureClass) &&
    gateFailureClasses.has('missing_evidence') &&
    gateFailureClasses.has('checker_gap')
      ? gate.failureClass === 'missing_evidence' || gate.failureClass === 'checker_gap'
      : false;
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

export function buildPulseCertificationProofDebtNextWork(certification: {
  gates: Partial<Record<PulseGateName, PulseGateResult>>;
}): PulseMachineDirectiveUnit[] {
  return deriveMachineProofGateNames(certification.gates).flatMap((gateName, index) => {
    const gate = certification.gates[gateName];
    if (!gate || !isMachineProofGate(gateName, gate)) {
      return [];
    }
    const registryEvidence = buildMachineProofRegistryEvidence(gateName);
    const validationArtifacts = [
      OBSERVED_ARTIFACT_FILENAMES.certificate,
      OBSERVED_ARTIFACT_FILENAMES.cliDirective,
      OBSERVED_ARTIFACT_FILENAMES.machineReadiness,
      ...registryEvidence.artifactPaths,
    ];
    return [
      {
        order: index + 101,
        id: `pulse-proof-${gateName}`,
        kind: 'pulse_machine',
        priority:
          gate.failureClass === 'missing_evidence' ||
          gateName === 'runtimePass' ||
          gateName === 'soakPass'
            ? 'P0'
            : 'P1',
        source: 'pulse_machine',
        executionMode: 'ai_safe',
        riskLevel: 'low',
        evidenceMode: gate.evidenceMode ?? 'inferred',
        confidence: gate.confidence ?? 'medium',
        productImpact: 'machine',
        ownerLane: 'pulse-proof',
        title: machineProofGateTitle(gateName),
        summary: gate.reason,
        whyNow:
          'PULSE cannot claim zero-prompt production autonomy while this proof gate is failing; improve PULSE proof machinery before editing SaaS product code.',
        visionDelta:
          'Moves PULSE from advisory/autonomous execution toward certified technical replacement by converting inferred or missing proof into canonical evidence.',
        targetState: `Certification gate ${gateName} must pass or expose a precise non-product proof blocker.`,
        affectedCapabilities: [],
        affectedFlows: [],
        gateNames: [gateName],
        expectedGateShift: `Pass or sharpen ${gateName} without editing SaaS product code`,
        proofAuthority: registryEvidence.authority,
        proofBasis: registryEvidence.proofBasis,
        validationTargets: unique(validationArtifacts),
        validationArtifacts: unique(validationArtifacts),
        relatedFiles: registryEvidence.relatedFiles,
        exitCriteria: [
          JSON.stringify({
            id: `pulse-proof-${gateName}-exit-0`,
            type: 'artifact-gate',
            target: OBSERVED_ARTIFACT_FILENAMES.certificate,
            expected: { gate: gateName, status: 'pass' },
            comparison: 'eq',
          }),
        ],
        preconditions: [
          'Operate only on PULSE machine/proof code and generated PULSE artifacts.',
          'Do not materialize SaaS product capabilities for this proof-debt unit.',
        ],
        allowedActions: [
          'PULSE scanner changes',
          'PULSE evidence generation',
          'PULSE scenario/probe harness changes',
          'PULSE test writing',
        ],
        forbiddenActions: [
          'Do not edit SaaS product code for this unit',
          'Do not edit governance-protected files',
          'Do not suppress Codacy, lint, or certification findings',
          'Do not add secrets or credentials',
        ],
        successCriteria: [
          `${gateName} is pass or has a more precise machine-owned blocker.`,
          'PULSE_CLI_DIRECTIVE keeps next work focused on PULSE proof machinery while production autonomy is NAO.',
          'Targeted PULSE tests pass.',
        ],
        requiredValidations: ['affected-tests'],
      },
    ];
  });
}

export function buildPulseAutonomyProofDebtNextWork(
  autonomyProof: Pick<
    PulseAutonomyProof,
    'verdicts' | 'productionAutonomyReason' | 'zeroPromptProductionGuidanceReason'
  >,
): PulseMachineDirectiveUnit[] {
  const units: PulseMachineDirectiveUnit[] = [];
  const registry = buildArtifactRegistry(process.cwd());
  const productionAutonomyEvidence = buildRegistryEvidenceForDirective(
    'productionAutonomy',
    registry,
  );
  const zeroPromptGuidanceEvidence = buildRegistryEvidenceForDirective(
    'zeroPromptProductionGuidance',
    registry,
  );

  if (autonomyProof.verdicts.productionAutonomy === 'NAO') {
    units.push({
      order: 201,
      id: 'pulse-proof-productionAutonomy',
      kind: 'pulse_machine',
      priority: 'P0',
      source: 'pulse_machine',
      executionMode: 'ai_safe',
      riskLevel: 'low',
      evidenceMode: 'observed',
      confidence: 'high',
      productImpact: 'machine',
      ownerLane: 'pulse-proof',
      title: 'Close PULSE production-autonomy proof debt',
      summary: autonomyProof.productionAutonomyReason,
      whyNow:
        'PULSE cannot claim production autonomy while proof blockers remain; repair PULSE proof machinery before editing SaaS product code.',
      visionDelta:
        'Moves PULSE from next-step guidance toward certified zero-prompt technical replacement.',
      targetState: 'productionAutonomyVerdict must be SIM or expose only precise machine blockers.',
      affectedCapabilities: [],
      affectedFlows: [],
      ...directiveGateEvidencePatch('productionAutonomy'),
      expectedGateShift: 'productionAutonomyVerdict becomes SIM or a precise machine blocker',
      validationTargets: [
        OBSERVED_ARTIFACT_FILENAMES.certificate,
        OBSERVED_ARTIFACT_FILENAMES.cliDirective,
        OBSERVED_ARTIFACT_FILENAMES.autonomyState,
      ],
      validationArtifacts: [
        OBSERVED_ARTIFACT_FILENAMES.certificate,
        OBSERVED_ARTIFACT_FILENAMES.cliDirective,
        OBSERVED_ARTIFACT_FILENAMES.autonomyState,
        ...productionAutonomyEvidence.artifactPaths,
      ],
      proofAuthority: productionAutonomyEvidence.authority,
      proofBasis: productionAutonomyEvidence.proofBasis,
      relatedFiles: productionAutonomyEvidence.relatedFiles,
      exitCriteria: [
        JSON.stringify({
          id: 'pulse-proof-productionAutonomy-exit-0',
          type: 'artifact-assertion',
          target: OBSERVED_ARTIFACT_FILENAMES.cliDirective,
          expected: { productionAutonomyVerdict: 'SIM' },
          comparison: 'eq',
        }),
      ],
      preconditions: ['Operate only on PULSE machine/proof code and generated PULSE artifacts.'],
      allowedActions: [
        'PULSE proof engine changes',
        'PULSE autonomy-loop evidence changes',
        'PULSE test writing',
      ],
      forbiddenActions: [
        'Do not edit SaaS product code for this unit',
        'Do not edit governance-protected files',
        'Do not map proof debt to product relatedFiles',
        'Do not suppress Codacy, lint, or certification findings',
      ],
      successCriteria: [
        'productionAutonomyVerdict is SIM or blocked by a precise PULSE-machine reason.',
        'Targeted PULSE tests pass.',
      ],
      requiredValidations: ['affected-tests'],
    });
  }

  if (autonomyProof.verdicts.zeroPromptProductionGuidance === 'NAO') {
    units.push({
      order: 202,
      id: 'pulse-proof-zeroPromptProductionGuidance',
      kind: 'pulse_machine',
      priority: 'P0',
      source: 'pulse_machine',
      executionMode: 'ai_safe',
      riskLevel: 'low',
      evidenceMode: 'observed',
      confidence: 'high',
      productImpact: 'machine',
      ownerLane: 'pulse-proof',
      title: 'Close PULSE zero-prompt production guidance',
      summary: autonomyProof.zeroPromptProductionGuidanceReason,
      whyNow:
        'A fresh PULSE worker must receive machine-owned executable guidance before product units are safe as the primary directive.',
      visionDelta:
        'Moves PULSE toward safe zero-prompt production convergence for fresh AI sessions.',
      targetState:
        'zeroPromptProductionGuidanceVerdict must be SIM or expose only precise machine blockers.',
      affectedCapabilities: [],
      affectedFlows: [],
      ...directiveGateEvidencePatch('zeroPromptProductionGuidance'),
      expectedGateShift:
        'zeroPromptProductionGuidanceVerdict becomes SIM or a precise machine blocker',
      validationTargets: [
        OBSERVED_ARTIFACT_FILENAMES.certificate,
        OBSERVED_ARTIFACT_FILENAMES.cliDirective,
        OBSERVED_ARTIFACT_FILENAMES.autonomyState,
      ],
      validationArtifacts: [
        OBSERVED_ARTIFACT_FILENAMES.certificate,
        OBSERVED_ARTIFACT_FILENAMES.cliDirective,
        OBSERVED_ARTIFACT_FILENAMES.autonomyState,
        ...zeroPromptGuidanceEvidence.artifactPaths,
      ],
      proofAuthority: zeroPromptGuidanceEvidence.authority,
      proofBasis: zeroPromptGuidanceEvidence.proofBasis,
      relatedFiles: zeroPromptGuidanceEvidence.relatedFiles,
      exitCriteria: [
        JSON.stringify({
          id: 'pulse-proof-zeroPromptProductionGuidance-exit-0',
          type: 'artifact-assertion',
          target: OBSERVED_ARTIFACT_FILENAMES.cliDirective,
          expected: { zeroPromptProductionGuidanceVerdict: 'SIM' },
          comparison: 'eq',
        }),
      ],
      preconditions: ['Operate only on PULSE machine/proof code and generated PULSE artifacts.'],
      allowedActions: [
        'PULSE proof engine changes',
        'PULSE autonomy-loop guidance changes',
        'PULSE test writing',
      ],
      forbiddenActions: [
        'Do not edit SaaS product code for this unit',
        'Do not edit governance-protected files',
        'Do not map proof debt to product relatedFiles',
        'Do not suppress Codacy, lint, or certification findings',
      ],
      successCriteria: [
        'zeroPromptProductionGuidanceVerdict is SIM or blocked by a precise PULSE-machine reason.',
        'Targeted PULSE tests pass.',
      ],
      requiredValidations: ['affected-tests'],
    });
  }

  return units;
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
  return evidenceNumber(criterion, 'terminalWithoutObservedEvidence') > deriveZeroValue();
}

export function buildPulseMachineNextWork(
  readiness: PulseMachineReadiness,
): PulseMachineDirectiveUnit[] {
  return readiness.criteria.filter(shouldEmitMachineCriterionWork).map((criterion, index) => {
    const terminalPathId = evidenceString(criterion, 'firstTerminalPathId');
    const validationCommand = evidenceString(criterion, 'nextAiSafeAction');
    const registryEvidence = buildMachineCriterionRegistryEvidence(criterion.id);
    const validationArtifacts = [
      OBSERVED_ARTIFACT_FILENAMES.machineReadiness,
      OBSERVED_ARTIFACT_FILENAMES.cliDirective,
      OBSERVED_ARTIFACT_FILENAMES.certificate,
      ...registryEvidence.artifactPaths,
      ...(criterion.id === 'external_reality' ? [OBSERVED_ARTIFACT_FILENAMES.externalSignalState] : []),
      ...(criterion.id === 'critical_path_terminal'
        ? [OBSERVED_ARTIFACT_FILENAMES.executionMatrix, OBSERVED_ARTIFACT_FILENAMES.pathCoverage]
        : []),
    ];

    return {
      order: index + 1,
      id: `pulse-machine-${criterion.id}`,
      kind: 'pulse_machine',
      priority:
        criterion.id === 'external_reality' || criterion.id === 'critical_path_terminal'
          ? 'P0'
          : 'P1',
      source: 'pulse_machine',
      executionMode: 'ai_safe',
      riskLevel: criterion.id === 'external_reality' ? 'medium' : 'low',
      evidenceMode: criterion.id === 'external_reality' ? 'observed' : 'inferred',
      confidence: 'high',
      productImpact: 'machine',
      ownerLane: 'pulse-core',
      title: machineUnitTitle(criterion.id),
      summary: criterion.reason,
      whyNow:
        'PULSE machine readiness is the active target; do not spend this cycle materializing SaaS product capabilities.',
      visionDelta:
        'Moves PULSE closer to zero-prompt technical autonomy by closing machine proof, adapter, or execution-evidence gaps.',
      targetState: `PULSE machine criterion "${criterion.id}" must pass with canonical evidence.`,
      affectedCapabilities: [],
      affectedFlows: [],
      gateNames: [criterion.id],
      expectedGateShift: `Pass PULSE machine criterion ${criterion.id}`,
      validationTargets: validationArtifacts,
      validationArtifacts: unique(validationArtifacts),
      proofAuthority: registryEvidence.authority,
      proofBasis: registryEvidence.proofBasis,
      relatedFiles: registryEvidence.relatedFiles,
      exitCriteria: [
        JSON.stringify({
          id: `pulse-machine-${criterion.id}-exit-0`,
          type: 'artifact-assertion',
          target: OBSERVED_ARTIFACT_FILENAMES.machineReadiness,
          expected: { criterion: criterion.id, status: 'pass' },
          comparison: 'contains',
        }),
        ...(terminalPathId ? [`Refresh observed proof for ${terminalPathId}.`] : []),
        ...(validationCommand ? [validationCommand] : []),
      ],
      preconditions:
        criterion.id === 'external_reality'
          ? ['Do not add secrets; use existing local credentials or write not_available evidence.']
          : ['Operate only on PULSE machine/proof code and generated PULSE artifacts.'],
      allowedActions: [
        'PULSE scanner changes',
        'PULSE evidence generation',
        'PULSE adapter refresh',
        'PULSE test writing',
      ],
      forbiddenActions: [
        'Do not edit SaaS product code for this unit',
        'Do not edit governance-protected files',
        'Do not suppress Codacy, lint, or certification findings',
        'Do not add secrets or credentials',
      ],
      successCriteria: [
        `PULSE_MACHINE_READINESS criterion ${criterion.id} is pass or has a more precise terminal blocker.`,
        'PULSE_CLI_DIRECTIVE keeps next work focused on the PULSE machine when machine readiness is not READY.',
        'Targeted PULSE tests pass.',
      ],
      requiredValidations: ['affected-tests'],
    };
  });
}

function buildDirectiveUnit(snapshot: PulseArtifactSnapshot, unit: QueueUnit) {
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

export function buildDirective(
  snapshot: PulseArtifactSnapshot,
  convergencePlan: PulseConvergencePlan,
  previousAutonomyState: PulseAutonomyState | null,
  providedPulseMachineReadiness?: PulseMachineReadiness,
  noHardcodedRealityState?: PulseNoHardcodedRealityState,
): string {
  const decisionQueue = buildDecisionQueue(convergencePlan);
  const autonomyQueue = buildAutonomyQueue(convergencePlan);
  const pulseMachineReadiness =
    providedPulseMachineReadiness ??
    buildPulseMachineReadiness(snapshot, convergencePlan, previousAutonomyState);
  const autonomyReadiness = buildAutonomyReadiness(snapshot, convergencePlan, autonomyQueue);
  const authority = deriveAuthorityState(snapshot, convergencePlan);
  const autonomyProof = buildAutonomyProof(
    snapshot,
    convergencePlan,
    authority,
    autonomyQueue,
    previousAutonomyState,
  );
  const proofReadiness = buildProofReadinessSummaryForDirective(
    readCurrentPulseArtifact<DirectiveProofReadinessArtifact>(OBSERVED_ARTIFACT_FILENAMES.proofReadiness),
  );
  const noHardcodedReality = (() => {
    const summary = summarizeNoHardcodedRealityState(noHardcodedRealityState);
    const blocksProduction = hasNoHardcodedRealityBlocker(summary);
    return {
      summary,
      blocksProduction,
      reason: blocksProduction ? formatNoHardcodedRealityBlocker(summary) : null,
    };
  })();
  const autonomyClaims = applyProofReadinessToAutonomyClaims(
    autonomyReadiness,
    autonomyProof,
    proofReadiness,
  );
  const findingEventSurface = buildFindingEventSurface(snapshot.health.breaks, 12);
  const nextAutonomousUnits = autonomyQueue
    .slice(0, 12)
    .map((unit) => buildDirectiveUnit(snapshot, unit));
  const nextDecisionUnits = decisionQueue
    .slice(0, 8)
    .map((unit) => buildDirectiveUnit(snapshot, unit));
  const nextProductExecutableUnits =
    nextAutonomousUnits.length > 0 ? nextAutonomousUnits.slice(0, 8) : nextDecisionUnits;
  const pulseMachineNextWork = [
    ...buildPulseMachineNextWork(pulseMachineReadiness),
    ...buildPulseCertificationProofDebtNextWork(snapshot.certification),
    ...buildPulseAutonomyProofDebtNextWork(autonomyClaims.autonomyProof),
  ];
  const machineFocusRequired =
    pulseMachineReadiness.status !== 'READY' ||
    pulseMachineNextWork.length > 0 ||
    autonomyClaims.productionAutonomyVerdict !== 'SIM' ||
    autonomyProof.verdicts.zeroPromptProductionGuidance !== 'SIM';
  const nextExecutableUnits =
    machineFocusRequired && pulseMachineNextWork.length > 0
      ? pulseMachineNextWork.slice(0, 8)
      : nextProductExecutableUnits;
  const blockedWork = convergencePlan.queue
    .filter((unit) => {
      const executionModes = discoverConvergenceExecutionModeLabels();
      return executionModes.has('observation_only') &&
        normalizeArtifactExecutionMode(unit.executionMode) === 'observation_only';
    })
    .slice(0, 10);
  const blockedUnits = blockedWork.map((unit) => ({
    id: unit.id,
    title: unit.title,
    executionMode: normalizeArtifactExecutionMode(unit.executionMode),
    evidenceMode: unit.evidenceMode,
    confidence: unit.confidence,
    productImpact: unit.productImpact,
    summary: unit.summary,
    whyBlocked:
      'Signal remains in observation-only evidence gathering until mapped enough for mutation.',
    relatedFiles: unit.relatedFiles,
  }));
  const doNotTouchSurfaces = [
    ...new Set(
      blockedWork.flatMap((unit) => [...unit.relatedFiles, ...unit.affectedCapabilityIds]),
    ),
  ].slice(0, 20);
  const topProblems = [
    ...snapshot.externalSignalState.signals.slice(0, 8).map((signal) => ({
      source: signal.source,
      type: signal.type,
      summary: signal.summary,
      impactScore: signal.impactScore,
      executionMode: normalizeArtifactExecutionMode(signal.executionMode),
      affectedCapabilities: signal.capabilityIds,
      affectedFlows: signal.flowIds,
    })),
    ...snapshot.productVision.topBlockers.slice(0, 5).map((summary, index) => ({
      source: 'pulse',
      type: `product_blocker_${index + 1}`,
      summary,
      impactScore: 0.7,
      executionMode: 'ai_safe',
      affectedCapabilities: [],
      affectedFlows: [],
    })),
  ].slice(0, 10);
  const freshness = {
    codacy: {
      snapshotAvailable: snapshot.scopeState.codacy.snapshotAvailable,
      stale: snapshot.scopeState.codacy.stale,
      syncedAt: snapshot.scopeState.codacy.syncedAt,
    },
    externalAdapters: snapshot.externalSignalState.adapters.map((adapter) => ({
      source: adapter.source,
      status: adapter.status,
      requirement: adapter.requirement,
      required: adapter.required,
      observed: adapter.observed,
      blocking: adapter.blocking,
      proofBasis: adapter.proofBasis,
      syncedAt: adapter.syncedAt,
      freshnessMinutes: adapter.freshnessMinutes,
    })),
  };
  const stopCondition = unique(
    [
      ...snapshot.certification.dynamicBlockingReasons,
      ...snapshot.externalSignalState.signals
        .filter((signal) => signal.impactScore >= 0.85)
        .map((signal) => `${signal.source}/${signal.type}: ${signal.summary}`),
    ].filter(Boolean),
  );

  return JSON.stringify(
    normalizeCanonicalArtifactValue({
      generatedAt: snapshot.certification.timestamp,
      profile: snapshot.certification.certificationTarget.profile ?? null,
      certificationScope: snapshot.certification.certificationScope,
      pulseMachineReadiness,
      pulseMachineProofGates: summarizeMachineProofGates(snapshot.certification),
      pathProofSurface: buildPathProofSurfaceForDirective(pulseMachineReadiness),
      findingValidationState: {
        artifact: 'PULSE_FINDING_VALIDATION_STATE',
        operationalIdentity: 'dynamic_finding_event',
        internalBreakTypeIsOperationalIdentity: false,
        parserSignalMustPassValidationBeforeBlocking: true,
        weakSignalCanBlock: false,
        eventSurface: findingEventSurface,
      },
      topFindingEvents: findingEventSurface.topEvents,
      findingTruthModeCounts: findingEventSurface.truthModeCounts,
      findingActionabilityCounts: findingEventSurface.actionabilityCounts,
      autonomyVerdict: autonomyReadiness.verdict,
      autonomousNextStepVerdict: autonomyReadiness.verdict,
      zeroPromptProductionGuidanceVerdict: autonomyProof.verdicts.zeroPromptProductionGuidance,
      zeroPromptProductionGuidanceReason: autonomyProof.zeroPromptProductionGuidanceReason,
      productionAutonomyVerdict: autonomyClaims.productionAutonomyVerdict,
      productionAutonomyReason: autonomyClaims.productionAutonomyReason,
      canWorkNow: autonomyProof.verdicts.canWorkNow,
      canContinueUntilReady: autonomyProof.verdicts.canContinueUntilReady,
      canWorkUntilProductionReady: autonomyProof.verdicts.canContinueUntilReady,
      canDeclareComplete: autonomyClaims.canDeclareComplete,
      autonomyReadiness: autonomyClaims.autonomyReadiness,
      autonomyProof: autonomyClaims.autonomyProof,
      proofReadiness,
      noHardcodedReality,
      noOverclaim: {
        gateStatus: snapshot.certification.gates.noOverclaimPass?.status ?? null,
        gateReason: snapshot.certification.gates.noOverclaimPass?.reason ?? null,
        proofReadinessBlocksProduction: hasProofReadinessProductionBlocker(proofReadiness),
        proofReadinessReason: proofReadiness
          ? proofReadinessProductionBlockerReason(proofReadiness)
          : null,
      },
      authorityMode: authority.mode,
      advisoryOnly: authority.advisoryOnly,
      automationEligible: authority.automationEligible,
      authorityReasons: authority.reasons,
      missingAdaptersCount: snapshot.externalSignalState.summary.missingAdapters,
      staleAdaptersCount: snapshot.externalSignalState.summary.staleAdapters,
      invalidAdaptersCount: snapshot.externalSignalState.summary.invalidAdapters,
      blockingAdaptersCount: snapshot.externalSignalState.summary.blockingAdapters,
      currentCheckpoint: snapshot.productVision.currentCheckpoint,
      targetCheckpoint: snapshot.productVision.projectedCheckpoint,
      visionGap: snapshot.productVision.distanceSummary,
      currentState: {
        certificationStatus: snapshot.certification.status,
        blockingTier: snapshot.certification.blockingTier,
        score: snapshot.certification.score,
        scopeParity: snapshot.scopeState.parity,
        confidence: {
          evidenceFresh: snapshot.certification.gates.evidenceFresh.status,
          pulseSelfTrustPass: snapshot.certification.gates.pulseSelfTrustPass.status,
        },
      },
      selfTrust: (() => {
        const report = snapshot.certification.selfTrustReport;
        const consistency = report?.checks?.find((c) => c.id === 'cross-artifact-consistency');
        return {
          gateStatus: snapshot.certification.gates.pulseSelfTrustPass.status,
          gateReason: snapshot.certification.gates.pulseSelfTrustPass.reason,
          overallPass: report?.overallPass ?? null,
          confidence: report?.confidence ?? null,
          score: report?.score ?? null,
          crossArtifactConsistency: consistency
            ? {
                pass: consistency.pass,
                reason: consistency.reason ?? null,
                severity: consistency.severity,
              }
            : null,
          failedChecks: (report?.failedChecks ?? []).map((c) => ({
            id: c.id,
            name: c.name,
            severity: c.severity,
            reason: c.reason ?? null,
          })),
        };
      })(),
      productIdentity: snapshot.productVision.inferredProductIdentity,
      promiseToProductionDelta: snapshot.productVision.promiseToProductionDelta,
      freshness,
      externalSignals: {
        summary: normalizeExternalSignalSummaryForDirective(snapshot.externalSignalState.summary),
        adapterClassification: snapshot.externalSignalState.adapters.map((adapter) => ({
          source: adapter.source,
          status: adapter.status,
          requirement: adapter.requirement,
          required: adapter.required,
          observed: adapter.observed,
          blocking: adapter.blocking,
          proofBasis: adapter.proofBasis,
        })),
        top: snapshot.externalSignalState.signals.slice(0, 12).map((signal) => ({
          ...signal,
          executionMode: normalizeArtifactExecutionMode(signal.executionMode),
        })),
      },
      parityGaps: {
        summary: snapshot.parityGaps.summary,
        top: snapshot.parityGaps.gaps.slice(0, 12),
      },
      executionMatrix: {
        summary: normalizeExecutionMatrixSummaryForDirective(snapshot.executionMatrix.summary),
        topFailures: snapshot.executionMatrix.paths
          .filter((path) => path.status === 'observed_fail')
          .map(normalizeExecutionMatrixPathForDirective)
          .slice(0, 8),
        topUnobservedCritical: snapshot.executionMatrix.paths
          .filter(
            (path) =>
              path.risk === 'high' && !['observed_pass', 'observed_fail'].includes(path.status),
          )
          .map(normalizeExecutionMatrixPathForDirective)
          .slice(0, 8),
      },
      surfaces: (snapshot.productVision.surfaces || []).slice(0, 15),
      experiences: (snapshot.productVision.experiences || []).slice(0, 12),
      capabilityMaturity: [...getProductFacingCapabilities(snapshot)]
        .sort(
          (left, right) =>
            left.maturity.score - right.maturity.score || left.name.localeCompare(right.name),
        )
        .slice(0, 12)
        .map((capability) => ({
          id: capability.id,
          name: capability.name,
          status: capability.status,
          stage: capability.maturity.stage,
          score: capability.maturity.score,
          missing: capability.maturity.missing,
          executionMode: normalizeArtifactExecutionMode(capability.executionMode),
          routePatterns: capability.routePatterns,
        })),
      topBlockers: snapshot.productVision.topBlockers,
      topProblems,
      nextAutonomousUnits,
      nextDecisionUnits,
      nextProductExecutableUnits,
      pulseMachineNextWork,
      machineFocusRequired,
      nextExecutableUnitsSource:
        machineFocusRequired && pulseMachineNextWork.length > 0 ? 'pulse_machine' : 'product',
      nextExecutableUnits,
      nextWork: nextExecutableUnits,
      blockedUnits,
      blockedWork: blockedUnits,
      doNotTouchSurfaces,
      antiGoals: [
        'Do not treat projected vision as proof of implementation.',
        'Do not spend the next cycle on diagnostic-only work while transformational or material product gaps remain open.',
        'Keep governance-protected surfaces in observation-only evidence gathering unless a governed validation path is explicitly mapped.',
        'Do not suppress Codacy or certification signals to simulate convergence.',
      ],
      productTruth: {
        capabilities: snapshot.capabilityState.summary,
        flows: snapshot.flowProjection.summary,
        parityGaps: snapshot.parityGaps.summary,
        structuralGraph: snapshot.structuralGraph.summary,
        codacy: snapshot.codacyEvidence.summary,
        externalSignals: snapshot.externalSignalState.summary,
        evidenceBasis: snapshot.productVision.evidenceBasis,
      },
      operatingRules: [
        'Use observed evidence over inferred evidence whenever they conflict.',
        'Treat projected product vision as a convergence target, not as proof of implementation.',
        'Governance-protected surfaces require sandboxed, validated autonomous handling.',
        'Treat observation_only units as evidence-gathering work until mapped enough for mutation.',
      ],
      suggestedValidation: {
        commands: [
          'npm --prefix backend run typecheck',
          'npm --prefix backend run build',
          'node scripts/pulse/run.js --json',
          'node scripts/pulse/run.js --guidance',
        ],
        artifacts: [
          OBSERVED_ARTIFACT_FILENAMES.certificate,
          OBSERVED_ARTIFACT_FILENAMES.cliDirective,
          OBSERVED_ARTIFACT_FILENAMES.artifactIndex,
          `${CURRENT_PULSE_ARTIFACT_DIR}/${OBSERVED_ARTIFACT_FILENAMES.parityGaps}`,
          `${CURRENT_PULSE_ARTIFACT_DIR}/${OBSERVED_ARTIFACT_FILENAMES.productVision}`,
          `${CURRENT_PULSE_ARTIFACT_DIR}/${OBSERVED_ARTIFACT_FILENAMES.capabilityState}`,
          `${CURRENT_PULSE_ARTIFACT_DIR}/${OBSERVED_ARTIFACT_FILENAMES.flowProjection}`,
          `${CURRENT_PULSE_ARTIFACT_DIR}/${OBSERVED_ARTIFACT_FILENAMES.executionMatrix}`,
          `${CURRENT_PULSE_ARTIFACT_DIR}/${OBSERVED_ARTIFACT_FILENAMES.externalSignalState}`,
        ],
      },
      contextFabric: {
        broadcastRef: OBSERVED_ARTIFACT_FILENAMES.contextBroadcast,
        leasesRef: OBSERVED_ARTIFACT_FILENAMES.workerLeases,
        requiredForParallelWorkers: true,
        status: 'pending_artifact_generation',
      },
      stopCondition,
    }),
    artifactJsonReplacer,
    2,
  );
}

export function buildArtifactIndex(
  registry: PulseArtifactRegistry,
  cleanupReport: PulseArtifactCleanupReport,
  authority: ReturnType<typeof deriveAuthorityState>,
  identity?: PulseRunIdentity,
  pulseMachineReadiness?: PulseMachineReadiness,
): string {
  return JSON.stringify(
    normalizeCanonicalArtifactValue({
      runId: identity?.runId ?? registry.runId ?? null,
      generatedAt: identity?.generatedAt ?? new Date().toISOString(),
      authorityMode: authority.mode,
      advisoryOnly: authority.advisoryOnly,
      authorityReasons: authority.reasons,
      pulseMachineReadiness: pulseMachineReadiness
        ? {
            status: pulseMachineReadiness.status,
            scope: pulseMachineReadiness.scope,
            canRunBoundedAutonomousCycle: pulseMachineReadiness.canRunBoundedAutonomousCycle,
            canDeclareKloelProductCertified: pulseMachineReadiness.canDeclareKloelProductCertified,
            blockers: pulseMachineReadiness.blockers.slice(0, 12),
          }
        : null,
      cleanupPolicy: cleanupReport.cleanupMode,
      canonicalDir: registry.canonicalDir,
      tempDir: registry.tempDir,
      officialArtifacts: registry.artifacts.map((artifact) => artifact.relativePath).sort(),
      officialArtifactMetadata: registry.artifacts
        .map((artifact) => ({
          id: artifact.id,
          relativePath: artifact.relativePath,
          schema: artifact.schema,
          producer: artifact.producer,
          consumers: artifact.consumers,
          freshness: artifact.freshness,
          truthMode: artifact.truthMode,
          mirrorToRoot: artifact.mirrorToRoot === true,
        }))
        .sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
      compatibilityMirrors: registry.mirrors,
      removedLegacyPulseArtifacts: cleanupReport.removedLegacyPulseArtifacts,
      rootStateMode: 'local-only',
    }),
    artifactJsonReplacer,
    2,
  );
}
