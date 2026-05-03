import type {
  PulseConvergenceUnit,
  PulseConvergenceUnitPriority,
  PulseConvergenceUnitStatus,
  PulseGateFailureClass,
} from '../../types';
import type { BuildPulseConvergencePlanInput } from './types';
import {
  takeEvidenceBatch,
  isSameState,
  isDifferentState,
  uniqueStrings,
  compactText,
  slugify,
  hasObservedItems,
  compareByObservedPressure,
  evidenceBatchSize,
  humanize,
} from './helpers';
import {
  confidenceFromTruthMode,
  determineParityProductImpact,
  buildParityVisionDelta,
  buildCodacyVisionDelta,
} from './priorities';
import { relatedFailedGateNames } from './scenario-evidence';
import { getScopeFilePriority } from './build-scope-units';
import { OBSERVED_ARTIFACTS } from './state';

export function buildParityGapUnits(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
  return takeEvidenceBatch(input.parityGaps.gaps, input.capabilityState.capabilities)
    .map((gap) => ({
      id: `parity-${slugify(gap.id)}`,
      order: 0,
      priority: (isSameState(gap.severity, 'critical')
        ? 'P0'
        : isSameState(gap.severity, 'high')
          ? 'P1'
          : isSameState(gap.severity, 'medium')
            ? 'P2'
            : 'P3') as PulseConvergenceUnitPriority,
      kind: 'scope' as const,
      status: (gap.executionMode === 'observation_only'
        ? 'watch'
        : 'open') as PulseConvergenceUnitStatus,
      source: 'pulse' as const,
      executionMode: gap.executionMode,
      ownerLane:
        input.capabilityState.capabilities.find((capability) =>
          gap.affectedCapabilityIds.includes(capability.id),
        )?.ownerLane || 'platform',
      riskLevel: gap.severity,
      evidenceMode: gap.truthMode,
      confidence: confidenceFromTruthMode(gap.truthMode),
      productImpact: determineParityProductImpact(gap.kind),
      title: gap.title,
      summary: gap.summary,
      visionDelta: buildParityVisionDelta(gap),
      targetState: `Structural parity gap ${gap.kind} must stop appearing in the next PULSE run.`,
      failureClass: (gap.truthMode === 'observed'
        ? 'product_failure'
        : 'checker_gap') as PulseGateFailureClass,
      actorKinds: [],
      gateNames: [],
      scenarioIds: [],
      moduleKeys: [],
      routePatterns: gap.routePatterns,
      flowIds: gap.affectedFlowIds,
      affectedCapabilityIds: gap.affectedCapabilityIds,
      affectedFlowIds: gap.affectedFlowIds,
      asyncExpectations: [],
      breakTypes: [gap.kind],
      artifactPaths: [OBSERVED_ARTIFACTS.parityGaps, OBSERVED_ARTIFACTS.cliDirective],
      relatedFiles: gap.relatedFiles,
      validationArtifacts: uniqueStrings([
        OBSERVED_ARTIFACTS.parityGaps,
        OBSERVED_ARTIFACTS.cliDirective,
        'PULSE_PRODUCT_VISION.json',
      ]),
      expectedGateShift:
        isSameState(gap.kind, 'front_without_back') ||
        isSameState(gap.kind, 'ui_without_persistence') ||
        isSameState(gap.kind, 'feature_declared_without_runtime')
          ? 'Reduce product parity drift'
          : undefined,
      exitCriteria: uniqueStrings([
        ...gap.validationTargets,
        `Gap ${gap.kind} is absent from the next PULSE_PARITY_GAPS.json snapshot.`,
      ]),
    }))
    .sort(compareByObservedPressure);
}

export function buildCodacyStaticUnits(
  input: BuildPulseConvergencePlanInput,
): PulseConvergenceUnit[] {
  if (input.scopeState.codacy.highPriorityBatch.length === 0) {
    return [];
  }

  let inventoryByPath = new Map(input.scopeState.files.map((file) => [file.path, file] as const));
  let grouped = new Map<
    string,
    {
      filePath: string;
      issues: typeof input.scopeState.codacy.highPriorityBatch;
      issueCount: number;
    }
  >();

  for (let issue of input.scopeState.codacy.highPriorityBatch) {
    if (!grouped.has(issue.filePath)) {
      grouped.set(issue.filePath, {
        filePath: issue.filePath,
        issues: [],
        issueCount:
          input.scopeState.codacy.topFiles.find((entry) => entry.filePath === issue.filePath)
            ?.issueCount ?? Number(),
      });
    }
    grouped.get(issue.filePath)!.issues.push(issue);
  }

  return [...grouped.values()]
    .map((group) => {
      let file = inventoryByPath.get(group.filePath) || null;
      let categories = uniqueStrings(group.issues.map((issue) => issue.category));
      let patterns = uniqueStrings(group.issues.map((issue) => issue.patternId));
      let summaryParts = [
        `${group.issues.length} HIGH issue(s) currently prioritized by Codacy for ${group.filePath}.`,
        categories.length > 0 ? `Categories: ${categories.join(', ')}.` : '',
        patterns.length > 0
          ? `Patterns: ${takeEvidenceBatch(patterns, categories).join(', ')}.`
          : '',
      ].filter(Boolean);
      let certificationMatches = relatedFailedGateNames(input.certification, [
        ...summaryParts,
        categories.join(' '),
        patterns.join(' '),
        group.filePath,
      ]);

      return {
        id: `codacy-${slugify(group.filePath)}`,
        order: 0,
        priority: getScopeFilePriority(file),
        kind: 'static' as const,
        status: 'open' as const,
        source: 'codacy' as const,
        executionMode: file?.executionMode || 'ai_safe',
        ownerLane: file?.ownerLane || 'platform',
        riskLevel: (file?.protectedByGovernance
          ? 'high'
          : file?.runtimeCritical
            ? 'critical'
            : file?.userFacing
              ? 'high'
              : 'medium') as PulseConvergenceUnit['riskLevel'],
        evidenceMode: 'observed' as const,
        confidence: 'high' as const,
        productImpact:
          file?.runtimeCritical || file?.userFacing
            ? ('enabling' as const)
            : ('diagnostic' as const),
        title: `Burn Codacy hotspot in ${group.filePath}`,
        summary: compactText(summaryParts.join(' '), 320),
        visionDelta: buildCodacyVisionDelta(group.filePath),
        targetState:
          'The hotspot file should leave the Codacy high-priority batch or reduce its HIGH-severity footprint.',
        failureClass: 'product_failure' as const,
        actorKinds: [],
        gateNames: certificationMatches,
        scenarioIds: [],
        moduleKeys: file?.moduleCandidate ? [file.moduleCandidate] : [],
        routePatterns: [],
        flowIds: [],
        affectedCapabilityIds: [],
        affectedFlowIds: [],
        asyncExpectations: [],
        breakTypes: patterns,
        artifactPaths: [OBSERVED_ARTIFACTS.codacyState, OBSERVED_ARTIFACTS.scopeState],
        relatedFiles: [group.filePath],
        validationArtifacts: [
          OBSERVED_ARTIFACTS.codacyState,
          OBSERVED_ARTIFACTS.scopeState,
          OBSERVED_ARTIFACTS.certificate,
        ],
        expectedGateShift: hasObservedItems(certificationMatches)
          ? `Reduce ${certificationMatches.map(humanize).join('/')} pressure`
          : 'Reduce static evidence pressure',
        exitCriteria: uniqueStrings([
          `Codacy no longer reports ${group.filePath} in the current high-priority batch.`,
          file?.executionMode === 'observation_only'
            ? 'PULSE has collected enough evidence to convert this surface into a governed autonomous change or prove no mutation is needed.'
            : null,
        ]),
      };
    })
    .sort(compareByObservedPressure);
}
