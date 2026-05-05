/**
 * Directive machine proof-debt work builders.
 * Exports: buildPulseCertificationProofDebtNextWork, buildPulseAutonomyProofDebtNextWork
 */
import { unique } from '../../artifacts.io';
import { deriveZeroValue } from '../../dynamic-reality-kernel';
import type { PulseAutonomyState, PulseConvergencePlan } from '../../types';
import type { PulseGateName, PulseGateResult } from '../../types';
import { buildAutonomyProof } from '../../artifacts.autonomy/__parts__/autonomy-proof';
import { OBSERVED_ARTIFACT_FILENAMES, type PulseMachineDirectiveUnit } from './directive-shared';
import {
  isMachineProofGate,
  deriveMachineProofGateNames,
  buildMachineProofRegistryEvidence,
  buildRegistryEvidenceForDirective,
  machineProofGateTitle,
} from './directive-machine-helpers';

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
    ReturnType<typeof buildAutonomyProof>,
    'verdicts' | 'productionAutonomyReason' | 'zeroPromptProductionGuidanceReason'
  >,
): PulseMachineDirectiveUnit[] {
  const units: PulseMachineDirectiveUnit[] = [];
  const registry = buildRegistryEvidenceForDirective;
  const productionAutonomyEvidence = buildRegistryEvidenceForDirective('productionAutonomy');
  const zeroPromptGuidanceEvidence = buildRegistryEvidenceForDirective(
    'zeroPromptProductionGuidance',
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
      gateNames: ['productionAutonomy'],
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
      gateNames: ['zeroPromptProductionGuidance'],
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
