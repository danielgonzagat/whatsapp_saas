import { unique } from '../../artifacts.io';
import { buildArtifactRegistry } from '../../artifact-registry';
import type { PulseMachineReadiness } from '../../artifacts.types';
import type { PulseGateName, PulseGateResult } from '../../types';
import {
  type PulseMachineDirectiveUnit,
  type PulseAutonomyProof,
  type MachineProofRegistryEvidence,
  isMachineProofGate,
  deriveMachineProofGateNames,
  buildMachineProofRegistryEvidence,
  buildMachineCriterionRegistryEvidence,
  buildRegistryEvidenceForDirective,
  directiveGateEvidencePatch,
  evidenceNumber,
  evidenceString,
  machineUnitTitle,
  machineProofGateTitle,
  shouldEmitMachineCriterionWork,
} from './helpers';

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
        'PULSE_CERTIFICATE.json',
        'PULSE_CLI_DIRECTIVE.json',
        'PULSE_AUTONOMY_STATE.json',
      ],
      validationArtifacts: [
        'PULSE_CERTIFICATE.json',
        'PULSE_CLI_DIRECTIVE.json',
        'PULSE_AUTONOMY_STATE.json',
        ...productionAutonomyEvidence.artifactPaths,
      ],
      proofAuthority: productionAutonomyEvidence.authority,
      proofBasis: productionAutonomyEvidence.proofBasis,
      relatedFiles: productionAutonomyEvidence.relatedFiles,
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
      ...directiveGateEvidencePatch('zeroPromptProductionGuidance'),
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
        ...zeroPromptGuidanceEvidence.artifactPaths,
      ],
      proofAuthority: zeroPromptGuidanceEvidence.authority,
      proofBasis: zeroPromptGuidanceEvidence.proofBasis,
      relatedFiles: zeroPromptGuidanceEvidence.relatedFiles,
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

export function buildPulseMachineNextWork(
  readiness: PulseMachineReadiness,
): PulseMachineDirectiveUnit[] {
  return readiness.criteria.filter(shouldEmitMachineCriterionWork).map((criterion, index) => {
    const terminalPathId = evidenceString(criterion, 'firstTerminalPathId');
    const validationCommand = evidenceString(criterion, 'nextAiSafeAction');
    const registryEvidence = buildMachineCriterionRegistryEvidence(criterion.id);
    const validationArtifacts = [
      'PULSE_MACHINE_READINESS.json',
      'PULSE_CLI_DIRECTIVE.json',
      'PULSE_CERTIFICATE.json',
      ...registryEvidence.artifactPaths,
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
      validationArtifacts: unique(validationArtifacts),
      proofAuthority: registryEvidence.authority,
      proofBasis: registryEvidence.proofBasis,
      relatedFiles: registryEvidence.relatedFiles,
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
