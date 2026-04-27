import type {
  PulseCertification,
  PulseCertificationTarget,
  PulseCodacyEvidence,
  PulseCapabilityState,
  PulseExecutionEvidence,
  PulseExternalSignalState,
  PulseFlowProjection,
  PulseGateName,
  PulseGateResult,
  PulseHealth,
  PulseManifest,
  PulseManifestLoadResult,
  PulseParserInventory,
  PulseResolvedManifest,
  PulseScopeState,
  PulseStructuralGraph,
  PulseCodebaseTruth,
  PulseSelfTrustReport,
} from './types';

import {
  getEnvironment,
  getCertificationTarget,
  getCertificationTiers,
  getFinalReadinessCriteria,
  getCommitSha,
  getActiveTemporaryAcceptances,
  getAcceptedCriticalFlows,
  getPendingCriticalScenarios,
  worldStateHasPendingCriticalExpectations,
  unique,
  filterCodacyIssues,
  isCodacySecurityIssue,
  isCodacyIsolationIssue,
} from './cert-helpers';

import {
  GATE_ORDER,
  SECURITY_PATTERNS,
  ISOLATION_PATTERNS,
  RECOVERY_PATTERNS,
  PERFORMANCE_PATTERNS,
} from './cert-constants';

import {
  gateFail,
  evaluateEvidenceFreshGate,
  evaluateScopeGate,
  evaluateTruthExtractionGate,
  evaluatePulseSelfTrustGate,
  evaluateStaticGate,
  evaluateRuntimeGate,
  evaluateChangeRiskGate,
  evaluateBrowserGate,
} from './cert-gate-evaluators';

import {
  evaluatePatternGate,
  evaluateProductionDecisionGate,
  evaluateRecoveryGate,
  evaluateObservabilityGate,
  withTemporaryGateAcceptance,
} from './cert-gate-pattern';

import {
  evaluateFlowGate,
  evaluateInvariantGate,
  evaluateActorGate,
  evaluateSyntheticCoverageGate,
  computeScore,
  buildTierStatuses,
  getBlockingTier,
} from './cert-gate-evaluators-actor';

import { buildDefaultEvidence, mergeExecutionEvidence } from './cert-evidence-defaults';
import { buildGateEvidence } from './cert-gate-evidence';
import {
  evaluateNoOverclaimGate,
  type PulseDirectiveSnapshot,
  type PulseCertificateSnapshot,
} from './cert-gate-overclaim';
import {
  evaluateMultiCycleConvergenceGate,
  type PulseAutonomyStateSnapshot,
} from './cert-gate-multi-cycle';

interface ComputeCertificationInput {
  rootDir: string;
  manifestResult: PulseManifestLoadResult;
  parserInventory: PulseParserInventory;
  health: PulseHealth;
  codebaseTruth: PulseCodebaseTruth;
  resolvedManifest: PulseResolvedManifest;
  scopeState: PulseScopeState;
  codacyEvidence?: PulseCodacyEvidence;
  structuralGraph?: PulseStructuralGraph;
  capabilityState?: PulseCapabilityState;
  flowProjection?: PulseFlowProjection;
  externalSignalState?: PulseExternalSignalState;
  executionEvidence?: Partial<PulseExecutionEvidence>;
  certificationTarget?: PulseCertificationTarget;
  /** Product vision for gates to consume (optional, enriches report). */
  productVision?: unknown;
  /**
   * Previous run's directive artifact (PULSE_CLI_DIRECTIVE.json contents).
   * When provided, noOverclaimPass will check for internal contradictions.
   */
  previousDirective?: PulseDirectiveSnapshot | null;
  /**
   * Previous run's certificate artifact (PULSE_CERTIFICATE.json contents).
   * Paired with previousDirective for cross-artifact overclaim detection.
   */
  previousCertificate?: PulseCertificateSnapshot | null;
  /**
   * Persisted autonomy loop state (PULSE_AUTONOMY_STATE.json contents).
   * Drives the multiCycleConvergencePass gate.
   */
  autonomyState?: PulseAutonomyStateSnapshot | null;
  /**
   * Self-trust report (already computed before certification).
   * When present, the pulseSelfTrustPass gate consumes its
   * cross-artifact-consistency check to detect divergence between
   * previously persisted PULSE artifacts.
   */
  selfTrustReport?: PulseSelfTrustReport | null;
}

/** Compute certification. */
export function computeCertification(input: ComputeCertificationInput): PulseCertification {
  const env = getEnvironment();
  const manifest: PulseManifest | null = input.manifestResult.manifest;
  const certificationTarget = getCertificationTarget(input.certificationTarget);
  const certificationTiers = getCertificationTiers(input.resolvedManifest);
  const finalReadinessCriteria = getFinalReadinessCriteria(input.resolvedManifest);
  const timestamp = new Date().toISOString();

  const defaults = buildDefaultEvidence(
    env,
    manifest,
    input.parserInventory,
    input.health,
    input.codebaseTruth,
    input.resolvedManifest,
    certificationTarget,
  );
  const evidenceSummary = mergeExecutionEvidence(defaults, input.executionEvidence);
  const gateEvidence = buildGateEvidence(
    input.health,
    evidenceSummary,
    input.codebaseTruth,
    input.resolvedManifest,
    input.scopeState,
    input.scopeState.codacy,
    input.externalSignalState,
  );

  const requiresCustomer =
    input.certificationTarget?.profile === 'core-critical' ||
    input.certificationTarget?.profile === 'full-product' ||
    Boolean(certificationTarget.final) ||
    (typeof certificationTarget.tier === 'number' && certificationTarget.tier >= 1);

  const requiresOperatorAdmin =
    input.certificationTarget?.profile === 'core-critical' ||
    input.certificationTarget?.profile === 'full-product' ||
    Boolean(certificationTarget.final) ||
    (typeof certificationTarget.tier === 'number' && certificationTarget.tier >= 2);

  const requiresSoak =
    input.certificationTarget?.profile === 'full-product' ||
    Boolean(certificationTarget.final) ||
    (typeof certificationTarget.tier === 'number' && certificationTarget.tier >= 4);

  const gates: Record<PulseGateName, PulseGateResult> = {
    scopeClosed: withTemporaryGateAcceptance(
      'scopeClosed',
      manifest,
      evaluateScopeGate(input.scopeState),
    ),
    adapterSupported:
      input.manifestResult.unsupportedStacks.length === 0
        ? {
            status: 'pass',
            reason: 'All declared stack adapters are supported by the current PULSE foundation.',
          }
        : withTemporaryGateAcceptance(
            'adapterSupported',
            manifest,
            gateFail(
              `Unsupported adapters declared in manifest: ${input.manifestResult.unsupportedStacks.join(', ')}.`,
              'checker_gap',
            ),
          ),
    specComplete:
      input.manifestResult.manifest !== null && input.manifestResult.issues.length === 0
        ? {
            status: 'pass',
            reason: 'pulse.manifest.json is present and passed structural validation.',
          }
        : withTemporaryGateAcceptance(
            'specComplete',
            manifest,
            gateFail(
              input.manifestResult.issues.map((issue) => issue.description).join(' ') ||
                'pulse.manifest.json is missing or invalid.',
              'checker_gap',
            ),
          ),
    truthExtractionPass: withTemporaryGateAcceptance(
      'truthExtractionPass',
      manifest,
      evaluateTruthExtractionGate(
        input.codebaseTruth,
        input.resolvedManifest,
        input.scopeState,
        input.capabilityState,
        input.flowProjection,
      ),
    ),
    staticPass: withTemporaryGateAcceptance(
      'staticPass',
      manifest,
      evaluateStaticGate(input.health, manifest, input.scopeState.codacy),
    ),
    runtimePass: withTemporaryGateAcceptance(
      'runtimePass',
      manifest,
      evaluateRuntimeGate(env, evidenceSummary, input.externalSignalState),
    ),
    changeRiskPass: withTemporaryGateAcceptance(
      'changeRiskPass',
      manifest,
      evaluateChangeRiskGate(input.externalSignalState),
    ),
    productionDecisionPass: withTemporaryGateAcceptance(
      'productionDecisionPass',
      manifest,
      evaluateProductionDecisionGate(
        input.externalSignalState,
        input.capabilityState,
        input.flowProjection,
      ),
    ),
    browserPass: withTemporaryGateAcceptance(
      'browserPass',
      manifest,
      evaluateBrowserGate(env, evidenceSummary, certificationTarget),
    ),
    flowPass: withTemporaryGateAcceptance(
      'flowPass',
      manifest,
      evaluateFlowGate(
        evidenceSummary,
        manifest,
        certificationTarget.final ||
          (typeof certificationTarget.tier === 'number' && certificationTarget.tier >= 1),
      ),
    ),
    invariantPass: withTemporaryGateAcceptance(
      'invariantPass',
      manifest,
      evaluateInvariantGate(evidenceSummary),
    ),
    securityPass: evaluatePatternGate(
      'securityPass',
      'No blocking security findings are open in this run.',
      'Security certification found blocking findings.',
      input.health,
      manifest,
      SECURITY_PATTERNS,
      filterCodacyIssues(input.scopeState.codacy, isCodacySecurityIssue),
    ),
    isolationPass: evaluatePatternGate(
      'isolationPass',
      'No blocking tenant isolation findings are open.',
      'Isolation certification found blocking findings.',
      input.health,
      manifest,
      ISOLATION_PATTERNS,
      filterCodacyIssues(input.scopeState.codacy, isCodacyIsolationIssue),
    ),
    recoveryPass: withTemporaryGateAcceptance(
      'recoveryPass',
      manifest,
      evaluateRecoveryGate(env, input.health, manifest, evidenceSummary),
    ),
    performancePass: withTemporaryGateAcceptance(
      'performancePass',
      manifest,
      env === 'scan'
        ? gateFail('Performance evidence was not exercised in scan mode.', 'missing_evidence')
        : evaluatePatternGate(
            'performancePass',
            'Performance budgets have no blocking findings in this run.',
            'Performance certification found blocking findings.',
            input.health,
            manifest,
            PERFORMANCE_PATTERNS,
          ),
    ),
    observabilityPass: withTemporaryGateAcceptance(
      'observabilityPass',
      manifest,
      evaluateObservabilityGate(input.health, manifest, evidenceSummary),
    ),
    customerPass: withTemporaryGateAcceptance(
      'customerPass',
      manifest,
      evaluateActorGate('customer', evidenceSummary.customer, requiresCustomer),
    ),
    operatorPass: withTemporaryGateAcceptance(
      'operatorPass',
      manifest,
      evaluateActorGate('operator', evidenceSummary.operator, requiresOperatorAdmin),
    ),
    adminPass: withTemporaryGateAcceptance(
      'adminPass',
      manifest,
      evaluateActorGate('admin', evidenceSummary.admin, requiresOperatorAdmin),
    ),
    soakPass: withTemporaryGateAcceptance(
      'soakPass',
      manifest,
      evaluateActorGate('soak', evidenceSummary.soak, requiresSoak),
    ),
    syntheticCoveragePass: withTemporaryGateAcceptance(
      'syntheticCoveragePass',
      manifest,
      evaluateSyntheticCoverageGate(evidenceSummary),
    ),
    evidenceFresh: evaluateEvidenceFreshGate(
      evidenceSummary,
      input.scopeState.codacy,
      input.externalSignalState,
    ),
    pulseSelfTrustPass: withTemporaryGateAcceptance(
      'pulseSelfTrustPass',
      manifest,
      evaluatePulseSelfTrustGate(
        input.parserInventory,
        input.capabilityState,
        input.flowProjection,
        input.selfTrustReport,
      ),
    ),
    noOverclaimPass: withTemporaryGateAcceptance(
      'noOverclaimPass',
      manifest,
      (() => {
        // Use current computed state, not stale previous-run artifacts.
        // The previous directive may carry claims from a run where the
        // certification was computed inconsistently.
        // Build a minimal current-state snapshot from available data.
        const currentCycleProof = input.autonomyState
          ? {
              proven:
                (input.autonomyState.history ?? []).filter(
                  (entry) =>
                    entry.codex?.executed &&
                    entry.codex?.exitCode === 0 &&
                    entry.validation?.executed &&
                    (entry.validation?.commands ?? []).every((c) => c.exitCode === 0),
                ).length >= 3,
            }
          : { proven: false };

        const currentDirective: PulseDirectiveSnapshot = {
          // Zero-prompt and production autonomy are always NAO at certification time
          // because cycleProof is never proven (requires multi-cycle convergence).
          zeroPromptProductionGuidanceVerdict: 'NAO',
          productionAutonomyVerdict: 'NAO',
          authorityMode: 'advisory-only',
          advisoryOnly: true,
          autonomyProof: {
            cycleProof: currentCycleProof,
          },
          autonomyReadiness: {
            canDeclareComplete: false,
          },
        };
        const currentCertificate: PulseCertificateSnapshot = {
          status: undefined, // Being computed; not yet final.
          rawContent: undefined,
        };
        // Also check previous for cross-run contradictions.
        const previousResult = evaluateNoOverclaimGate(
          input.previousDirective,
          input.previousCertificate,
        );
        if (previousResult.status === 'fail') {
          return previousResult;
        }
        return evaluateNoOverclaimGate(currentDirective, currentCertificate);
      })(),
    ),
    multiCycleConvergencePass: withTemporaryGateAcceptance(
      'multiCycleConvergencePass',
      manifest,
      evaluateMultiCycleConvergenceGate(input.autonomyState),
    ),
  };

  const foundationalGates: PulseGateName[] = [
    'scopeClosed',
    'adapterSupported',
    'specComplete',
    'truthExtractionPass',
    'changeRiskPass',
    'productionDecisionPass',
    'pulseSelfTrustPass',
  ];
  const allPass = GATE_ORDER.every((gateName) => gates[gateName].status === 'pass');
  const foundationsPass = foundationalGates.every((gateName) => gates[gateName].status === 'pass');
  const tierStatus = buildTierStatuses(certificationTiers, gates, manifest, evidenceSummary);
  const blockingTier = getBlockingTier(tierStatus);
  const acceptedFlowsRemaining = getAcceptedCriticalFlows(manifest, evidenceSummary);
  const pendingCriticalScenarios = getPendingCriticalScenarios(evidenceSummary);
  const finalReadinessPass =
    (!finalReadinessCriteria.requireAllTiersPass || tierStatus.every((t) => t.status === 'pass')) &&
    (!finalReadinessCriteria.requireNoAcceptedCriticalFlows ||
      acceptedFlowsRemaining.length === 0) &&
    (!finalReadinessCriteria.requireNoAcceptedCriticalScenarios ||
      pendingCriticalScenarios.length === 0) &&
    (!finalReadinessCriteria.requireWorldStateConvergence ||
      !worldStateHasPendingCriticalExpectations(evidenceSummary));

  const rawScore = input.health.score;
  const score = computeScore(rawScore, gates);
  const criticalFailures = GATE_ORDER.filter((g) => gates[g].status === 'fail').map(
    (g) => `${g}: ${gates[g].reason}`,
  );

  let status: PulseCertification['status'];
  if (!foundationsPass) {
    status = 'NOT_CERTIFIED';
  } else if (certificationTarget.final) {
    status = finalReadinessPass ? 'CERTIFIED' : 'PARTIAL';
  } else if (typeof certificationTarget.tier === 'number') {
    const requested = tierStatus.filter((t) => t.id <= (certificationTarget.tier as number));
    status = requested.every((t) => t.status === 'pass') ? 'CERTIFIED' : 'PARTIAL';
  } else {
    status = allPass ? 'CERTIFIED' : 'PARTIAL';
  }

  const dynamicBlockingReasons = unique(
    [
      input.scopeState.parity.status === 'fail' ? input.scopeState.parity.reason : null,
      input.scopeState.codacy.severityCounts.HIGH > 0
        ? `Codacy still reports ${input.scopeState.codacy.severityCounts.HIGH} HIGH issue(s).`
        : null,
      input.capabilityState?.capabilities.some((c) => c.status === 'phantom')
        ? `Phantom capabilities remain: ${input.capabilityState.capabilities
            .filter((c) => c.status === 'phantom')
            .slice(0, 5)
            .map((c) => c.name)
            .join(', ')}.`
        : null,
      input.flowProjection?.flows.some((f) => f.status === 'phantom')
        ? `Phantom flows remain: ${input.flowProjection.flows
            .filter((f) => f.status === 'phantom')
            .slice(0, 5)
            .map((f) => f.id)
            .join(', ')}.`
        : null,
      input.scopeState.codacy.stale
        ? `Codacy snapshot is stale${input.scopeState.codacy.ageMinutes !== null ? ` (${input.scopeState.codacy.ageMinutes} minute(s) old)` : ''}.`
        : null,
      input.externalSignalState && input.externalSignalState.summary.highImpactSignals > 0
        ? `Observed external high-impact signals remain active: ${input.externalSignalState.summary.highImpactSignals}.`
        : null,
      input.externalSignalState && input.externalSignalState.summary.staleAdapters > 0
        ? `External evidence is stale for ${input.externalSignalState.summary.staleAdapters} adapter(s).`
        : null,
    ].filter(Boolean) as string[],
  );

  return {
    version: '2.5.0',
    status,
    humanReplacementStatus:
      finalReadinessPass &&
      allPass &&
      gates.noOverclaimPass.status === 'pass' &&
      gates.multiCycleConvergencePass.status === 'pass'
        ? 'READY'
        : 'NOT_READY',
    rawScore,
    score,
    commitSha: getCommitSha(input.rootDir),
    environment: env,
    timestamp,
    manifestPath: input.manifestResult.manifestPath,
    unknownSurfaces: input.manifestResult.unknownSurfaces.filter(
      (surface) =>
        !getActiveTemporaryAcceptances(manifest).some(
          (entry) => entry.targetType === 'surface' && entry.target === surface,
        ),
    ),
    unavailableChecks: input.parserInventory.unavailableChecks.map((item) => item.name),
    unsupportedStacks: input.manifestResult.unsupportedStacks,
    criticalFailures,
    gates,
    truthSummary: input.codebaseTruth.summary,
    truthDivergence: input.codebaseTruth.divergence,
    scopeStateSummary: input.scopeState.summary,
    codacySummary: input.scopeState.codacy,
    codacyEvidenceSummary: input.codacyEvidence?.summary ?? null,
    externalSignalSummary: input.externalSignalState?.summary ?? null,
    resolvedManifestSummary: input.resolvedManifest.summary,
    structuralGraphSummary: input.structuralGraph?.summary ?? null,
    capabilityStateSummary: input.capabilityState?.summary ?? null,
    flowProjectionSummary: input.flowProjection?.summary ?? null,
    unresolvedModules: input.resolvedManifest.diagnostics.unresolvedModules,
    unresolvedFlows: input.resolvedManifest.diagnostics.unresolvedFlowGroups,
    certificationTarget,
    tierStatus,
    blockingTier,
    acceptedFlowsRemaining,
    pendingCriticalScenarios,
    finalReadinessCriteria,
    evidenceSummary,
    gateEvidence,
    dynamicBlockingReasons,
  };
}
