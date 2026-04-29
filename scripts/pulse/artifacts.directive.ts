/**
 * Pulse artifact directive builder.
 * Constructs the CLI directive JSON and artifact index.
 */
import { compact, unique } from './artifacts.io';
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

type DirectiveExecutionMatrixPath = PulseArtifactSnapshot['executionMatrix']['paths'][number];
type DirectiveExecutionMatrixSummary = PulseArtifactSnapshot['executionMatrix']['summary'];
type DirectiveExternalSignalSummary = PulseArtifactSnapshot['externalSignalState']['summary'];

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
  const nextAutonomousUnits = autonomyQueue
    .slice(0, 12)
    .map((unit) => buildDirectiveUnit(snapshot, unit));
  const nextDecisionUnits = decisionQueue
    .slice(0, 8)
    .map((unit) => buildDirectiveUnit(snapshot, unit));
  const nextExecutableUnits =
    nextAutonomousUnits.length > 0 ? nextAutonomousUnits.slice(0, 8) : nextDecisionUnits;
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
        summary: normalizeExternalSignalSummaryForDirective(snapshot.externalSignalState.summary),
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
      compatibilityMirrors: registry.mirrors,
      removedLegacyPulseArtifacts: cleanupReport.removedLegacyPulseArtifacts,
      rootStateMode: 'local-only',
    }),
    artifactJsonReplacer,
    2,
  );
}
