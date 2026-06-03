import type { PulseGateFailureClass } from '../types.gate-failure';
import type {
  PulseConvergenceUnit,
  PulseConvergenceUnitPriority,
  PulseConvergenceUnitStatus,
} from '../types.convergence';
import type { PulseScopeFile } from '../types.truth.scope';
import type { BuildPulseConvergencePlanInput } from './kernel';
import {
  OBSERVED_ARTIFACTS,
} from './kernel';
import {
  discoverSourceLabelFromObservedContext,
} from '../dynamic-reality-kernel/token-evidence';
import {
  deriveObservedConvergenceEvidenceLabel,
  observedPulseSource,
  observedAiSafeExecutionMode,
  observedStaticKind,
  observedScopeKind,
  observedOpenStatus,
  observedWatchStatus,
  observedP0Priority,
  observedP1Priority,
  observedP2Priority,
  observedP3Priority,
  observedCriticalRisk,
  observedHighRisk,
  observedMediumRisk,
  observedPlatformLane,
  observedHighConfidence,
  observedMediumConfidence,
  observedDiagnosticImpact,
  observedEnablingImpact,
  observedCheckerGapFailureClass,
  observedProductFailureClass,
  observedTruthObservedMode,
  observedTruthInferredMode,
} from './builder-labels';
import {
  UNIT_SOURCES,
} from './kernel';
import {
  buildCodacyVisionDelta,
  buildParityVisionDelta,
  buildScopeVisionDelta,
  compareByObservedPressure,
  compactText,
  confidenceFromTruthMode,
  determineParityProductImpact,
  determineScopeProductImpact,
  hasObservedItems,
  humanize,
  isSameState,
  relatedFailedGateNames,
  slugify,
  takeEvidenceBatch,
  uniqueStrings,
} from './utils';

export function getScopeFilePriority(file: PulseScopeFile | null): PulseConvergenceUnitPriority {
  if (!file) {
    return observedP2Priority;
  }
  if (file.runtimeCritical) {
    return observedP0Priority;
  }
  if (file.userFacing || file.protectedByGovernance) {
    return observedP1Priority;
  }
  return observedP3Priority;
}

export function buildScopeUnits(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
  let units: PulseConvergenceUnit[] = [];
  let scopeImpactContext = {
    missingCodacyFiles: input.scopeState.parity.missingCodacyFiles.length,
    userFacingCandidates: input.resolvedManifest.diagnostics.scopeOnlyModuleCandidates.length,
  };

  if (input.scopeState.parity.missingCodacyFiles.length > 0) {
    let gateNames = relatedFailedGateNames(input.certification, [input.scopeState.parity.reason]);
    units.push({
      id: 'scope-codacy-parity',
      order: 0,
      priority: observedP1Priority,
      kind: observedScopeKind,
      status: observedOpenStatus,
      source: discoverSourceLabelFromObservedContext('scope'),
      executionMode: observedAiSafeExecutionMode,
      ownerLane: observedPlatformLane,
      riskLevel: observedHighRisk,
      evidenceMode: observedTruthObservedMode,
      confidence: input.scopeState.parity.confidence,
      productImpact: determineScopeProductImpact(scopeImpactContext),
      title: 'Close Codacy Scope Parity Gaps',
      summary: compactText(input.scopeState.parity.reason, 320),
      visionDelta: buildScopeVisionDelta(scopeImpactContext),
      targetState:
        'Every observed Codacy hotspot file must exist in the dynamic repo inventory and be classifiable by PULSE.',
      failureClass: observedCheckerGapFailureClass,
      actorKinds: [],
      gateNames,
      scenarioIds: [],
      moduleKeys: [],
      routePatterns: [],
      flowIds: [],
      affectedCapabilityIds: [],
      affectedFlowIds: [],
      asyncExpectations: [],
      findingEvents: ['SCOPE_PARITY_GAP'],
      artifactPaths: [OBSERVED_ARTIFACTS.scopeState, OBSERVED_ARTIFACTS.codacyState],
      relatedFiles: input.scopeState.parity.missingCodacyFiles,
      validationArtifacts: [
        OBSERVED_ARTIFACTS.scopeState,
        OBSERVED_ARTIFACTS.codacyState,
        OBSERVED_ARTIFACTS.certificate,
      ],
      expectedGateShift: 'Pass scopeClosed',
      exitCriteria: [
        'scopeClosed returns pass in the next certification run.',
        'All observed Codacy hotspot files are covered by the repo inventory.',
      ],
      breakTypes: [],
    });
  }

  if (input.resolvedManifest.diagnostics.scopeOnlyModuleCandidates.length > 0) {
    let scopeOnlyModuleCandidates = input.resolvedManifest.diagnostics.scopeOnlyModuleCandidates;
    let gateNames = relatedFailedGateNames(input.certification, scopeOnlyModuleCandidates);
    units.push({
      id: 'scope-unmapped-module-candidates',
      order: 0,
      priority: observedP2Priority,
      kind: observedScopeKind,
      status: observedOpenStatus,
      source: discoverSourceLabelFromObservedContext('scope'),
      executionMode: observedAiSafeExecutionMode,
      ownerLane: observedPlatformLane,
      riskLevel: observedMediumRisk,
      evidenceMode: observedTruthInferredMode,
      confidence: observedMediumConfidence,
      productImpact: determineScopeProductImpact({
        missingCodacyFiles: 0,
        userFacingCandidates: input.resolvedManifest.diagnostics.scopeOnlyModuleCandidates.length,
      }),
      title: 'Resolve Scope-Only Module Candidates',
      summary: compactText(
        `Scope-derived user-facing module candidates remain outside the resolved manifest: ${scopeOnlyModuleCandidates.join(', ')}.`,
        320,
      ),
      visionDelta: buildScopeVisionDelta({
        missingCodacyFiles: 0,
        userFacingCandidates: input.resolvedManifest.diagnostics.scopeOnlyModuleCandidates.length,
      }),
      targetState:
        'All user-facing scope-derived module candidates map into the resolved manifest or are deliberately reclassified.',
      failureClass: observedCheckerGapFailureClass,
      actorKinds: [],
      gateNames,
      scenarioIds: [],
      moduleKeys: scopeOnlyModuleCandidates,
      routePatterns: [],
      flowIds: [],
      affectedCapabilityIds: [],
      affectedFlowIds: [],
      asyncExpectations: [],
      findingEvents: ['SCOPE_MODULE_DRIFT'],
      artifactPaths: [OBSERVED_ARTIFACTS.scopeState, OBSERVED_ARTIFACTS.resolvedManifest],
      relatedFiles: input.scopeState.files
        .filter(
          (file) =>
            Boolean(file.moduleCandidate) &&
            input.resolvedManifest.diagnostics.scopeOnlyModuleCandidates.includes(
              file.moduleCandidate!,
            ),
        )
        .map((file) => file.path),
      validationArtifacts: [
        OBSERVED_ARTIFACTS.scopeState,
        OBSERVED_ARTIFACTS.resolvedManifest,
        OBSERVED_ARTIFACTS.certificate,
      ],
      expectedGateShift: 'Pass truthExtractionPass',
      exitCriteria: [
        'truthExtractionPass returns pass in the next certification run.',
        'Scope-only module candidates are either resolved into the manifest overlay or intentionally excluded.',
      ],
      breakTypes: [],
    });
  }

  return units;
}

export function buildParityGapUnits(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
  return takeEvidenceBatch(input.parityGaps.gaps, input.capabilityState.capabilities)
    .map((gap) => ({
      id: `parity-${slugify(gap.id)}`,
      order: 0,
      priority: isSameState(gap.severity, observedCriticalRisk)
        ? observedP0Priority
        : isSameState(gap.severity, observedHighRisk)
          ? observedP1Priority
          : isSameState(gap.severity, observedMediumRisk)
            ? observedP2Priority
            : observedP3Priority,
      kind: observedScopeKind,
      status: (gap.executionMode === 'observation_only'
        ? observedWatchStatus
        : observedOpenStatus) as PulseConvergenceUnitStatus,
      source: observedPulseSource,
      executionMode: gap.executionMode,
      ownerLane:
        input.capabilityState.capabilities.find((capability) =>
          gap.affectedCapabilityIds.includes(capability.id),
        )?.ownerLane || observedPlatformLane,
      riskLevel: gap.severity,
      evidenceMode: gap.truthMode,
      confidence: confidenceFromTruthMode(gap.truthMode),
      productImpact: determineParityProductImpact(gap.kind),
      title: gap.title,
      summary: gap.summary,
      visionDelta: buildParityVisionDelta(gap),
      targetState: `Structural parity gap ${gap.kind} must stop appearing in the next PULSE run.`,
      failureClass: (gap.truthMode === observedTruthObservedMode
        ? observedProductFailureClass
        : observedCheckerGapFailureClass) as PulseGateFailureClass,
      actorKinds: [],
      gateNames: [],
      scenarioIds: [],
      moduleKeys: [],
      routePatterns: gap.routePatterns,
      flowIds: gap.affectedFlowIds,
      affectedCapabilityIds: gap.affectedCapabilityIds,
      affectedFlowIds: gap.affectedFlowIds,
      asyncExpectations: [],
      findingEvents: [gap.kind],
      artifactPaths: [OBSERVED_ARTIFACTS.parityGaps, OBSERVED_ARTIFACTS.cliDirective],
      relatedFiles: gap.relatedFiles,
      validationArtifacts: uniqueStrings([
        OBSERVED_ARTIFACTS.parityGaps,
        OBSERVED_ARTIFACTS.cliDirective,
        OBSERVED_ARTIFACTS.productVision,
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
      breakTypes: [],
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
        kind: observedStaticKind,
        status: observedOpenStatus,
        source: deriveObservedConvergenceEvidenceLabel<PulseConvergenceUnit['source']>(UNIT_SOURCES, 'codacy'),
        executionMode: file?.executionMode || 'ai_safe',
        ownerLane: file?.ownerLane || observedPlatformLane,
        riskLevel: (file?.protectedByGovernance
          ? observedHighConfidence
          : file?.runtimeCritical
            ? observedCriticalRisk
            : file?.userFacing
              ? observedHighConfidence
              : observedMediumRisk) as PulseConvergenceUnit['riskLevel'],
        evidenceMode: observedTruthObservedMode,
        confidence: observedHighConfidence,
        productImpact:
          file?.runtimeCritical || file?.userFacing
            ? observedEnablingImpact
            : observedDiagnosticImpact,
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
        findingEvents: patterns,
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
        breakTypes: [],
      };
    })
    .sort(compareByObservedPressure);
}
