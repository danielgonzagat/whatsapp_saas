/**
 * Directive core — main buildDirective function orchestrating all other builders.
 * Exports: buildDirective
 */
import { unique } from '../../artifacts.io';
import { deriveZeroValue } from '../../dynamic-reality-kernel/catalog-arithmetic';
import { discoverConvergenceExecutionModeLabels } from '../../__kernel_additions__/discoverConvergenceExecutionModeLabels';
import {
  buildDecisionQueue,
  buildAutonomyQueue,
  normalizeArtifactExecutionMode,
  normalizeCanonicalArtifactValue,
} from '../../artifacts.queue';
import {
  buildPulseMachineReadiness,
  getProductFacingCapabilities,
} from '../../artifacts.report/machine-readiness';
import { deriveAuthorityState } from '../../artifacts.autonomy/authority';
import { buildAutonomyReadiness } from '../../artifacts.autonomy/readiness';
import { buildAutonomyProof } from '../../artifacts.autonomy/autonomy-proof';
import { buildFindingEventSurface } from '../../finding-event-surface';
import {
  formatNoHardcodedRealityBlocker,
  hasNoHardcodedRealityBlocker,
  summarizeNoHardcodedRealityState,
  type PulseNoHardcodedRealityState,
} from '../../no-hardcoded-reality-state';
import type { PulseArtifactSnapshot, PulseMachineReadiness } from '../../artifacts.types';
import type { PulseAutonomyState } from '../../types.autonomy';
import type { PulseConvergencePlan } from '../../types.convergence';
import {
  readCurrentPulseArtifact,
  artifactJsonReplacer,
  normalizeExternalSignalSummaryForDirective,
  normalizeExecutionMatrixSummaryForDirective,
  normalizeExecutionMatrixPathForDirective,
  OBSERVED_ARTIFACT_FILENAMES,
  CURRENT_PULSE_ARTIFACT_DIR,
} from './directive-shared';
import {
  buildProofReadinessSummaryForDirective,
  applyProofReadinessToAutonomyClaims,
  buildPathProofSurfaceForDirective,
} from './directive-readiness';
import { summarizeMachineProofGates, buildDirectiveUnit } from './directive-machine-helpers';
import {
  buildPulseCertificationProofDebtNextWork,
  buildPulseAutonomyProofDebtNextWork,
} from './directive-machine-proof-work';
import { buildPulseMachineNextWork } from './directive-machine-next-work';

type DirectiveProofReadinessArtifact = {
  summary?: Partial<Record<string, unknown>>;
  readinessGate?: {
    canAdvance?: boolean;
    status?: string;
    summary?: Partial<Record<string, unknown>>;
  };
};

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
    readCurrentPulseArtifact<DirectiveProofReadinessArtifact>(
      OBSERVED_ARTIFACT_FILENAMES.proofReadiness,
    ),
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
    ...buildPulseMachineNextWork(
      pulseMachineReadiness as unknown as Parameters<typeof buildPulseMachineNextWork>[0],
    ),
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
      return (
        executionModes.has('observation_only') &&
        normalizeArtifactExecutionMode(unit.executionMode) === 'observation_only'
      );
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
        internalFindingEventIsOperationalIdentity: false,
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
        proofReadinessBlocksProduction: (() => {
          const _s = proofReadiness;
          if (!_s) return false;
          return (
            _s.canAdvance === false ||
            (_s.status !== undefined && _s.status !== 'ready') ||
            (_s.plannedOrUnexecutedEvidence ?? 0) > 0
          );
        })(),
        proofReadinessReason: proofReadiness
          ? `proofReadiness canAdvance=${proofReadiness.canAdvance ?? 'unknown'}, status=${proofReadiness.status ?? 'unknown'}`
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
