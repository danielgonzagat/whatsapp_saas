import { execSync } from 'child_process';
import type {
  PulseActorEvidence,
  Break,
  PulseBrowserEvidence,
  PulseCertification,
  PulseCertificationTarget,
  PulseCertificationTierStatus,
  PulseCodebaseTruth,
  PulseEnvironment,
  PulseEvidenceRecord,
  PulseExecutionEvidence,
  PulseExecutionTrace,
  PulseFlowEvidence,
  PulseFlowResult,
  PulseGateFailureClass,
  PulseGateName,
  PulseGateResult,
  PulseHealth,
  PulseInvariantEvidence,
  PulseInvariantResult,
  PulseManifest,
  PulseManifestCertificationTier,
  PulseManifestFinalReadinessCriteria,
  PulseManifestLoadResult,
  PulseObservabilityEvidence,
  PulseParserInventory,
  PulseRecoveryEvidence,
  PulseResolvedManifest,
  PulseRuntimeProbe,
  PulseSyntheticCoverageEvidence,
  PulseWorldState,
} from './types';

interface ComputeCertificationInput {
  rootDir: string;
  manifestResult: PulseManifestLoadResult;
  parserInventory: PulseParserInventory;
  health: PulseHealth;
  codebaseTruth: PulseCodebaseTruth;
  resolvedManifest: PulseResolvedManifest;
  executionEvidence?: Partial<PulseExecutionEvidence>;
  certificationTarget?: PulseCertificationTarget;
}

const SECURITY_PATTERNS = [
  /ROUTE_NO_AUTH/,
  /HARDCODED_SECRET/,
  /SQL_INJECTION/,
  /CSRF/,
  /XSS/,
  /COOKIE_/,
  /SENSITIVE_DATA/,
  /AUTH_BYPASS/,
  /LGPD_/,
  /CRYPTO_/,
];

const ISOLATION_PATTERNS = [/WORKSPACE_ISOLATION/, /MISSING_WORKSPACE_FILTER/, /TENANT_/];

const RECOVERY_PATTERNS = [
  /^BACKUP_MISSING$/,
  /^DR_/,
  /ROLLBACK/,
  /DEPLOY_NO_FEATURE_FLAGS/,
  /MIGRATION_NO_ROLLBACK/,
];

const PERFORMANCE_PATTERNS = [
  /SLOW_QUERY/,
  /UNBOUNDED_RESULT/,
  /MEMORY_LEAK/,
  /NETWORK_SLOW_UNUSABLE/,
  /RESPONSIVE_BROKEN/,
  /NODEJS_EVENT_LOOP_BLOCKED/,
  /DB_POOL_EXHAUSTION_HANG/,
];

const OBSERVABILITY_PATTERNS = [
  /OBSERVABILITY_/,
  /^AUDIT_FINANCIAL_NO_TRAIL$/,
  /^AUDIT_DELETION_NO_LOG$/,
  /^AUDIT_ADMIN_NO_LOG$/,
];

const RUNTIME_PATTERNS = [
  /^BUILD_/,
  /^TEST_/,
  /^LINT_/,
  /^CRUD_/,
  /^VALIDATION_BYPASSED$/,
  /^API_CONTRACT_/,
  /^AUTH_FLOW_/,
  /^TOKEN_REFRESH_/,
  /^WORKSPACE_ISOLATION_BROKEN$/,
  /^AUTH_BYPASS_VULNERABLE$/,
  /^E2E_/,
  /^CHAOS_/,
  /^SLOW_QUERY$/,
  /^UNBOUNDED_RESULT$/,
  /^MEMORY_LEAK_DETECTED$/,
  /^HYDRATION_MISMATCH$/,
  /^RESPONSIVE_BROKEN$/,
  /^ACCESSIBILITY_VIOLATION$/,
  /^AI_RESPONSE_INADEQUATE$/,
  /^AI_GUARDRAIL_BROKEN$/,
  /^STATE_/,
  /^RACE_CONDITION_/,
  /^ORDERING_/,
  /^CACHE_/,
  /^OBSERVABILITY_/,
  /^AUDIT_/,
  /^DEPLOY_/,
  /^DR_/,
  /^BROWSER_/,
  /^NETWORK_/,
];

const CHECKER_GAP_TYPES = new Set<Break['type']>([
  'CHECK_UNAVAILABLE',
  'MANIFEST_MISSING',
  'MANIFEST_INVALID',
  'UNKNOWN_SURFACE',
]);

const GATE_ORDER: PulseGateName[] = [
  'scopeClosed',
  'adapterSupported',
  'specComplete',
  'truthExtractionPass',
  'staticPass',
  'runtimePass',
  'browserPass',
  'flowPass',
  'invariantPass',
  'securityPass',
  'isolationPass',
  'recoveryPass',
  'performancePass',
  'observabilityPass',
  'customerPass',
  'operatorPass',
  'adminPass',
  'soakPass',
  'syntheticCoveragePass',
  'evidenceFresh',
  'pulseSelfTrustPass',
];

const DEFAULT_CERTIFICATION_TIERS: PulseManifestCertificationTier[] = [
  {
    id: 0,
    name: 'Truth + Runtime Baseline',
    gates: ['truthExtractionPass', 'runtimePass', 'syntheticCoveragePass'],
  },
  {
    id: 1,
    name: 'Customer Truth',
    gates: ['browserPass', 'flowPass', 'customerPass'],
    requireNoAcceptedFlows: true,
  },
  {
    id: 2,
    name: 'Operator + Admin Replacement',
    gates: ['operatorPass', 'adminPass'],
  },
  {
    id: 3,
    name: 'Production Reliability',
    gates: ['invariantPass', 'securityPass', 'recoveryPass', 'observabilityPass'],
  },
  {
    id: 4,
    name: 'Final Human Replacement',
    gates: ['soakPass'],
    requireNoAcceptedFlows: true,
    requireNoAcceptedScenarios: true,
    requireWorldStateConvergence: true,
  },
];

const DEFAULT_FINAL_READINESS_CRITERIA: PulseManifestFinalReadinessCriteria = {
  requireAllTiersPass: true,
  requireNoAcceptedCriticalFlows: true,
  requireNoAcceptedCriticalScenarios: true,
  requireWorldStateConvergence: true,
};

function getEnvironment(): PulseEnvironment {
  if (process.env.PULSE_TOTAL === '1') {
    return 'total';
  }
  if (process.env.PULSE_DEEP === '1') {
    return 'deep';
  }
  return 'scan';
}

function getCertificationTarget(input?: PulseCertificationTarget): PulseCertificationTarget {
  return {
    tier: typeof input?.tier === 'number' ? input.tier : null,
    final: Boolean(input?.final),
    profile: input?.profile || null,
  };
}

function getCertificationTiers(
  resolvedManifest: PulseResolvedManifest,
): PulseManifestCertificationTier[] {
  return resolvedManifest.certificationTiers.length > 0
    ? [...resolvedManifest.certificationTiers].sort((a, b) => a.id - b.id)
    : DEFAULT_CERTIFICATION_TIERS;
}

function getFinalReadinessCriteria(
  resolvedManifest: PulseResolvedManifest,
): PulseManifestFinalReadinessCriteria {
  return resolvedManifest.finalReadinessCriteria || DEFAULT_FINAL_READINESS_CRITERIA;
}

function getCommitSha(rootDir: string): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: rootDir, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

function isCriticalBreak(item: Break): boolean {
  return item.severity === 'critical' || item.severity === 'high';
}

function matchesAny(type: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(type));
}

function getActiveTemporaryAcceptances(
  manifest: PulseManifest | null,
): PulseManifest['temporaryAcceptances'] {
  if (!manifest) {
    return [];
  }
  const now = Date.now();
  return manifest.temporaryAcceptances.filter((entry) => {
    const expiresAt = Date.parse(entry.expiresAt);
    return Number.isFinite(expiresAt) && expiresAt >= now;
  });
}

function isGateAccepted(manifest: PulseManifest | null, gate: PulseGateName): boolean {
  return getActiveTemporaryAcceptances(manifest).some(
    (entry) => entry.targetType === 'gate' && entry.target === gate,
  );
}

function isBreakTypeAccepted(manifest: PulseManifest | null, type: Break['type']): boolean {
  return getActiveTemporaryAcceptances(manifest).some(
    (entry) => entry.targetType === 'break_type' && entry.target === type,
  );
}

function acceptedGatePass(manifest: PulseManifest | null, gate: PulseGateName): PulseGateResult {
  const entry = getActiveTemporaryAcceptances(manifest).find(
    (item) => item.targetType === 'gate' && item.target === gate,
  );
  return {
    status: 'pass',
    reason: entry
      ? `Temporarily accepted by manifest until ${entry.expiresAt}: ${entry.reason}`
      : 'Temporarily accepted by manifest.',
  };
}

function filterBlockingBreaks(
  breaks: Break[],
  predicate?: (item: Break) => boolean,
  manifest?: PulseManifest | null,
): Break[] {
  return breaks.filter((item) => {
    if (!isCriticalBreak(item)) {
      return false;
    }
    if (CHECKER_GAP_TYPES.has(item.type)) {
      return false;
    }
    if (manifest && isBreakTypeAccepted(manifest, item.type)) {
      return false;
    }
    return predicate ? predicate(item) : true;
  });
}

function inferRuntimeCheckNames(parserInventory: PulseParserInventory): string[] {
  return parserInventory.loadedChecks
    .map((check) => check.name)
    .filter((name) =>
      /build|test|e2e|crud|auth-flow|contract|performance|browser|responsive|hydration|accessibility|chaos|concurrency|backup|rollback|monitoring|observability|audit|npm-audit|webhook|state-machine|cache-invalidation|disaster-recovery/i.test(
        name,
      ),
    )
    .sort();
}

function summarizeBreakTypes(breaks: Break[]): string[] {
  return [...new Set(breaks.map((item) => item.type))].sort();
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function getApplicableFlowIds(manifest: PulseManifest | null, env: PulseEnvironment): string[] {
  return (
    manifest?.flowSpecs.filter((spec) => spec.environments.includes(env)).map((spec) => spec.id) ||
    []
  );
}

function getApplicableInvariantIds(
  manifest: PulseManifest | null,
  env: PulseEnvironment,
): string[] {
  return (
    manifest?.invariantSpecs
      .filter((spec) => spec.environments.includes(env))
      .map((spec) => spec.id) || []
  );
}

function getAcceptedTargetIds(
  manifest: PulseManifest | null,
  targetType: 'flow' | 'invariant',
): string[] {
  return getActiveTemporaryAcceptances(manifest)
    .filter((entry) => entry.targetType === targetType)
    .map((entry) => entry.target);
}

function targetRequiresCustomerExecution(target: PulseCertificationTarget): boolean {
  return (
    target.profile === 'core-critical' ||
    target.profile === 'full-product' ||
    target.final ||
    (typeof target.tier === 'number' && target.tier >= 1)
  );
}

function targetRequiresOperatorExecution(target: PulseCertificationTarget): boolean {
  return (
    target.profile === 'core-critical' ||
    target.profile === 'full-product' ||
    target.final ||
    (typeof target.tier === 'number' && target.tier >= 2)
  );
}

function targetRequiresSoakExecution(target: PulseCertificationTarget): boolean {
  return (
    target.profile === 'full-product' ||
    target.final ||
    (typeof target.tier === 'number' && target.tier >= 4)
  );
}

function getAcceptedCriticalFlows(
  manifest: PulseManifest | null,
  evidence: PulseExecutionEvidence,
): string[] {
  const criticalFlowIds = new Set(
    (manifest?.flowSpecs || []).filter((spec) => spec.critical).map((spec) => spec.id),
  );
  return unique(
    evidence.flows.results
      .filter((result) => result.accepted && criticalFlowIds.has(result.flowId))
      .map((result) => result.flowId),
  ).sort();
}

function getPendingCriticalScenarios(evidence: PulseExecutionEvidence): string[] {
  const actorResults = [
    ...evidence.customer.results,
    ...evidence.operator.results,
    ...evidence.admin.results,
    ...evidence.soak.results,
  ];

  return unique(
    actorResults
      .filter((result) => result.critical)
      .filter((result) => result.status === 'missing_evidence' || result.status === 'skipped')
      .map((result) => result.scenarioId),
  ).sort();
}

function worldStateHasPendingCriticalExpectations(evidence: PulseExecutionEvidence): boolean {
  const criticalScenarioIds = new Set(
    [
      ...evidence.customer.results,
      ...evidence.operator.results,
      ...evidence.admin.results,
      ...evidence.soak.results,
    ]
      .filter((result) => result.critical)
      .map((result) => result.scenarioId),
  );

  return evidence.worldState.asyncExpectationsStatus.some(
    (entry) => criticalScenarioIds.has(entry.scenarioId) && entry.status !== 'satisfied',
  );
}

function normalizeRoutePattern(value: string): string {
  const normalized = value.replace(/\*+/g, '').replace(/\/+$/, '').toLowerCase();
  return normalized || '/';
}

function routeMatches(route: string, pattern: string): boolean {
  const normalizedRoute = normalizeRoutePattern(route);
  const normalizedPattern = normalizeRoutePattern(pattern);
  if (!normalizedPattern) {
    return false;
  }
  return normalizedRoute === normalizedPattern || normalizedRoute.startsWith(normalizedPattern);
}

function buildDefaultFlowEvidence(
  manifest: PulseManifest | null,
  env: PulseEnvironment,
): PulseFlowEvidence {
  const declared = getApplicableFlowIds(manifest, env);
  const accepted = getAcceptedTargetIds(manifest, 'flow').filter((id) => declared.includes(id));
  const missing = declared.filter((id) => !accepted.includes(id));
  const results: PulseFlowResult[] = declared.map((flowId) => {
    if (accepted.includes(flowId)) {
      const entry = getActiveTemporaryAcceptances(manifest).find(
        (item) => item.targetType === 'flow' && item.target === flowId,
      );
      return {
        flowId,
        status: 'accepted',
        executed: false,
        accepted: true,
        summary: entry
          ? `Temporarily accepted until ${entry.expiresAt}: ${entry.reason}`
          : 'Temporarily accepted by manifest.',
        artifactPaths: declared.length > 0 ? ['PULSE_FLOW_EVIDENCE.json'] : [],
      };
    }

    return {
      flowId,
      status: 'missing_evidence',
      executed: false,
      accepted: false,
      failureClass: 'missing_evidence',
      summary: `No formal flow evidence is attached for ${flowId}.`,
      artifactPaths: declared.length > 0 ? ['PULSE_FLOW_EVIDENCE.json'] : [],
    };
  });

  return {
    declared,
    executed: [],
    missing,
    passed: [],
    failed: [],
    accepted,
    artifactPaths: declared.length > 0 ? ['PULSE_FLOW_EVIDENCE.json'] : [],
    summary:
      declared.length > 0
        ? `No formal flow evidence is attached for ${missing.length} declared flow(s).`
        : 'No flow specs are required in the current environment.',
    results,
  };
}

function buildDefaultInvariantEvidence(
  manifest: PulseManifest | null,
  env: PulseEnvironment,
): PulseInvariantEvidence {
  const declared = getApplicableInvariantIds(manifest, env);
  const accepted = getAcceptedTargetIds(manifest, 'invariant').filter((id) =>
    declared.includes(id),
  );
  const missing = declared.filter((id) => !accepted.includes(id));
  const results: PulseInvariantResult[] = declared.map((invariantId) => {
    if (accepted.includes(invariantId)) {
      const entry = getActiveTemporaryAcceptances(manifest).find(
        (item) => item.targetType === 'invariant' && item.target === invariantId,
      );
      return {
        invariantId,
        status: 'accepted',
        evaluated: false,
        accepted: true,
        summary: entry
          ? `Temporarily accepted until ${entry.expiresAt}: ${entry.reason}`
          : 'Temporarily accepted by manifest.',
        artifactPaths: declared.length > 0 ? ['PULSE_INVARIANT_EVIDENCE.json'] : [],
      };
    }

    return {
      invariantId,
      status: 'missing_evidence',
      evaluated: false,
      accepted: false,
      failureClass: 'missing_evidence',
      summary: `No formal invariant evidence is attached for ${invariantId}.`,
      artifactPaths: declared.length > 0 ? ['PULSE_INVARIANT_EVIDENCE.json'] : [],
    };
  });

  return {
    declared,
    evaluated: [],
    missing,
    passed: [],
    failed: [],
    accepted,
    artifactPaths: declared.length > 0 ? ['PULSE_INVARIANT_EVIDENCE.json'] : [],
    summary:
      declared.length > 0
        ? `No formal invariant evidence is attached for ${missing.length} declared invariant(s).`
        : 'No invariant specs are required in the current environment.',
    results,
  };
}

function buildDefaultObservabilityEvidence(env: PulseEnvironment): PulseObservabilityEvidence {
  return {
    executed: env !== 'scan',
    artifactPaths: env === 'scan' ? [] : ['PULSE_OBSERVABILITY_EVIDENCE.json'],
    summary:
      env === 'scan'
        ? 'Observability evidence was not attached in scan mode.'
        : 'Observability evidence was not attached yet.',
    signals: {
      tracingHeadersDetected: false,
      requestIdMiddlewareDetected: false,
      structuredLoggingDetected: false,
      sentryDetected: false,
      alertingIntegrationDetected: false,
      healthEndpointsDetected: false,
      auditTrailDetected: false,
    },
  };
}

function buildDefaultRecoveryEvidence(env: PulseEnvironment): PulseRecoveryEvidence {
  return {
    executed: env !== 'scan',
    artifactPaths: env === 'scan' ? [] : ['PULSE_RECOVERY_EVIDENCE.json'],
    summary:
      env === 'scan'
        ? 'Recovery evidence was not attached in scan mode.'
        : 'Recovery evidence was not attached yet.',
    signals: {
      backupManifestPresent: false,
      backupPolicyPresent: false,
      backupValidationPresent: false,
      restoreRunbookPresent: false,
      disasterRecoveryRunbookPresent: false,
      disasterRecoveryTestPresent: false,
      seedScriptPresent: false,
    },
  };
}

function getDeclaredScenarioIds(
  resolvedManifest: PulseResolvedManifest,
  actorKind: PulseActorEvidence['actorKind'],
): string[] {
  if (actorKind === 'soak') {
    return resolvedManifest.scenarioSpecs
      .filter((spec) => spec.timeWindowModes.includes('soak'))
      .map((spec) => spec.id);
  }

  return resolvedManifest.scenarioSpecs
    .filter((spec) => spec.actorKind === actorKind)
    .map((spec) => spec.id);
}

function buildDefaultActorEvidence(
  actorKind: PulseActorEvidence['actorKind'],
  resolvedManifest: PulseResolvedManifest,
): PulseActorEvidence {
  const scenarios =
    actorKind === 'soak'
      ? resolvedManifest.scenarioSpecs.filter((spec) => spec.timeWindowModes.includes('soak'))
      : resolvedManifest.scenarioSpecs.filter((spec) => spec.actorKind === actorKind);
  const declared = scenarios.map((spec) => spec.id);
  return {
    actorKind,
    declared,
    executed: [],
    missing: declared,
    passed: [],
    failed: [],
    artifactPaths:
      declared.length > 0
        ? [
            `PULSE_${actorKind.toUpperCase()}_EVIDENCE.json`,
            'PULSE_WORLD_STATE.json',
            'PULSE_SCENARIO_COVERAGE.json',
          ]
        : [],
    summary:
      declared.length > 0
        ? `No ${actorKind} actor evidence is attached for ${declared.length} declared scenario(s).`
        : `No ${actorKind} scenarios are declared in the resolved manifest.`,
    results: scenarios.map((spec) => ({
      scenarioId: spec.id,
      actorKind: spec.actorKind,
      scenarioKind: spec.scenarioKind,
      critical: spec.critical,
      requested: false,
      runner: spec.runner,
      status: 'missing_evidence',
      executed: false,
      failureClass: 'missing_evidence',
      summary: `No actor evidence is attached for scenario ${spec.id}.`,
      artifactPaths:
        declared.length > 0
          ? [
              `PULSE_${actorKind.toUpperCase()}_EVIDENCE.json`,
              'PULSE_WORLD_STATE.json',
              'PULSE_SCENARIO_COVERAGE.json',
            ]
          : [],
      specsExecuted: [],
      durationMs: 0,
      worldStateTouches: spec.worldStateKeys,
      moduleKeys: [],
      routePatterns: [],
    })),
  };
}

function buildDefaultSyntheticCoverage(
  codebaseTruth: PulseCodebaseTruth,
  resolvedManifest: PulseResolvedManifest,
): PulseSyntheticCoverageEvidence {
  const results = codebaseTruth.pages.map((page) => {
    const matchingScenarios = resolvedManifest.scenarioSpecs.filter(
      (spec) =>
        spec.moduleKeys.includes(page.moduleKey) ||
        spec.routePatterns.some((pattern) => routeMatches(page.route, pattern)),
    );
    const covered = matchingScenarios.length > 0;
    return {
      route: page.route,
      group: page.group,
      moduleKey: page.moduleKey,
      moduleName: page.moduleName,
      classification: 'certified_interaction' as const,
      covered,
      actorKinds: unique(matchingScenarios.map((spec) => spec.actorKind)).sort(),
      scenarioIds: matchingScenarios.map((spec) => spec.id).sort(),
      totalInteractions: page.totalInteractions,
      persistedInteractions: page.persistedInteractions,
    };
  });

  const uncoveredPages = results
    .filter((entry) => !entry.covered)
    .map((entry) => entry.route)
    .sort();

  return {
    executed: true,
    artifactPaths: ['PULSE_SCENARIO_COVERAGE.json'],
    summary:
      uncoveredPages.length === 0
        ? `Synthetic coverage maps all ${results.length} discovered page(s) to declared scenarios.`
        : `Synthetic coverage is missing for ${uncoveredPages.length} discovered page(s).`,
    totalPages: results.length,
    userFacingPages: codebaseTruth.summary.userFacingPages,
    coveredPages: results.filter((entry) => entry.covered).length,
    uncoveredPages,
    results,
  };
}

function buildDefaultWorldState(
  resolvedManifest: PulseResolvedManifest,
  evidence: {
    runtime: PulseExecutionEvidence['runtime'];
    customer: PulseActorEvidence;
    operator: PulseActorEvidence;
    admin: PulseActorEvidence;
    soak: PulseActorEvidence;
  },
): PulseWorldState {
  return {
    generatedAt: new Date().toISOString(),
    backendUrl: evidence.runtime.backendUrl,
    frontendUrl: evidence.runtime.frontendUrl,
    actorProfiles: resolvedManifest.actorProfiles.map((profile) => profile.id),
    executedScenarios: [],
    pendingAsyncExpectations: resolvedManifest.scenarioSpecs
      .filter((spec) => spec.asyncExpectations.length > 0)
      .flatMap((spec) => spec.asyncExpectations.map((expectation) => `${spec.id}:${expectation}`)),
    entities: {},
    asyncExpectationsStatus: resolvedManifest.scenarioSpecs.flatMap((spec) =>
      spec.asyncExpectations.map((expectation) => ({
        scenarioId: spec.id,
        expectation,
        status: 'pending' as const,
      })),
    ),
    artifactsByScenario: {},
    sessions: ['customer', 'operator', 'admin', 'system'].map((kind) => {
      const declaredScenarios = resolvedManifest.scenarioSpecs.filter(
        (spec) => spec.actorKind === kind,
      ).length;
      return {
        kind: kind as PulseWorldState['sessions'][number]['kind'],
        declaredScenarios,
        executedScenarios: 0,
        passedScenarios: 0,
      };
    }),
  };
}

function buildDefaultExecutionTrace(
  env: PulseEnvironment,
  target: PulseCertificationTarget,
): PulseExecutionTrace {
  const timestamp = new Date().toISOString();
  return {
    runId: `pulse-cert-${Date.now()}`,
    generatedAt: timestamp,
    updatedAt: timestamp,
    environment: env,
    certificationTarget: target,
    phases: [],
    summary: 'Execution trace not attached.',
    artifactPaths: ['PULSE_EXECUTION_TRACE.json'],
  };
}

function buildDefaultEvidence(
  env: PulseEnvironment,
  manifest: PulseManifest | null,
  parserInventory: PulseParserInventory,
  health: PulseHealth,
  codebaseTruth: PulseCodebaseTruth,
  resolvedManifest: PulseResolvedManifest,
  target: PulseCertificationTarget,
): PulseExecutionEvidence {
  const runtimeBreaks = filterBlockingBreaks(
    health.breaks,
    (item) => matchesAny(item.type, RUNTIME_PATTERNS),
    manifest,
  );

  const browser: PulseBrowserEvidence =
    env === 'total'
      ? {
          attempted: false,
          executed: false,
          artifactPaths: [],
          summary: 'Total mode requires browser evidence, but none has been attached yet.',
          failureCode: undefined,
        }
      : {
          attempted: false,
          executed: false,
          artifactPaths: [],
          summary: 'Browser certification is not required in this environment.',
          failureCode: 'ok',
        };

  const customer = buildDefaultActorEvidence('customer', resolvedManifest);
  const operator = buildDefaultActorEvidence('operator', resolvedManifest);
  const admin = buildDefaultActorEvidence('admin', resolvedManifest);
  const soak = buildDefaultActorEvidence('soak', resolvedManifest);
  const syntheticCoverage = buildDefaultSyntheticCoverage(codebaseTruth, resolvedManifest);

  return {
    runtime:
      env === 'scan'
        ? {
            executed: false,
            executedChecks: [],
            blockingBreakTypes: [],
            artifactPaths: [],
            summary: 'Runtime evidence was not collected in scan mode.',
            probes: [],
          }
        : {
            executed: true,
            executedChecks: inferRuntimeCheckNames(parserInventory),
            blockingBreakTypes: summarizeBreakTypes(runtimeBreaks),
            artifactPaths: [],
            summary:
              runtimeBreaks.length > 0
                ? `Runtime evidence executed with ${runtimeBreaks.length} blocking runtime finding(s).`
                : 'Runtime evidence executed without blocking runtime findings.',
            probes: [],
          },
    browser,
    flows: buildDefaultFlowEvidence(manifest, env),
    invariants: buildDefaultInvariantEvidence(manifest, env),
    observability: buildDefaultObservabilityEvidence(env),
    recovery: buildDefaultRecoveryEvidence(env),
    customer,
    operator,
    admin,
    soak,
    syntheticCoverage,
    worldState: buildDefaultWorldState(resolvedManifest, {
      runtime:
        env === 'scan'
          ? {
              executed: false,
              executedChecks: [],
              blockingBreakTypes: [],
              artifactPaths: [],
              summary: 'Runtime evidence was not collected in scan mode.',
              probes: [],
            }
          : {
              executed: true,
              executedChecks: inferRuntimeCheckNames(parserInventory),
              blockingBreakTypes: summarizeBreakTypes(runtimeBreaks),
              artifactPaths: [],
              summary:
                runtimeBreaks.length > 0
                  ? `Runtime evidence executed with ${runtimeBreaks.length} blocking runtime finding(s).`
                  : 'Runtime evidence executed without blocking runtime findings.',
              probes: [],
            },
      customer,
      operator,
      admin,
      soak,
    }),
    executionTrace: buildDefaultExecutionTrace(env, target),
  };
}

function mergeExecutionEvidence(
  defaults: PulseExecutionEvidence,
  overrides?: Partial<PulseExecutionEvidence>,
): PulseExecutionEvidence {
  if (!overrides) {
    return defaults;
  }

  return {
    runtime: {
      ...defaults.runtime,
      ...(overrides.runtime || {}),
      executedChecks: overrides.runtime?.executedChecks || defaults.runtime.executedChecks,
      blockingBreakTypes:
        overrides.runtime?.blockingBreakTypes || defaults.runtime.blockingBreakTypes,
      artifactPaths: overrides.runtime?.artifactPaths || defaults.runtime.artifactPaths,
      probes: overrides.runtime?.probes || defaults.runtime.probes,
    },
    browser: {
      ...defaults.browser,
      ...(overrides.browser || {}),
      artifactPaths: overrides.browser?.artifactPaths || defaults.browser.artifactPaths,
    },
    flows: {
      ...defaults.flows,
      ...(overrides.flows || {}),
      declared: overrides.flows?.declared || defaults.flows.declared,
      executed: overrides.flows?.executed || defaults.flows.executed,
      missing: overrides.flows?.missing || defaults.flows.missing,
      passed: overrides.flows?.passed || defaults.flows.passed,
      failed: overrides.flows?.failed || defaults.flows.failed,
      accepted: overrides.flows?.accepted || defaults.flows.accepted,
      artifactPaths: overrides.flows?.artifactPaths || defaults.flows.artifactPaths,
      results: overrides.flows?.results || defaults.flows.results,
    },
    invariants: {
      ...defaults.invariants,
      ...(overrides.invariants || {}),
      declared: overrides.invariants?.declared || defaults.invariants.declared,
      evaluated: overrides.invariants?.evaluated || defaults.invariants.evaluated,
      missing: overrides.invariants?.missing || defaults.invariants.missing,
      passed: overrides.invariants?.passed || defaults.invariants.passed,
      failed: overrides.invariants?.failed || defaults.invariants.failed,
      accepted: overrides.invariants?.accepted || defaults.invariants.accepted,
      artifactPaths: overrides.invariants?.artifactPaths || defaults.invariants.artifactPaths,
      results: overrides.invariants?.results || defaults.invariants.results,
    },
    observability: {
      ...defaults.observability,
      ...(overrides.observability || {}),
      artifactPaths: overrides.observability?.artifactPaths || defaults.observability.artifactPaths,
      signals: {
        ...defaults.observability.signals,
        ...(overrides.observability?.signals || {}),
      },
    },
    recovery: {
      ...defaults.recovery,
      ...(overrides.recovery || {}),
      artifactPaths: overrides.recovery?.artifactPaths || defaults.recovery.artifactPaths,
      signals: {
        ...defaults.recovery.signals,
        ...(overrides.recovery?.signals || {}),
      },
    },
    customer: {
      ...defaults.customer,
      ...(overrides.customer || {}),
      declared: overrides.customer?.declared || defaults.customer.declared,
      executed: overrides.customer?.executed || defaults.customer.executed,
      missing: overrides.customer?.missing || defaults.customer.missing,
      passed: overrides.customer?.passed || defaults.customer.passed,
      failed: overrides.customer?.failed || defaults.customer.failed,
      artifactPaths: overrides.customer?.artifactPaths || defaults.customer.artifactPaths,
      results: overrides.customer?.results || defaults.customer.results,
    },
    operator: {
      ...defaults.operator,
      ...(overrides.operator || {}),
      declared: overrides.operator?.declared || defaults.operator.declared,
      executed: overrides.operator?.executed || defaults.operator.executed,
      missing: overrides.operator?.missing || defaults.operator.missing,
      passed: overrides.operator?.passed || defaults.operator.passed,
      failed: overrides.operator?.failed || defaults.operator.failed,
      artifactPaths: overrides.operator?.artifactPaths || defaults.operator.artifactPaths,
      results: overrides.operator?.results || defaults.operator.results,
    },
    admin: {
      ...defaults.admin,
      ...(overrides.admin || {}),
      declared: overrides.admin?.declared || defaults.admin.declared,
      executed: overrides.admin?.executed || defaults.admin.executed,
      missing: overrides.admin?.missing || defaults.admin.missing,
      passed: overrides.admin?.passed || defaults.admin.passed,
      failed: overrides.admin?.failed || defaults.admin.failed,
      artifactPaths: overrides.admin?.artifactPaths || defaults.admin.artifactPaths,
      results: overrides.admin?.results || defaults.admin.results,
    },
    soak: {
      ...defaults.soak,
      ...(overrides.soak || {}),
      declared: overrides.soak?.declared || defaults.soak.declared,
      executed: overrides.soak?.executed || defaults.soak.executed,
      missing: overrides.soak?.missing || defaults.soak.missing,
      passed: overrides.soak?.passed || defaults.soak.passed,
      failed: overrides.soak?.failed || defaults.soak.failed,
      artifactPaths: overrides.soak?.artifactPaths || defaults.soak.artifactPaths,
      results: overrides.soak?.results || defaults.soak.results,
    },
    syntheticCoverage: {
      ...defaults.syntheticCoverage,
      ...(overrides.syntheticCoverage || {}),
      artifactPaths:
        overrides.syntheticCoverage?.artifactPaths || defaults.syntheticCoverage.artifactPaths,
      uncoveredPages:
        overrides.syntheticCoverage?.uncoveredPages || defaults.syntheticCoverage.uncoveredPages,
      results: overrides.syntheticCoverage?.results || defaults.syntheticCoverage.results,
    },
    worldState: {
      ...defaults.worldState,
      ...(overrides.worldState || {}),
      actorProfiles: overrides.worldState?.actorProfiles || defaults.worldState.actorProfiles,
      executedScenarios:
        overrides.worldState?.executedScenarios || defaults.worldState.executedScenarios,
      pendingAsyncExpectations:
        overrides.worldState?.pendingAsyncExpectations ||
        defaults.worldState.pendingAsyncExpectations,
      sessions: overrides.worldState?.sessions || defaults.worldState.sessions,
    },
    executionTrace: {
      ...defaults.executionTrace,
      ...(overrides.executionTrace || {}),
      phases: overrides.executionTrace?.phases || defaults.executionTrace.phases,
      artifactPaths:
        overrides.executionTrace?.artifactPaths || defaults.executionTrace.artifactPaths,
    },
  };
}

function buildGateEvidence(
  health: PulseHealth,
  evidence: PulseExecutionEvidence,
  codebaseTruth: PulseCodebaseTruth,
  resolvedManifest: PulseResolvedManifest,
): Partial<Record<PulseGateName, PulseEvidenceRecord[]>> {
  const staticBlocking = health.breaks.filter(
    (item) => isCriticalBreak(item) && !CHECKER_GAP_TYPES.has(item.type),
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
          staticBlocking.length > 0
            ? `${staticBlocking.length} critical/high blocking finding(s) remain in the scan graph.`
            : 'Static certification has no critical/high blocking findings.',
        artifactPaths: ['PULSE_REPORT.md', 'PULSE_CERTIFICATE.json'],
        metrics: {
          blockingBreaks: staticBlocking.length,
          totalBreaks: health.breaks.length,
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
      ...runtimeProbeRecords,
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
      metrics: {
        flowId: result.flowId,
        status: result.status,
        accepted: result.accepted,
      },
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
        summary: evidence.executionTrace.summary,
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
        ]),
      },
    ],
  };
}

function evaluateEvidenceFreshGate(evidence: PulseExecutionEvidence): PulseGateResult {
  if (evidence.executionTrace.phases.length === 0) {
    return gateFail(
      'Execution trace is missing, so the certification run cannot prove which phases actually executed.',
      'missing_evidence',
    );
  }

  if (
    evidence.runtime.backendUrl &&
    evidence.worldState.backendUrl &&
    evidence.runtime.backendUrl !== evidence.worldState.backendUrl
  ) {
    return gateFail(
      'Runtime evidence and world state point to different backend URLs.',
      'checker_gap',
    );
  }

  if (
    evidence.runtime.frontendUrl &&
    evidence.worldState.frontendUrl &&
    evidence.runtime.frontendUrl !== evidence.worldState.frontendUrl
  ) {
    return gateFail(
      'Runtime evidence and world state point to different frontend URLs.',
      'checker_gap',
    );
  }

  const timedOutPhases = evidence.executionTrace.phases.filter(
    (phase) => phase.phaseStatus === 'timed_out',
  );
  if (timedOutPhases.length > 0) {
    return gateFail(
      `Execution trace contains timed out phases: ${timedOutPhases.map((phase) => phase.phase).join(', ')}.`,
      'missing_evidence',
    );
  }

  return {
    status: 'pass',
    reason: 'Execution trace and attached evidence are internally coherent for this run.',
  };
}

function gateFail(reason: string, failureClass: PulseGateFailureClass): PulseGateResult {
  return {
    status: 'fail',
    reason,
    failureClass,
  };
}

function evaluateScopeGate(
  manifestResult: PulseManifestLoadResult,
  manifest: PulseManifest | null,
): PulseGateResult {
  const activeAcceptances = getActiveTemporaryAcceptances(manifest)
    .filter((entry) => entry.targetType === 'surface')
    .map((entry) => entry.target);
  const remainingUnknown = manifestResult.unknownSurfaces.filter(
    (surface) => !activeAcceptances.includes(surface),
  );

  if (remainingUnknown.length === 0) {
    return {
      status: 'pass',
      reason: 'All discovered surfaces are declared or explicitly excluded in the manifest.',
    };
  }

  return gateFail(
    `Undeclared discovered surfaces remain open: ${remainingUnknown.join(', ')}.`,
    'checker_gap',
  );
}

function evaluateTruthExtractionGate(
  codebaseTruth: PulseCodebaseTruth,
  resolvedManifest: PulseResolvedManifest,
): PulseGateResult {
  if (codebaseTruth.summary.totalPages === 0 || resolvedManifest.summary.totalModules === 0) {
    return gateFail(
      'Code-derived truth extraction did not discover frontend pages or modules.',
      'checker_gap',
    );
  }

  if (resolvedManifest.diagnostics.blockerCount > 0) {
    return gateFail(
      `Resolved manifest still has ${resolvedManifest.summary.unresolvedModules} unresolved module(s), ${resolvedManifest.summary.unresolvedFlowGroups} unresolved flow group(s), ${resolvedManifest.summary.orphanManualModules} orphan manual module(s), and ${resolvedManifest.summary.orphanFlowSpecs} orphan flow spec(s).`,
      'checker_gap',
    );
  }

  return {
    status: 'pass',
    reason: `Resolved manifest is aligned: ${resolvedManifest.summary.totalModules} module(s), ${resolvedManifest.summary.totalFlowGroups} flow group(s), no blocking drift.`,
  };
}

function evaluateStaticGate(health: PulseHealth, manifest: PulseManifest | null): PulseGateResult {
  const blockingBreaks = filterBlockingBreaks(health.breaks, undefined, manifest);
  if (blockingBreaks.length === 0) {
    return {
      status: 'pass',
      reason: 'Static certification has no critical/high blocking findings.',
    };
  }

  return gateFail(
    `Static certification found ${blockingBreaks.length} critical/high blocking finding(s).`,
    'product_failure',
  );
}

function evaluateRuntimeGate(
  env: PulseEnvironment,
  evidence: PulseExecutionEvidence,
): PulseGateResult {
  if (env === 'scan') {
    return gateFail(
      'Runtime evidence was not collected. Run PULSE with --deep or --total.',
      'missing_evidence',
    );
  }

  if (!evidence.runtime.executed) {
    return gateFail(
      evidence.runtime.summary ||
        'Runtime evidence is required in this mode, but it was not collected.',
      'missing_evidence',
    );
  }

  const requiredProbeFailures = evidence.runtime.probes.filter(
    (probe) => probe.required && (probe.status === 'failed' || probe.status === 'missing_evidence'),
  );
  if (requiredProbeFailures.length > 0) {
    const failureClass = chooseStructuredFailureClass(requiredProbeFailures);
    const affected = requiredProbeFailures.map((probe) => probe.probeId).join(', ');
    return gateFail(
      failureClass === 'missing_evidence'
        ? `Runtime probe evidence is missing for: ${affected}.`
        : `Runtime probes are failing: ${affected}.`,
      failureClass,
    );
  }

  if (evidence.runtime.blockingBreakTypes.length > 0) {
    return gateFail(
      `Runtime evidence found blocking break types: ${evidence.runtime.blockingBreakTypes.join(', ')}.`,
      'product_failure',
    );
  }

  return {
    status: 'pass',
    reason: evidence.runtime.summary || 'Runtime evidence executed without blocking findings.',
  };
}

function evaluateBrowserGate(
  env: PulseEnvironment,
  evidence: PulseExecutionEvidence,
  target: PulseCertificationTarget,
): PulseGateResult {
  if (env !== 'total') {
    return {
      status: 'pass',
      reason: 'Browser certification is not required in this environment.',
    };
  }

  if (target.profile === 'core-critical') {
    const browserCriticalScenarios = [
      ...evidence.customer.results,
      ...evidence.operator.results,
      ...evidence.admin.results,
      ...evidence.soak.results,
    ].filter(
      (result) => result.critical && result.requested && result.metrics?.requiresBrowser === true,
    );

    if (browserCriticalScenarios.length === 0) {
      return gateFail(
        'No browser-required critical scenarios were executed for the core-critical profile.',
        'missing_evidence',
      );
    }

    const blocking = browserCriticalScenarios.filter(
      (result) =>
        result.status === 'failed' ||
        result.status === 'missing_evidence' ||
        result.status === 'checker_gap' ||
        result.status === 'skipped',
    );

    if (blocking.length > 0) {
      const failureClass = chooseStructuredFailureClass(blocking);
      const affectedIds = blocking.map((result) => result.scenarioId).join(', ');
      return gateFail(
        failureClass === 'product_failure'
          ? `Browser-required critical scenarios are failing: ${affectedIds}.`
          : `Browser-required critical scenarios are missing evidence: ${affectedIds}.`,
        failureClass,
      );
    }

    return {
      status: 'pass',
      reason: `Browser-required critical scenarios passed: ${browserCriticalScenarios.map((result) => result.scenarioId).join(', ')}.`,
    };
  }

  if (!evidence.browser.attempted || !evidence.browser.executed) {
    return gateFail(
      evidence.browser.summary ||
        'Browser certification was required but did not produce evidence.',
      'missing_evidence',
    );
  }

  if ((evidence.browser.blockingInteractions || 0) > 0) {
    return gateFail(
      `${evidence.browser.blockingInteractions} blocking browser interaction(s) failed during total-mode certification.`,
      'product_failure',
    );
  }

  if ((evidence.browser.totalTested || 0) === 0) {
    return gateFail(
      'Browser run completed without testing interactive elements.',
      'missing_evidence',
    );
  }

  return {
    status: 'pass',
    reason: evidence.browser.summary || 'Browser certification passed.',
  };
}

function chooseStructuredFailureClass<
  T extends { failureClass?: PulseGateFailureClass; status: string },
>(results: T[]): PulseGateFailureClass {
  if (results.some((item) => item.failureClass === 'product_failure')) {
    return 'product_failure';
  }
  if (results.some((item) => item.failureClass === 'checker_gap')) {
    return 'checker_gap';
  }
  return 'missing_evidence';
}

function evaluateFlowGate(
  evidence: PulseExecutionEvidence,
  manifest: PulseManifest | null,
  requireNoAcceptedCritical: boolean,
): PulseGateResult {
  if (evidence.flows.declared.length === 0) {
    return {
      status: 'pass',
      reason: 'No critical flows are required in the current environment.',
    };
  }

  const acceptedCriticalFlows = requireNoAcceptedCritical
    ? getAcceptedCriticalFlows(manifest, evidence)
    : [];
  if (acceptedCriticalFlows.length > 0) {
    return gateFail(
      `Critical flows remain temporarily accepted and must execute before certification: ${acceptedCriticalFlows.join(', ')}.`,
      'missing_evidence',
    );
  }

  const blocking = evidence.flows.results.filter(
    (item) => item.status === 'failed' || item.status === 'missing_evidence',
  );
  if (blocking.length === 0) {
    return {
      status: 'pass',
      reason: evidence.flows.summary || 'All declared critical flows have evidence.',
    };
  }

  const failureClass = chooseStructuredFailureClass(blocking);
  const affectedIds = blocking.map((item) => item.flowId).join(', ');
  return gateFail(
    failureClass === 'missing_evidence'
      ? `Critical flow evidence is missing for: ${affectedIds}.`
      : `Critical flows are failing: ${affectedIds}.`,
    failureClass,
  );
}

function evaluateInvariantGate(evidence: PulseExecutionEvidence): PulseGateResult {
  if (evidence.invariants.declared.length === 0) {
    return {
      status: 'pass',
      reason: 'No critical invariants are required in the current environment.',
    };
  }

  const blocking = evidence.invariants.results.filter(
    (item) => item.status === 'failed' || item.status === 'missing_evidence',
  );
  if (blocking.length === 0) {
    return {
      status: 'pass',
      reason: evidence.invariants.summary || 'Invariant evidence is complete.',
    };
  }

  const failureClass = chooseStructuredFailureClass(blocking);
  const affectedIds = blocking.map((item) => item.invariantId).join(', ');
  return gateFail(
    failureClass === 'missing_evidence'
      ? `Invariant evidence is missing for: ${affectedIds}.`
      : `Invariant checks are failing: ${affectedIds}.`,
    failureClass,
  );
}

function evaluateActorGate(
  label: string,
  evidence: PulseActorEvidence,
  requireCriticalExecution: boolean,
): PulseGateResult {
  if (evidence.declared.length === 0) {
    return gateFail(`No ${label} scenarios are declared in the resolved manifest.`, 'checker_gap');
  }

  if (requireCriticalExecution) {
    const skipped = evidence.results.filter((item) => item.critical && item.status === 'skipped');
    if (skipped.length > 0) {
      return gateFail(
        `${label} synthetic execution is still missing for: ${skipped.map((item) => item.scenarioId).join(', ')}.`,
        'missing_evidence',
      );
    }
  }

  const blocking = evidence.results.filter(
    (item) =>
      item.critical &&
      (item.status === 'failed' ||
        item.status === 'missing_evidence' ||
        item.status === 'checker_gap'),
  );
  if (blocking.length === 0) {
    return {
      status: 'pass',
      reason: evidence.summary || `${label} synthetic actor scenarios passed.`,
    };
  }

  const failureClass = chooseStructuredFailureClass(blocking);
  const affectedIds = blocking.map((item) => item.scenarioId).join(', ');
  return gateFail(
    failureClass === 'missing_evidence'
      ? `${label} synthetic evidence is missing for: ${affectedIds}.`
      : failureClass === 'checker_gap'
        ? `${label} synthetic scenarios have checker gaps: ${affectedIds}.`
        : `${label} synthetic scenarios are failing: ${affectedIds}.`,
    failureClass,
  );
}

function evaluateSyntheticCoverageGate(evidence: PulseExecutionEvidence): PulseGateResult {
  if (!evidence.syntheticCoverage.executed) {
    return gateFail(
      evidence.syntheticCoverage.summary || 'Synthetic coverage evidence was not generated.',
      'missing_evidence',
    );
  }

  if (evidence.syntheticCoverage.uncoveredPages.length > 0) {
    return gateFail(
      `Synthetic coverage still misses ${evidence.syntheticCoverage.uncoveredPages.length} page(s): ${evidence.syntheticCoverage.uncoveredPages.join(', ')}.`,
      'checker_gap',
    );
  }

  return {
    status: 'pass',
    reason:
      evidence.syntheticCoverage.summary ||
      'All discovered user-facing surfaces are mapped to scenarios.',
  };
}

function evaluatePatternGate(
  gateName: PulseGateName,
  passReason: string,
  failReason: string,
  health: PulseHealth,
  manifest: PulseManifest | null,
  patterns: RegExp[],
): PulseGateResult {
  const blockingBreaks = filterBlockingBreaks(
    health.breaks,
    (item) => matchesAny(item.type, patterns),
    manifest,
  );

  if (blockingBreaks.length === 0) {
    return {
      status: 'pass',
      reason: passReason,
    };
  }

  if (isGateAccepted(manifest, gateName)) {
    return acceptedGatePass(manifest, gateName);
  }

  return gateFail(
    `${failReason} Blocking types: ${summarizeBreakTypes(blockingBreaks).join(', ')}.`,
    'product_failure',
  );
}

function evaluateRecoveryGate(
  env: PulseEnvironment,
  health: PulseHealth,
  manifest: PulseManifest | null,
  evidence: PulseExecutionEvidence,
): PulseGateResult {
  if (!evidence.recovery.executed) {
    return gateFail(
      evidence.recovery.summary ||
        (env === 'scan'
          ? 'Recovery evidence was not exercised in scan mode.'
          : 'Recovery evidence was not collected.'),
      'missing_evidence',
    );
  }

  return evaluatePatternGate(
    'recoveryPass',
    'Recovery and rollback requirements have no blocking findings in this run.',
    'Recovery certification found blocking findings.',
    health,
    manifest,
    RECOVERY_PATTERNS,
  );
}

function evaluateObservabilityGate(
  health: PulseHealth,
  manifest: PulseManifest | null,
  evidence: PulseExecutionEvidence,
): PulseGateResult {
  if (!evidence.observability.executed) {
    return gateFail(
      evidence.observability.summary || 'Observability evidence was not collected.',
      'missing_evidence',
    );
  }

  return evaluatePatternGate(
    'observabilityPass',
    'Observability and audit requirements have no blocking findings in this run.',
    'Observability certification found blocking findings.',
    health,
    manifest,
    OBSERVABILITY_PATTERNS,
  );
}

function withTemporaryGateAcceptance(
  gateName: PulseGateName,
  manifest: PulseManifest | null,
  result: PulseGateResult,
): PulseGateResult {
  if (result.status === 'fail' && isGateAccepted(manifest, gateName)) {
    return acceptedGatePass(manifest, gateName);
  }
  return result;
}

function computeScore(rawScore: number, gates: Record<PulseGateName, PulseGateResult>): number {
  const passed = GATE_ORDER.filter((gateName) => gates[gateName].status === 'pass').length;
  const gateScore = Math.round((passed / GATE_ORDER.length) * 100);
  if (passed === GATE_ORDER.length) {
    return 100;
  }
  return Math.max(0, Math.min(rawScore, gateScore));
}

function buildTierStatuses(
  tiers: PulseManifestCertificationTier[],
  gates: Record<PulseGateName, PulseGateResult>,
  manifest: PulseManifest | null,
  evidence: PulseExecutionEvidence,
): PulseCertificationTierStatus[] {
  const acceptedCriticalFlows = getAcceptedCriticalFlows(manifest, evidence);
  const pendingCriticalScenarios = getPendingCriticalScenarios(evidence);
  const hasPendingCriticalWorldState = worldStateHasPendingCriticalExpectations(evidence);

  return tiers.map((tier) => {
    const blockingGates = tier.gates.filter((gateName) => gates[gateName]?.status === 'fail');
    const extraFailures: string[] = [];

    if (tier.requireNoAcceptedFlows && acceptedCriticalFlows.length > 0) {
      extraFailures.push(`accepted flows: ${acceptedCriticalFlows.join(', ')}`);
    }
    if (tier.requireNoAcceptedScenarios && pendingCriticalScenarios.length > 0) {
      extraFailures.push(`pending critical scenarios: ${pendingCriticalScenarios.join(', ')}`);
    }
    if (tier.requireWorldStateConvergence && hasPendingCriticalWorldState) {
      extraFailures.push('critical async expectations still pending in world state');
    }

    const status = blockingGates.length === 0 && extraFailures.length === 0 ? 'pass' : 'fail';
    const reason =
      status === 'pass'
        ? `${tier.name} passed all hard gate requirements.`
        : [
            blockingGates.length > 0 ? `blocking gates: ${blockingGates.join(', ')}` : '',
            ...extraFailures,
          ]
            .filter(Boolean)
            .join('; ');

    return {
      id: tier.id,
      name: tier.name,
      status,
      gates: tier.gates,
      blockingGates,
      reason,
    };
  });
}

function getBlockingTier(tierStatuses: PulseCertificationTierStatus[]): number | null {
  const first = tierStatuses.find((tier) => tier.status === 'fail');
  return first ? first.id : null;
}

/** Compute certification. */
export function computeCertification(input: ComputeCertificationInput): PulseCertification {
  const env = getEnvironment();
  const manifest = input.manifestResult.manifest;
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
  );

  const gates: Record<PulseGateName, PulseGateResult> = {
    scopeClosed: withTemporaryGateAcceptance(
      'scopeClosed',
      manifest,
      evaluateScopeGate(input.manifestResult, manifest),
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
      evaluateTruthExtractionGate(input.codebaseTruth, input.resolvedManifest),
    ),
    staticPass: withTemporaryGateAcceptance(
      'staticPass',
      manifest,
      evaluateStaticGate(input.health, manifest),
    ),
    runtimePass: withTemporaryGateAcceptance(
      'runtimePass',
      manifest,
      evaluateRuntimeGate(env, evidenceSummary),
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
    ),
    isolationPass: evaluatePatternGate(
      'isolationPass',
      'No blocking tenant isolation findings are open.',
      'Isolation certification found blocking findings.',
      input.health,
      manifest,
      ISOLATION_PATTERNS,
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
      evaluateActorGate(
        'customer',
        evidenceSummary.customer,
        targetRequiresCustomerExecution(certificationTarget),
      ),
    ),
    operatorPass: withTemporaryGateAcceptance(
      'operatorPass',
      manifest,
      evaluateActorGate(
        'operator',
        evidenceSummary.operator,
        targetRequiresOperatorExecution(certificationTarget),
      ),
    ),
    adminPass: withTemporaryGateAcceptance(
      'adminPass',
      manifest,
      evaluateActorGate(
        'admin',
        evidenceSummary.admin,
        targetRequiresOperatorExecution(certificationTarget),
      ),
    ),
    soakPass: withTemporaryGateAcceptance(
      'soakPass',
      manifest,
      evaluateActorGate(
        'soak',
        evidenceSummary.soak,
        targetRequiresSoakExecution(certificationTarget),
      ),
    ),
    syntheticCoveragePass: withTemporaryGateAcceptance(
      'syntheticCoveragePass',
      manifest,
      evaluateSyntheticCoverageGate(evidenceSummary),
    ),
    evidenceFresh: evaluateEvidenceFreshGate(evidenceSummary),
    pulseSelfTrustPass:
      input.parserInventory.unavailableChecks.length === 0
        ? {
            status: 'pass',
            reason: 'All discovered parser checks loaded successfully.',
          }
        : withTemporaryGateAcceptance(
            'pulseSelfTrustPass',
            manifest,
            gateFail(
              `Parser self-trust failed because ${input.parserInventory.unavailableChecks.length} check(s) could not load.`,
              'checker_gap',
            ),
          ),
  };

  const foundationalGates: PulseGateName[] = [
    'scopeClosed',
    'adapterSupported',
    'specComplete',
    'truthExtractionPass',
    'pulseSelfTrustPass',
  ];
  const allPass = GATE_ORDER.every((gateName) => gates[gateName].status === 'pass');
  const foundationsPass = foundationalGates.every((gateName) => gates[gateName].status === 'pass');
  const tierStatus = buildTierStatuses(certificationTiers, gates, manifest, evidenceSummary);
  const blockingTier = getBlockingTier(tierStatus);
  const acceptedFlowsRemaining = getAcceptedCriticalFlows(manifest, evidenceSummary);
  const pendingCriticalScenarios = getPendingCriticalScenarios(evidenceSummary);
  const finalReadinessPass =
    (!finalReadinessCriteria.requireAllTiersPass ||
      tierStatus.every((tier) => tier.status === 'pass')) &&
    (!finalReadinessCriteria.requireNoAcceptedCriticalFlows ||
      acceptedFlowsRemaining.length === 0) &&
    (!finalReadinessCriteria.requireNoAcceptedCriticalScenarios ||
      pendingCriticalScenarios.length === 0) &&
    (!finalReadinessCriteria.requireWorldStateConvergence ||
      !worldStateHasPendingCriticalExpectations(evidenceSummary));

  const rawScore = input.health.score;
  const score = computeScore(rawScore, gates);
  const criticalFailures = GATE_ORDER.filter((gateName) => gates[gateName].status === 'fail').map(
    (gateName) => `${gateName}: ${gates[gateName].reason}`,
  );

  let status: PulseCertification['status'];
  if (!foundationsPass) {
    status = 'NOT_CERTIFIED';
  } else if (certificationTarget.final) {
    status = finalReadinessPass ? 'CERTIFIED' : 'PARTIAL';
  } else if (typeof certificationTarget.tier === 'number') {
    const requestedTiers = tierStatus.filter((tier) => tier.id <= certificationTarget.tier);
    status = requestedTiers.every((tier) => tier.status === 'pass') ? 'CERTIFIED' : 'PARTIAL';
  } else {
    status = allPass ? 'CERTIFIED' : 'PARTIAL';
  }

  return {
    version: '2.5.0',
    status,
    humanReplacementStatus: finalReadinessPass && allPass ? 'READY' : 'NOT_READY',
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
    resolvedManifestSummary: input.resolvedManifest.summary,
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
  };
}
