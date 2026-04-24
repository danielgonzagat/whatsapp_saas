/**
 * buildGateEvidence: maps scan health + execution evidence to per-gate evidence records.
 * These records feed the gate evaluators and become part of the final certificate.
 */
import type {
  PulseCodebaseTruth,
  PulseCodacySummary,
  PulseEvidenceRecord,
  PulseExecutionEvidence,
  PulseExternalSignalState,
  PulseGateName,
  PulseHealth,
  PulseResolvedManifest,
  PulseScopeState,
} from './types';
import { unique } from './cert-helpers';
import { isRuntimeExternalSignal, isChangeExternalSignal } from './cert-helpers';

export function buildGateEvidence(
  health: PulseHealth,
  evidence: PulseExecutionEvidence,
  codebaseTruth: PulseCodebaseTruth,
  resolvedManifest: PulseResolvedManifest,
  scopeState: PulseScopeState,
  codacy: PulseCodacySummary,
  externalSignalState?: PulseExternalSignalState,
): Partial<Record<PulseGateName, PulseEvidenceRecord[]>> {
  const staticBlocking = health.breaks.filter(
    (item) =>
      (item.severity === 'critical' || item.severity === 'high') &&
      !['CHECK_UNAVAILABLE', 'MANIFEST_MISSING', 'MANIFEST_INVALID', 'UNKNOWN_SURFACE'].includes(
        item.type,
      ),
  );
  const codacyHighIssues = codacy.highPriorityBatch.filter(
    (issue) => issue.severityLevel === 'HIGH',
  );
  const runtimeProbeRecords: PulseEvidenceRecord[] = evidence.runtime.probes.map((probe) => ({
    kind: 'runtime',
    executed: probe.executed,
    summary: probe.summary,
    artifactPaths: probe.artifactPaths,
    metrics: {
      probeId: probe.probeId,
      required: probe.required,
      status: probe.status,
      latencyMs: probe.latencyMs || 0,
      ...(probe.metrics || {}),
    },
  }));

  return {
    scopeClosed: [
      {
        kind: 'truth',
        executed: true,
        summary: scopeState.parity.reason,
        artifactPaths: ['PULSE_SCOPE_STATE.json', 'PULSE_CERTIFICATE.json'],
        metrics: {
          inventoryFiles: scopeState.parity.inventoryFiles,
          codacyObservedFiles: scopeState.parity.codacyObservedFiles,
          codacyObservedFilesCovered: scopeState.parity.codacyObservedFilesCovered,
          confidence: scopeState.parity.confidence,
        },
      },
    ],
    truthExtractionPass: [
      {
        kind: 'truth',
        executed: codebaseTruth.summary.totalPages > 0,
        summary: `Resolved manifest built from ${codebaseTruth.summary.totalPages} page(s), ${resolvedManifest.summary.totalModules} module(s), ${resolvedManifest.summary.totalFlowGroups} flow group(s).`,
        artifactPaths: [
          'PULSE_CODEBASE_TRUTH.json',
          'PULSE_RESOLVED_MANIFEST.json',
          'AUDIT_FEATURE_MATRIX.md',
          'PULSE_REPORT.md',
        ],
        metrics: {
          unresolvedModules: resolvedManifest.summary.unresolvedModules,
          scopeOnlyModuleCandidates: resolvedManifest.summary.scopeOnlyModuleCandidates,
          humanRequiredModules: resolvedManifest.summary.humanRequiredModules,
          unresolvedFlowGroups: resolvedManifest.summary.unresolvedFlowGroups,
          orphanManualModules: resolvedManifest.summary.orphanManualModules,
          orphanFlowSpecs: resolvedManifest.summary.orphanFlowSpecs,
        },
      },
    ],
    staticPass: [
      {
        kind: 'artifact',
        executed: true,
        summary:
          staticBlocking.length > 0 || codacyHighIssues.length > 0
            ? `${staticBlocking.length} critical/high scan blocker(s) and ${codacy.severityCounts.HIGH} Codacy HIGH issue(s) remain open.`
            : 'Static certification has no critical/high blocking findings.',
        artifactPaths: ['PULSE_REPORT.md', 'PULSE_CERTIFICATE.json', 'PULSE_CODACY_STATE.json'],
        metrics: {
          blockingBreaks: staticBlocking.length,
          totalBreaks: health.breaks.length,
          codacyHighIssues: codacy.severityCounts.HIGH,
          codacyTotalIssues: codacy.totalIssues,
        },
      },
    ],
    runtimePass: [
      {
        kind: 'runtime',
        executed: evidence.runtime.executed,
        summary: evidence.runtime.summary,
        artifactPaths: evidence.runtime.artifactPaths,
        metrics: {
          executedChecks: evidence.runtime.executedChecks.length,
          blockingBreakTypes: evidence.runtime.blockingBreakTypes.length,
        },
      },
      {
        kind: 'external',
        executed: Boolean(externalSignalState),
        summary: externalSignalState
          ? `${externalSignalState.signals.filter(isRuntimeExternalSignal).length} observed runtime external signal(s) are attached.`
          : 'No external runtime signal state is attached.',
        artifactPaths: externalSignalState ? ['PULSE_EXTERNAL_SIGNAL_STATE.json'] : [],
        metrics: {
          runtimeSignals: externalSignalState?.signals.filter(isRuntimeExternalSignal).length || 0,
          staleAdapters: externalSignalState?.summary.staleAdapters || 0,
        },
      },
      ...runtimeProbeRecords,
    ],
    changeRiskPass: [
      {
        kind: 'external',
        executed: Boolean(externalSignalState),
        summary: externalSignalState
          ? `${externalSignalState.signals.filter((s) => s.recentChangeRefs.length > 0).length} external signal(s) correlate with recent change evidence.`
          : 'No external change evidence is attached.',
        artifactPaths: externalSignalState ? ['PULSE_EXTERNAL_SIGNAL_STATE.json'] : [],
        metrics: {
          changeSignals: externalSignalState?.signals.filter(isChangeExternalSignal).length || 0,
          correlatedSignals:
            externalSignalState?.signals.filter((s) => s.recentChangeRefs.length > 0).length || 0,
        },
      },
    ],
    productionDecisionPass: [
      {
        kind: 'external',
        executed: Boolean(externalSignalState),
        summary: externalSignalState
          ? `${externalSignalState.summary.mappedSignals}/${externalSignalState.summary.totalSignals} external signal(s) map to capabilities or flows.`
          : 'No external decision evidence is attached.',
        artifactPaths: externalSignalState
          ? [
              'PULSE_EXTERNAL_SIGNAL_STATE.json',
              'PULSE_CAPABILITY_STATE.json',
              'PULSE_FLOW_PROJECTION.json',
            ]
          : [],
        metrics: {
          mappedSignals: externalSignalState?.summary.mappedSignals || 0,
          totalSignals: externalSignalState?.summary.totalSignals || 0,
          highImpactSignals: externalSignalState?.summary.highImpactSignals || 0,
        },
      },
    ],
    browserPass: [
      {
        kind: 'browser',
        executed: evidence.browser.executed,
        summary: evidence.browser.summary,
        artifactPaths: evidence.browser.artifactPaths,
        metrics: {
          attempted: evidence.browser.attempted,
          failureCode: evidence.browser.failureCode || 'ok',
          totalPages: evidence.browser.totalPages || 0,
          totalTested: evidence.browser.totalTested || 0,
          passRate: evidence.browser.passRate || 0,
          blockingInteractions: evidence.browser.blockingInteractions || 0,
        },
      },
    ],
    flowPass: evidence.flows.results.map((result) => ({
      kind: 'flow' as const,
      executed: result.executed,
      summary: result.summary,
      artifactPaths: result.artifactPaths,
      metrics: { flowId: result.flowId, status: result.status, accepted: result.accepted },
    })),
    invariantPass: evidence.invariants.results.map((result) => ({
      kind: 'invariant' as const,
      executed: result.evaluated,
      summary: result.summary,
      artifactPaths: result.artifactPaths,
      metrics: {
        invariantId: result.invariantId,
        status: result.status,
        accepted: result.accepted,
      },
    })),
    recoveryPass: [
      {
        kind: 'artifact',
        executed: evidence.recovery.executed,
        summary: evidence.recovery.summary,
        artifactPaths: evidence.recovery.artifactPaths,
        metrics: {
          backupManifestPresent: evidence.recovery.signals.backupManifestPresent,
          backupPolicyPresent: evidence.recovery.signals.backupPolicyPresent,
          backupValidationPresent: evidence.recovery.signals.backupValidationPresent,
          restoreRunbookPresent: evidence.recovery.signals.restoreRunbookPresent,
          disasterRecoveryRunbookPresent: evidence.recovery.signals.disasterRecoveryRunbookPresent,
          disasterRecoveryTestPresent: evidence.recovery.signals.disasterRecoveryTestPresent,
          seedScriptPresent: evidence.recovery.signals.seedScriptPresent,
        },
      },
    ],
    observabilityPass: [
      {
        kind: 'artifact',
        executed: evidence.observability.executed,
        summary: evidence.observability.summary,
        artifactPaths: evidence.observability.artifactPaths,
        metrics: {
          tracingHeadersDetected: evidence.observability.signals.tracingHeadersDetected,
          requestIdMiddlewareDetected: evidence.observability.signals.requestIdMiddlewareDetected,
          structuredLoggingDetected: evidence.observability.signals.structuredLoggingDetected,
          sentryDetected: evidence.observability.signals.sentryDetected,
          alertingIntegrationDetected: evidence.observability.signals.alertingIntegrationDetected,
          healthEndpointsDetected: evidence.observability.signals.healthEndpointsDetected,
          auditTrailDetected: evidence.observability.signals.auditTrailDetected,
        },
      },
    ],
    customerPass: evidence.customer.results.map((result) => ({
      kind: 'actor' as const,
      executed: result.executed,
      summary: result.summary,
      artifactPaths: result.artifactPaths,
      metrics: {
        scenarioId: result.scenarioId,
        actorKind: result.actorKind,
        critical: result.critical,
        requested: result.requested,
        runner: result.runner,
        status: result.status,
        specsExecuted: result.specsExecuted.length,
        durationMs: result.durationMs,
      },
    })),
    operatorPass: evidence.operator.results.map((result) => ({
      kind: 'actor' as const,
      executed: result.executed,
      summary: result.summary,
      artifactPaths: result.artifactPaths,
      metrics: {
        scenarioId: result.scenarioId,
        actorKind: result.actorKind,
        critical: result.critical,
        requested: result.requested,
        runner: result.runner,
        status: result.status,
        specsExecuted: result.specsExecuted.length,
        durationMs: result.durationMs,
      },
    })),
    adminPass: evidence.admin.results.map((result) => ({
      kind: 'actor' as const,
      executed: result.executed,
      summary: result.summary,
      artifactPaths: result.artifactPaths,
      metrics: {
        scenarioId: result.scenarioId,
        actorKind: result.actorKind,
        critical: result.critical,
        requested: result.requested,
        runner: result.runner,
        status: result.status,
        specsExecuted: result.specsExecuted.length,
        durationMs: result.durationMs,
      },
    })),
    soakPass: evidence.soak.results.map((result) => ({
      kind: 'actor' as const,
      executed: result.executed,
      summary: result.summary,
      artifactPaths: result.artifactPaths,
      metrics: {
        scenarioId: result.scenarioId,
        actorKind: result.actorKind,
        critical: result.critical,
        requested: result.requested,
        runner: result.runner,
        status: result.status,
        specsExecuted: result.specsExecuted.length,
        durationMs: result.durationMs,
      },
    })),
    syntheticCoveragePass: [
      {
        kind: 'coverage',
        executed: evidence.syntheticCoverage.executed,
        summary: evidence.syntheticCoverage.summary,
        artifactPaths: evidence.syntheticCoverage.artifactPaths,
        metrics: {
          totalPages: evidence.syntheticCoverage.totalPages,
          userFacingPages: evidence.syntheticCoverage.userFacingPages,
          coveredPages: evidence.syntheticCoverage.coveredPages,
          uncoveredPages: evidence.syntheticCoverage.uncoveredPages.length,
        },
      },
    ],
    evidenceFresh: [
      {
        kind: 'artifact',
        executed: evidence.executionTrace.phases.length > 0,
        summary:
          codacy.snapshotAvailable && codacy.syncedAt
            ? `${evidence.executionTrace.summary} Codacy synced at ${codacy.syncedAt}.`
            : evidence.executionTrace.summary,
        artifactPaths: unique([
          ...evidence.executionTrace.artifactPaths,
          'PULSE_REPORT.md',
          'AUDIT_FEATURE_MATRIX.md',
          'PULSE_CERTIFICATE.json',
          'PULSE_FLOW_EVIDENCE.json',
          'PULSE_INVARIANT_EVIDENCE.json',
          'PULSE_RUNTIME_EVIDENCE.json',
          'PULSE_RUNTIME_PROBES.json',
          'PULSE_OBSERVABILITY_EVIDENCE.json',
          'PULSE_RECOVERY_EVIDENCE.json',
          'PULSE_CODEBASE_TRUTH.json',
          'PULSE_RESOLVED_MANIFEST.json',
          'KLOEL_PRODUCT_MAP.md',
          'PULSE_CONVERGENCE_PLAN.json',
          'PULSE_CONVERGENCE_PLAN.md',
          'PULSE_CUSTOMER_EVIDENCE.json',
          'PULSE_OPERATOR_EVIDENCE.json',
          'PULSE_ADMIN_EVIDENCE.json',
          'PULSE_SOAK_EVIDENCE.json',
          'PULSE_SCENARIO_COVERAGE.json',
          'PULSE_WORLD_STATE.json',
          'PULSE_SCOPE_STATE.json',
          'PULSE_CODACY_STATE.json',
          'PULSE_EXTERNAL_SIGNAL_STATE.json',
        ]),
        metrics: {
          codacySnapshotAvailable: codacy.snapshotAvailable,
          codacyAgeMinutes: codacy.ageMinutes ?? -1,
          codacyStale: codacy.stale,
          externalStaleAdapters: externalSignalState?.summary.staleAdapters || 0,
          externalMissingAdapters: externalSignalState?.summary.missingAdapters || 0,
        },
      },
    ],
  };
}
