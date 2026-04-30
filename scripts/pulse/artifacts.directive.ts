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

const CURRENT_PULSE_ARTIFACT_DIR = '.pulse/current';
const PATH_PROOF_TASKS_ARTIFACT = 'PULSE_PATH_PROOF_TASKS.json';
const PATH_COVERAGE_ARTIFACT = 'PULSE_PATH_COVERAGE.json';

const WEAK_COMPAT_MACHINE_PROOF_DEBT_FILES = [
  'scripts/pulse/artifacts.autonomy.ts',
  'scripts/pulse/artifacts.directive.ts',
  'scripts/pulse/autonomy-loop.ts',
  'scripts/pulse/cert-gate-multi-cycle.ts',
];

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

function machineUnitTitle(criterionId: string): string {
  if (criterionId === 'external_reality') {
    return 'Close PULSE external-reality adapters';
  }
  if (criterionId === 'critical_path_terminal') {
    return 'Convert terminal critical paths into observed proof';
  }
  if (criterionId === 'artifact_consistency') {
    return 'Repair PULSE cross-artifact consistency';
  }
  if (criterionId === 'execution_matrix') {
    return 'Complete PULSE execution matrix classification';
  }
  if (criterionId === 'breakpoint_precision') {
    return 'Repair PULSE breakpoint precision';
  }
  if (criterionId === 'self_trust') {
    return 'Repair PULSE self-trust';
  }
  if (criterionId === 'multi_cycle') {
    return 'Prove non-regressing autonomous PULSE cycles';
  }
  return 'Restore bounded PULSE autonomous execution';
}

function machineUnitFiles(criterionId: string): string[] {
  if (criterionId === 'external_reality') {
    return [
      'scripts/pulse/adapters/external-sources-orchestrator.ts',
      'scripts/pulse/external-signals.ts',
      'scripts/pulse/runtime-fusion.ts',
    ];
  }
  if (criterionId === 'critical_path_terminal' || criterionId === 'execution_matrix') {
    return [
      'scripts/pulse/execution-matrix.ts',
      'scripts/pulse/path-coverage-engine.ts',
      'scripts/pulse/execution-observation.ts',
    ];
  }
  if (criterionId === 'artifact_consistency' || criterionId === 'self_trust') {
    return [
      'scripts/pulse/cross-artifact-consistency-check.ts',
      'scripts/pulse/self-trust.ts',
      'scripts/pulse/artifacts.directive.ts',
    ];
  }
  if (criterionId === 'multi_cycle') {
    return [
      'scripts/pulse/autonomy-loop.ts',
      'scripts/pulse/cert-gate-multi-cycle.ts',
      'scripts/pulse/artifacts.autonomy.ts',
    ];
  }
  return ['scripts/pulse/artifacts.report.ts', 'scripts/pulse/artifacts.directive.ts'];
}

function machineProofGateTitle(gateName: PulseGateName): string {
  if (gateName === 'runtimePass') return 'Make PULSE runtime proof executable';
  if (gateName === 'performancePass') return 'Make PULSE performance proof executable';
  if (gateName === 'observabilityPass') return 'Make PULSE observability proof executable';
  if (gateName === 'customerPass') return 'Make PULSE customer scenarios observed';
  if (gateName === 'operatorPass') return 'Make PULSE operator scenarios observed';
  if (gateName === 'adminPass') return 'Make PULSE admin scenarios observed';
  if (gateName === 'soakPass') return 'Make PULSE soak scenarios observed';
  if (gateName === 'syntheticCoveragePass') return 'Close PULSE synthetic coverage proof';
  if (gateName === 'truthExtractionPass') return 'Close PULSE truth extraction proof debt';
  if (gateName === 'criticalPathObservedPass') return 'Observe PULSE critical paths';
  if (gateName === 'executionMatrixCompletePass') return 'Complete PULSE execution matrix proof';
  if (gateName === 'breakpointPrecisionPass') return 'Sharpen PULSE breakpoint proof';
  if (gateName === 'multiCycleConvergencePass') return 'Prove PULSE multi-cycle convergence';
  if (gateName === 'pulseSelfTrustPass') return 'Repair PULSE self-trust proof';
  if (gateName === 'noOverclaimPass') return 'Repair PULSE no-overclaim proof';
  return `Repair PULSE proof gate ${gateName}`;
}

type MachineProofRegistryEvidence = {
  authority: 'artifact_registry' | 'weak_compat_fallback';
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

function buildMachineProofRegistryEvidence(
  gateName: PulseGateName,
  registry: PulseArtifactRegistry = buildArtifactRegistry(process.cwd()),
): MachineProofRegistryEvidence {
  const tokens = tokenizeGateName(gateName);
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
    authority: 'weak_compat_fallback',
    artifactPaths: [],
    relatedFiles: WEAK_COMPAT_MACHINE_PROOF_DEBT_FILES,
    proofBasis: [
      `weak compat fallback: no registry artifact producer/consumer/freshness evidence matched ${gateName}`,
    ],
  };
}

function isMachineProofGate(gateName: PulseGateName, gate: PulseGateResult): boolean {
  if (gate.status !== 'fail') {
    return false;
  }
  return gate.failureClass === 'missing_evidence' || gate.failureClass === 'checker_gap';
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
      'PULSE_CERTIFICATE.json',
      'PULSE_CLI_DIRECTIVE.json',
      'PULSE_MACHINE_READINESS.json',
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
            target: 'PULSE_CERTIFICATE.json',
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
      gateNames: ['productionAutonomy'],
      expectedGateShift: 'productionAutonomyVerdict becomes SIM or a precise machine blocker',
      validationTargets: [
        'PULSE_CERTIFICATE.json',
        'PULSE_CLI_DIRECTIVE.json',
        'PULSE_AUTONOMY_STATE.json',
      ],
      validationArtifacts: [
        'PULSE_CERTIFICATE.json',
        'PULSE_CLI_DIRECTIVE.json',
        'PULSE_AUTONOMY_STATE.json',
      ],
      relatedFiles: WEAK_COMPAT_MACHINE_PROOF_DEBT_FILES,
      exitCriteria: [
        JSON.stringify({
          id: 'pulse-proof-productionAutonomy-exit-0',
          type: 'artifact-assertion',
          target: 'PULSE_CLI_DIRECTIVE.json',
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
      gateNames: ['zeroPromptProductionGuidance'],
      expectedGateShift:
        'zeroPromptProductionGuidanceVerdict becomes SIM or a precise machine blocker',
      validationTargets: [
        'PULSE_CERTIFICATE.json',
        'PULSE_CLI_DIRECTIVE.json',
        'PULSE_AUTONOMY_STATE.json',
      ],
      validationArtifacts: [
        'PULSE_CERTIFICATE.json',
        'PULSE_CLI_DIRECTIVE.json',
        'PULSE_AUTONOMY_STATE.json',
      ],
      relatedFiles: WEAK_COMPAT_MACHINE_PROOF_DEBT_FILES,
      exitCriteria: [
        JSON.stringify({
          id: 'pulse-proof-zeroPromptProductionGuidance-exit-0',
          type: 'artifact-assertion',
          target: 'PULSE_CLI_DIRECTIVE.json',
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
  return evidenceNumber(criterion, 'terminalWithoutObservedEvidence') > 0;
}

export function buildPulseMachineNextWork(
  readiness: PulseMachineReadiness,
): PulseMachineDirectiveUnit[] {
  return readiness.criteria.filter(shouldEmitMachineCriterionWork).map((criterion, index) => {
    const terminalPathId = evidenceString(criterion, 'firstTerminalPathId');
    const validationCommand = evidenceString(criterion, 'nextAiSafeAction');
    const validationArtifacts = [
      'PULSE_MACHINE_READINESS.json',
      'PULSE_CLI_DIRECTIVE.json',
      'PULSE_CERTIFICATE.json',
      ...(criterion.id === 'external_reality' ? ['PULSE_EXTERNAL_SIGNAL_STATE.json'] : []),
      ...(criterion.id === 'critical_path_terminal'
        ? ['PULSE_EXECUTION_MATRIX.json', 'PULSE_PATH_COVERAGE.json']
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
      validationArtifacts,
      relatedFiles: machineUnitFiles(criterion.id),
      exitCriteria: [
        JSON.stringify({
          id: `pulse-machine-${criterion.id}-exit-0`,
          type: 'artifact-assertion',
          target: 'PULSE_MACHINE_READINESS.json',
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
    ...buildPulseAutonomyProofDebtNextWork(autonomyProof),
  ];
  const machineFocusRequired =
    pulseMachineReadiness.status !== 'READY' ||
    pulseMachineNextWork.length > 0 ||
    autonomyProof.verdicts.productionAutonomy !== 'SIM' ||
    autonomyProof.verdicts.zeroPromptProductionGuidance !== 'SIM';
  const nextExecutableUnits =
    machineFocusRequired && pulseMachineNextWork.length > 0
      ? pulseMachineNextWork.slice(0, 8)
      : nextProductExecutableUnits;
  const blockedWork = convergencePlan.queue
    .filter((unit) => normalizeArtifactExecutionMode(unit.executionMode) === 'observation_only')
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
      productionAutonomyVerdict: autonomyProof.verdicts.productionAutonomy,
      productionAutonomyReason: autonomyProof.productionAutonomyReason,
      canWorkNow: autonomyProof.verdicts.canWorkNow,
      canContinueUntilReady: autonomyProof.verdicts.canContinueUntilReady,
      canWorkUntilProductionReady: autonomyProof.verdicts.canContinueUntilReady,
      canDeclareComplete: autonomyProof.verdicts.canDeclareComplete,
      autonomyReadiness,
      autonomyProof,
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
          'PULSE_CERTIFICATE.json',
          'PULSE_CLI_DIRECTIVE.json',
          'PULSE_ARTIFACT_INDEX.json',
          '.pulse/current/PULSE_PARITY_GAPS.json',
          '.pulse/current/PULSE_PRODUCT_VISION.json',
          '.pulse/current/PULSE_CAPABILITY_STATE.json',
          '.pulse/current/PULSE_FLOW_PROJECTION.json',
          '.pulse/current/PULSE_EXECUTION_MATRIX.json',
          '.pulse/current/PULSE_EXTERNAL_SIGNAL_STATE.json',
        ],
      },
      contextFabric: {
        broadcastRef: 'PULSE_CONTEXT_BROADCAST.json',
        leasesRef: 'PULSE_WORKER_LEASES.json',
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
