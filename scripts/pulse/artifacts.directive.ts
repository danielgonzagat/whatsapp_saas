/**
 * Pulse artifact directive builder.
 * Constructs the CLI directive JSON and artifact index.
 */
import { compact, unique } from './artifacts.io';
import { buildDecisionQueue, buildAutonomyQueue } from './artifacts.queue';
import { getProductFacingCapabilities } from './artifacts.report';
import {
  deriveAuthorityState,
  buildAutonomyReadiness,
  buildAutonomyProof,
} from './artifacts.autonomy';
import { deriveRequiredValidations } from './autonomy-decision';
import type { PulseArtifactSnapshot } from './artifacts.types';
import type { PulseArtifactRegistry } from './artifact-registry';
import type { PulseArtifactCleanupReport } from './artifact-gc';
import type { PulseAutonomyState, PulseConvergencePlan } from './types';
import type { PulseRunIdentity } from './run-identity';
import type { QueueUnit } from './artifacts.queue';
import {
  buildPreconditions,
  buildAllowedActions,
  buildForbiddenActions,
  buildSuccessCriteria,
} from './artifacts.directive.helpers';

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
            : unit.id.replace('recover-', 'customer-'),
        expected: { status: 'passed' },
        comparison: 'eq',
      }),
    ];
  }
  return [];
}

function buildDirectiveUnit(snapshot: PulseArtifactSnapshot, unit: QueueUnit) {
  const directiveUnit = {
    order: unit.order,
    id: unit.id,
    kind: unit.kind,
    priority: unit.priority,
    source: unit.source,
    executionMode: unit.executionMode,
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
): string {
  const decisionQueue = buildDecisionQueue(convergencePlan);
  const autonomyQueue = buildAutonomyQueue(convergencePlan);
  const autonomyReadiness = buildAutonomyReadiness(snapshot, convergencePlan, autonomyQueue);
  const authority = deriveAuthorityState(snapshot, convergencePlan);
  const autonomyProof = buildAutonomyProof(
    snapshot,
    convergencePlan,
    authority,
    autonomyQueue,
    previousAutonomyState,
  );
  const nextAutonomousUnits = autonomyQueue
    .slice(0, 12)
    .map((unit) => buildDirectiveUnit(snapshot, unit));
  const nextDecisionUnits = decisionQueue
    .slice(0, 8)
    .map((unit) => buildDirectiveUnit(snapshot, unit));
  const nextExecutableUnits =
    nextAutonomousUnits.length > 0 ? nextAutonomousUnits.slice(0, 8) : nextDecisionUnits;
  const blockedWork = convergencePlan.queue
    .filter((unit) => unit.executionMode !== 'ai_safe')
    .slice(0, 10);
  const blockedUnits = blockedWork.map((unit) => ({
    id: unit.id,
    title: unit.title,
    executionMode: unit.executionMode,
    evidenceMode: unit.evidenceMode,
    confidence: unit.confidence,
    productImpact: unit.productImpact,
    summary: unit.summary,
    whyBlocked:
      unit.executionMode === 'human_required'
        ? 'Governance-protected or human-owned surface.'
        : 'Observed signal is not mapped enough for autonomous mutation.',
    relatedFiles: unit.relatedFiles,
  }));
  const doNotTouchSurfaces = [
    ...new Set(
      blockedWork
        .filter((unit) => unit.executionMode === 'human_required')
        .flatMap((unit) => [...unit.relatedFiles, ...unit.affectedCapabilityIds]),
    ),
  ].slice(0, 20);
  const topProblems = [
    ...snapshot.externalSignalState.signals.slice(0, 8).map((signal) => ({
      source: signal.source,
      type: signal.type,
      summary: signal.summary,
      impactScore: signal.impactScore,
      executionMode: signal.executionMode,
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
    {
      generatedAt: snapshot.certification.timestamp,
      autonomyVerdict: autonomyReadiness.verdict,
      autonomousNextStepVerdict: autonomyReadiness.verdict,
      zeroPromptProductionGuidanceVerdict: autonomyProof.verdicts.zeroPromptProductionGuidance,
      productionAutonomyVerdict: autonomyProof.verdicts.productionAutonomy,
      canWorkUntilProductionReady: autonomyProof.verdicts.zeroPromptProductionGuidance === 'SIM',
      autonomyReadiness,
      autonomyProof,
      authorityMode: authority.mode,
      advisoryOnly: authority.advisoryOnly,
      automationEligible: authority.automationEligible,
      authorityReasons: authority.reasons,
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
        summary: snapshot.externalSignalState.summary,
        top: snapshot.externalSignalState.signals.slice(0, 12),
      },
      parityGaps: {
        summary: snapshot.parityGaps.summary,
        top: snapshot.parityGaps.gaps.slice(0, 12),
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
          executionMode: capability.executionMode,
          routePatterns: capability.routePatterns,
        })),
      topBlockers: snapshot.productVision.topBlockers,
      topProblems,
      nextAutonomousUnits,
      nextDecisionUnits,
      nextExecutableUnits,
      nextWork: nextExecutableUnits,
      blockedUnits,
      blockedWork: blockedUnits,
      doNotTouchSurfaces,
      antiGoals: [
        'Do not treat projected vision as proof of implementation.',
        'Do not spend the next cycle on diagnostic-only work while transformational or material product gaps remain open.',
        'Do not auto-edit governance-protected surfaces.',
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
        'Never auto-edit governance-protected surfaces.',
        'Treat human_required and observation_only units as blocked for autonomous code changes.',
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
          '.pulse/current/PULSE_EXTERNAL_SIGNAL_STATE.json',
        ],
      },
      stopCondition,
    },
    null,
    2,
  );
}

export function buildArtifactIndex(
  registry: PulseArtifactRegistry,
  cleanupReport: PulseArtifactCleanupReport,
  authority: ReturnType<typeof deriveAuthorityState>,
  identity?: PulseRunIdentity,
): string {
  return JSON.stringify(
    {
      runId: identity?.runId ?? registry.runId ?? null,
      generatedAt: identity?.generatedAt ?? new Date().toISOString(),
      authorityMode: authority.mode,
      advisoryOnly: authority.advisoryOnly,
      authorityReasons: authority.reasons,
      cleanupPolicy: cleanupReport.cleanupMode,
      canonicalDir: registry.canonicalDir,
      tempDir: registry.tempDir,
      officialArtifacts: registry.artifacts.map((artifact) => artifact.relativePath).sort(),
      compatibilityMirrors: registry.mirrors,
      removedLegacyPulseArtifacts: cleanupReport.removedLegacyPulseArtifacts,
      rootStateMode: 'local-only',
    },
    null,
    2,
  );
}
