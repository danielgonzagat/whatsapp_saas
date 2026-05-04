import type { PulseConvergenceUnit, PulseGateFailureClass, PulseGateName } from '../../types';
import type { BuildPulseConvergencePlanInput } from './types';
import {
  isBlockingBreak,
  isSecurityBreak,
  rankBreakTypes,
  rankFiles,
  uniqueStrings,
  compactText,
  determineUnitStatus,
} from './helpers';
import {
  formatNoHardcodedRealityBlocker,
  hasNoHardcodedRealityBlocker,
  summarizeNoHardcodedRealityState,
} from '../../no-hardcoded-reality-state';
import { gateNamesForResult, relatedFailedGateNames } from './scenario-evidence';
import { OBSERVED_ARTIFACTS } from './state';

export function buildSecurityUnit(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
  if (input.certification.gates.securityPass.status !== 'fail') {
    return [];
  }

  let securityBreaks = input.health.breaks.filter(
    (item) => isBlockingBreak(item) && isSecurityBreak(item),
  );
  let gate = input.certification.gates.securityPass;
  let failureClass: PulseConvergenceUnit['failureClass'] = gate.failureClass ?? 'product_failure';
  let gateNames = gateNamesForResult(input.certification, gate);

  return [
    {
      id: 'gate-security-pass',
      order: 0,
      priority: 'P2',
      kind: 'security',
      status: determineUnitStatus(failureClass),
      source: 'pulse',
      executionMode: 'ai_safe',
      ownerLane: 'security',
      riskLevel: 'critical',
      evidenceMode: 'observed',
      confidence: 'high',
      productImpact: 'enabling',
      title: 'Clear Blocking Security And Compliance Findings',
      summary: compactText(
        [
          gate.reason,
          securityBreaks.length > 0
            ? `Top blocking events: ${rankBreakTypes(securityBreaks).join(', ')}.`
            : '',
        ]
          .filter(Boolean)
          .join(' '),
        320,
      ),
      visionDelta:
        'Removes blocking security and compliance risk so the projected product can converge without opening unsafe production paths.',
      targetState:
        'Security gate must pass with no blocking compliance, auth, cookie, secret, or sensitive-data findings.',
      failureClass,
      actorKinds: [],
      gateNames,
      scenarioIds: [],
      moduleKeys: [],
      routePatterns: [],
      flowIds: [],
      affectedCapabilityIds: [],
      affectedFlowIds: [],
      asyncExpectations: [],
      breakTypes: rankBreakTypes(securityBreaks, 8),
      artifactPaths: [OBSERVED_ARTIFACTS.certificate, OBSERVED_ARTIFACTS.report],
      relatedFiles: rankFiles(securityBreaks, 12),
      validationArtifacts: [OBSERVED_ARTIFACTS.certificate, OBSERVED_ARTIFACTS.report],
      expectedGateShift: 'Pass securityPass',
      exitCriteria: uniqueStrings([
        'securityPass returns pass in the next certification run.',
        securityBreaks.length > 0
          ? `Blocking security events are cleared: ${rankBreakTypes(securityBreaks, 8).join(', ')}.`
          : null,
      ]),
    },
  ];
}

export function buildStaticUnit(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
  if (input.certification.gates.staticPass.status !== 'fail') {
    return [];
  }

  let blockingBreaks = input.health.breaks.filter(
    (item) => isBlockingBreak(item) && !isSecurityBreak(item),
  );
  if (blockingBreaks.length === 0) {
    return [];
  }

  let gate = input.certification.gates.staticPass;
  let failureClass: PulseConvergenceUnit['failureClass'] = gate.failureClass ?? 'product_failure';
  let gateNames = gateNamesForResult(input.certification, gate);

  return [
    {
      id: 'gate-static-pass',
      order: 0,
      priority: 'P3',
      kind: 'static',
      status: determineUnitStatus(failureClass),
      source: 'pulse',
      executionMode: 'ai_safe',
      ownerLane: 'platform',
      riskLevel: 'medium',
      evidenceMode: 'observed',
      confidence: 'high',
      productImpact: 'diagnostic',
      title: 'Reduce Remaining Static Critical And High Breakers',
      summary: compactText(
        [gate.reason, `Top structural events: ${rankBreakTypes(blockingBreaks).join(', ')}.`].join(
          ' ',
        ),
        320,
      ),
      visionDelta:
        'Reduces remaining static blockers so higher-value product and runtime work can converge without recurring structural noise.',
      targetState:
        'Static certification should have no remaining critical/high blockers outside the scenario and security queues.',
      failureClass,
      actorKinds: [],
      gateNames,
      scenarioIds: [],
      moduleKeys: [],
      routePatterns: [],
      flowIds: [],
      affectedCapabilityIds: [],
      affectedFlowIds: [],
      asyncExpectations: [],
      breakTypes: rankBreakTypes(blockingBreaks, 10),
      artifactPaths: [OBSERVED_ARTIFACTS.certificate, OBSERVED_ARTIFACTS.report],
      relatedFiles: rankFiles(blockingBreaks, 15),
      validationArtifacts: [OBSERVED_ARTIFACTS.certificate, OBSERVED_ARTIFACTS.report],
      expectedGateShift: 'Pass staticPass',
      exitCriteria: uniqueStrings([
        'staticPass returns pass in the next certification run.',
        `Blocking static break inventory reaches zero for the tracked set (${blockingBreaks.length} currently open).`,
      ]),
    },
  ];
}

export function buildNoHardcodedRealityUnits(
  input: BuildPulseConvergencePlanInput,
): PulseConvergenceUnit[] {
  let summary = summarizeNoHardcodedRealityState(input.noHardcodedRealityState);
  if (!hasNoHardcodedRealityBlocker(summary)) {
    return [];
  }
  let blockerSummary = formatNoHardcodedRealityBlocker(summary);
  let gateNames = relatedFailedGateNames(input.certification, [blockerSummary]);

  return [
    {
      id: 'pulse-no-hardcoded-reality-state',
      order: 0,
      priority: 'P0',
      kind: 'gate',
      status: 'open',
      source: 'pulse',
      executionMode: 'ai_safe',
      ownerLane: 'platform',
      riskLevel: 'high',
      evidenceMode: 'observed',
      confidence: 'high',
      productImpact: 'diagnostic',
      title: 'Remove PULSE Hardcoded Reality Authority',
      summary: compactText(blockerSummary, 320),
      visionDelta:
        'Keeps PULSE decisions grounded in discovered evidence instead of fixed product reality lists.',
      targetState: 'PULSE_NO_HARDCODED_REALITY.json reports zero dynamic hardcode evidence events.',
      failureClass: 'checker_gap',
      actorKinds: [],
      gateNames,
      scenarioIds: [],
      moduleKeys: [],
      routePatterns: [],
      flowIds: [],
      affectedCapabilityIds: [],
      affectedFlowIds: [],
      asyncExpectations: [],
      breakTypes: ['dynamic_hardcode_evidence_event'],
      artifactPaths: [OBSERVED_ARTIFACTS.noHardcodedReality, OBSERVED_ARTIFACTS.certificate],
      relatedFiles: summary.topFiles,
      validationArtifacts: [
        OBSERVED_ARTIFACTS.noHardcodedReality,
        OBSERVED_ARTIFACTS.convergencePlan,
        OBSERVED_ARTIFACTS.cliDirective,
        OBSERVED_ARTIFACTS.certificate,
      ],
      expectedGateShift: 'Pass noOverclaimPass and clear hardcoded reality state blockers',
      exitCriteria: [
        'PULSE_NO_HARDCODED_REALITY.json totalEvents equals 0.',
        'PULSE_CERTIFICATE.json noOverclaimPass returns pass for hardcoded reality state.',
      ],
    },
  ];
}
