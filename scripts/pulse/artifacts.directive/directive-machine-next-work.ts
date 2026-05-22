/**
 * Directive machine-next-work builder.
 * Exports: buildPulseMachineNextWork
 */
import { unique } from '../artifacts.io';
import type { PulseMachineReadiness } from '../artifacts.types';
import { OBSERVED_ARTIFACT_FILENAMES, type PulseMachineDirectiveUnit } from './directive-shared';
import {
  buildMachineCriterionRegistryEvidence,
  machineUnitTitle,
  evidenceString,
  shouldEmitMachineCriterionWork,
} from './directive-machine-helpers';

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
      ...(criterion.id === 'external_reality'
        ? [OBSERVED_ARTIFACT_FILENAMES.externalSignalState]
        : []),
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
