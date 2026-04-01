import { execSync } from 'child_process';
import type {
  Break,
  PulseCertification,
  PulseEvidenceRecord,
  PulseExecutionEvidence,
  PulseGateFailureClass,
  PulseGateName,
  PulseGateResult,
  PulseHealth,
  PulseManifest,
  PulseManifestLoadResult,
  PulseParserInventory,
} from './types';

interface ComputeCertificationInput {
  rootDir: string;
  manifestResult: PulseManifestLoadResult;
  parserInventory: PulseParserInventory;
  health: PulseHealth;
  executionEvidence?: Partial<PulseExecutionEvidence>;
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

const ISOLATION_PATTERNS = [
  /WORKSPACE_ISOLATION/,
  /MISSING_WORKSPACE_FILTER/,
  /TENANT_/,
];

const RECOVERY_PATTERNS = [
  /^BACKUP_MISSING$/,
  /^DR_/,
  /ROLLBACK/,
  /DEPLOY_NO_FEATURE_FLAGS/,
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

const INVARIANT_PATTERNS = [
  /IDEMPOTENCY_/,
  /AUDIT_/,
  /BUSINESS_/,
  /^STATE_/,
  /^RACE_CONDITION_/,
  /^ORDERING_/,
  /^CACHE_/,
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
  'evidenceFresh',
  'pulseSelfTrustPass',
];

function getEnvironment(): PulseCertification['environment'] {
  if (process.env.PULSE_TOTAL === '1') return 'total';
  if (process.env.PULSE_DEEP === '1') return 'deep';
  return 'scan';
}

function getCommitSha(rootDir: string): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: rootDir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
}

function isCriticalBreak(item: Break): boolean {
  return item.severity === 'critical' || item.severity === 'high';
}

function matchesAny(type: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(type));
}

function getActiveTemporaryAcceptances(manifest: PulseManifest | null): PulseManifest['temporaryAcceptances'] {
  if (!manifest) return [];
  const now = Date.now();
  return manifest.temporaryAcceptances.filter(entry => {
    const expiresAt = Date.parse(entry.expiresAt);
    return Number.isFinite(expiresAt) && expiresAt >= now;
  });
}

function isGateAccepted(manifest: PulseManifest | null, gate: PulseGateName): boolean {
  return getActiveTemporaryAcceptances(manifest).some(entry => entry.targetType === 'gate' && entry.target === gate);
}

function isBreakTypeAccepted(manifest: PulseManifest | null, type: Break['type']): boolean {
  return getActiveTemporaryAcceptances(manifest).some(entry => entry.targetType === 'break_type' && entry.target === type);
}

function acceptedGatePass(manifest: PulseManifest | null, gate: PulseGateName): PulseGateResult {
  const entry = getActiveTemporaryAcceptances(manifest).find(item => item.targetType === 'gate' && item.target === gate);
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
  return breaks.filter(item => {
    if (!isCriticalBreak(item)) return false;
    if (CHECKER_GAP_TYPES.has(item.type)) return false;
    if (manifest && isBreakTypeAccepted(manifest, item.type)) return false;
    return predicate ? predicate(item) : true;
  });
}

function inferRuntimeCheckNames(parserInventory: PulseParserInventory): string[] {
  return parserInventory.loadedChecks
    .map(check => check.name)
    .filter(name => /build|test|e2e|crud|auth-flow|contract|performance|browser|responsive|hydration|accessibility|chaos|concurrency|backup|rollback|monitoring|observability|audit|npm-audit|webhook|state-machine|cache-invalidation|disaster-recovery/i.test(name))
    .sort();
}

function summarizeBreakTypes(breaks: Break[]): string[] {
  return [...new Set(breaks.map(item => item.type))].sort();
}

function buildDefaultEvidence(
  env: PulseCertification['environment'],
  manifest: PulseManifest | null,
  parserInventory: PulseParserInventory,
  health: PulseHealth,
): PulseExecutionEvidence {
  const runtimeBreaks = filterBlockingBreaks(
    health.breaks,
    item => matchesAny(item.type, RUNTIME_PATTERNS),
    manifest,
  );
  const flowIds = manifest?.flowSpecs.map(spec => spec.id) || manifest?.criticalFlows || [];
  const invariantIds = manifest?.invariantSpecs.map(spec => spec.id) || manifest?.invariants || [];

  return {
    runtime: env === 'scan'
      ? {
          executed: false,
          executedChecks: [],
          blockingBreakTypes: [],
          artifactPaths: [],
          summary: 'Runtime evidence was not collected in scan mode.',
        }
      : {
          executed: true,
          executedChecks: inferRuntimeCheckNames(parserInventory),
          blockingBreakTypes: summarizeBreakTypes(runtimeBreaks),
          artifactPaths: [],
          summary: runtimeBreaks.length > 0
            ? `Runtime evidence executed with ${runtimeBreaks.length} blocking runtime finding(s).`
            : 'Runtime evidence executed without blocking runtime findings.',
        },
    browser: env === 'total'
      ? {
          attempted: false,
          executed: false,
          artifactPaths: [],
          summary: 'Total mode requires browser evidence, but none has been attached yet.',
        }
      : {
          attempted: false,
          executed: false,
          artifactPaths: [],
          summary: 'Browser evidence is only required in total mode.',
        },
    flows: {
      declared: flowIds,
      executed: [],
      missing: [...flowIds],
      summary: flowIds.length > 0
        ? `No formal flow evidence is attached for ${flowIds.length} declared flow(s).`
        : 'No formal flows are declared in the manifest.',
    },
    invariants: {
      declared: invariantIds,
      evaluated: [],
      missing: [...invariantIds],
      summary: invariantIds.length > 0
        ? `No formal invariant evidence is attached for ${invariantIds.length} declared invariant(s).`
        : 'No formal invariants are declared in the manifest.',
    },
  };
}

function mergeExecutionEvidence(
  defaults: PulseExecutionEvidence,
  overrides?: Partial<PulseExecutionEvidence>,
): PulseExecutionEvidence {
  if (!overrides) return defaults;

  return {
    runtime: {
      ...defaults.runtime,
      ...(overrides.runtime || {}),
      executedChecks: overrides.runtime?.executedChecks || defaults.runtime.executedChecks,
      blockingBreakTypes: overrides.runtime?.blockingBreakTypes || defaults.runtime.blockingBreakTypes,
      artifactPaths: overrides.runtime?.artifactPaths || defaults.runtime.artifactPaths,
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
    },
    invariants: {
      ...defaults.invariants,
      ...(overrides.invariants || {}),
      declared: overrides.invariants?.declared || defaults.invariants.declared,
      evaluated: overrides.invariants?.evaluated || defaults.invariants.evaluated,
      missing: overrides.invariants?.missing || defaults.invariants.missing,
    },
  };
}

function buildGateEvidence(
  health: PulseHealth,
  evidence: PulseExecutionEvidence,
): Partial<Record<PulseGateName, PulseEvidenceRecord[]>> {
  const staticBlocking = filterBlockingBreaks(health.breaks);
  return {
    staticPass: [{
      kind: 'artifact',
      executed: true,
      summary: staticBlocking.length > 0
        ? `${staticBlocking.length} critical/high blocking finding(s) remain in the scan graph.`
        : 'Static certification has no critical/high blocking findings.',
      artifactPaths: ['PULSE_REPORT.md', 'PULSE_CERTIFICATE.json'],
      metrics: {
        blockingBreaks: staticBlocking.length,
        totalBreaks: health.breaks.length,
      },
    }],
    runtimePass: [{
      kind: 'runtime',
      executed: evidence.runtime.executed,
      summary: evidence.runtime.summary,
      artifactPaths: evidence.runtime.artifactPaths,
      metrics: {
        executedChecks: evidence.runtime.executedChecks.length,
        blockingBreakTypes: evidence.runtime.blockingBreakTypes.length,
      },
    }],
    browserPass: [{
      kind: 'browser',
      executed: evidence.browser.executed,
      summary: evidence.browser.summary,
      artifactPaths: evidence.browser.artifactPaths,
      metrics: {
        attempted: evidence.browser.attempted,
        totalPages: evidence.browser.totalPages || 0,
        totalTested: evidence.browser.totalTested || 0,
        passRate: evidence.browser.passRate || 0,
        blockingInteractions: evidence.browser.blockingInteractions || 0,
      },
    }],
    flowPass: [{
      kind: 'flow',
      executed: evidence.flows.executed.length > 0,
      summary: evidence.flows.summary,
      artifactPaths: [],
      metrics: {
        declared: evidence.flows.declared.length,
        executed: evidence.flows.executed.length,
        missing: evidence.flows.missing.length,
      },
    }],
    invariantPass: [{
      kind: 'invariant',
      executed: evidence.invariants.evaluated.length > 0,
      summary: evidence.invariants.summary,
      artifactPaths: [],
      metrics: {
        declared: evidence.invariants.declared.length,
        evaluated: evidence.invariants.evaluated.length,
        missing: evidence.invariants.missing.length,
      },
    }],
    evidenceFresh: [
      {
        kind: 'artifact',
        executed: true,
        summary: 'Certification artifacts were generated in the current run.',
        artifactPaths: ['PULSE_REPORT.md', 'AUDIT_FEATURE_MATRIX.md', 'PULSE_CERTIFICATE.json'],
      },
    ],
  };
}

function gateFail(reason: string, failureClass: PulseGateFailureClass): PulseGateResult {
  return {
    status: 'fail',
    reason,
    failureClass,
  };
}

function evaluateScopeGate(manifestResult: PulseManifestLoadResult, manifest: PulseManifest | null): PulseGateResult {
  const activeAcceptances = getActiveTemporaryAcceptances(manifest)
    .filter(entry => entry.targetType === 'surface')
    .map(entry => entry.target);
  const remainingUnknown = manifestResult.unknownSurfaces.filter(surface => !activeAcceptances.includes(surface));

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
  env: PulseCertification['environment'],
  manifest: PulseManifest | null,
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
      evidence.runtime.summary || 'Runtime evidence is required in this mode, but it was not collected.',
      'missing_evidence',
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
  env: PulseCertification['environment'],
  manifest: PulseManifest | null,
  evidence: PulseExecutionEvidence,
): PulseGateResult {
  if (env !== 'total') {
    return gateFail(
      'Browser evidence is only collected in total mode.',
      'missing_evidence',
    );
  }

  if (!evidence.browser.attempted || !evidence.browser.executed) {
    return gateFail(
      evidence.browser.summary || 'Browser certification was required but did not produce evidence.',
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

function evaluateFlowGate(manifest: PulseManifest | null, evidence: PulseExecutionEvidence): PulseGateResult {
  const declaredCritical = manifest?.flowSpecs.filter(spec => spec.critical).map(spec => spec.id)
    || manifest?.criticalFlows
    || [];
  const missing = declaredCritical.filter(flowId => !evidence.flows.executed.includes(flowId));

  if (declaredCritical.length === 0) {
    return {
      status: 'pass',
      reason: 'No critical flows are declared in the manifest.',
    };
  }

  if (missing.length > 0) {
    return gateFail(
      `Critical flow evidence is missing for: ${missing.join(', ')}.`,
      'missing_evidence',
    );
  }

  return {
    status: 'pass',
    reason: evidence.flows.summary || 'All declared critical flows have evidence.',
  };
}

function evaluateInvariantGate(
  manifest: PulseManifest | null,
  evidence: PulseExecutionEvidence,
  health: PulseHealth,
): PulseGateResult {
  const declaredCritical = manifest?.invariantSpecs.filter(spec => spec.critical).map(spec => spec.id)
    || manifest?.invariants
    || [];
  const blockingInvariantBreaks = filterBlockingBreaks(
    health.breaks,
    item => matchesAny(item.type, INVARIANT_PATTERNS),
    manifest,
  );
  const missing = declaredCritical.filter(id => !evidence.invariants.evaluated.includes(id));

  if (blockingInvariantBreaks.length > 0) {
    return gateFail(
      `Invariant-related blocking findings remain open: ${summarizeBreakTypes(blockingInvariantBreaks).join(', ')}.`,
      'product_failure',
    );
  }

  if (declaredCritical.length > 0 && missing.length > 0) {
    return gateFail(
      `Invariant evidence is missing for: ${missing.join(', ')}.`,
      'missing_evidence',
    );
  }

  return {
    status: 'pass',
    reason: evidence.invariants.summary || 'Invariant evidence is complete.',
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
    item => matchesAny(item.type, patterns),
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
  const passed = GATE_ORDER.filter(gateName => gates[gateName].status === 'pass').length;
  const gateScore = Math.round((passed / GATE_ORDER.length) * 100);
  if (passed === GATE_ORDER.length) return 100;
  return Math.max(0, Math.min(rawScore, gateScore));
}

export function computeCertification(input: ComputeCertificationInput): PulseCertification {
  const env = getEnvironment();
  const manifest = input.manifestResult.manifest;
  const timestamp = new Date().toISOString();
  const defaults = buildDefaultEvidence(env, manifest, input.parserInventory, input.health);
  const evidenceSummary = mergeExecutionEvidence(defaults, input.executionEvidence);
  const gateEvidence = buildGateEvidence(input.health, evidenceSummary);

  const gates: Record<PulseGateName, PulseGateResult> = {
    scopeClosed: withTemporaryGateAcceptance('scopeClosed', manifest, evaluateScopeGate(input.manifestResult, manifest)),
    adapterSupported: input.manifestResult.unsupportedStacks.length === 0
      ? {
          status: 'pass',
          reason: 'All declared stack adapters are supported by the current PULSE foundation.',
        }
      : withTemporaryGateAcceptance('adapterSupported', manifest, gateFail(
          `Unsupported adapters declared in manifest: ${input.manifestResult.unsupportedStacks.join(', ')}.`,
          'checker_gap',
        )),
    specComplete: input.manifestResult.manifest !== null && input.manifestResult.issues.length === 0
      ? {
          status: 'pass',
          reason: 'pulse.manifest.json is present and passed structural validation.',
        }
      : withTemporaryGateAcceptance('specComplete', manifest, gateFail(
          input.manifestResult.issues.map(issue => issue.description).join(' ') || 'pulse.manifest.json is missing or invalid.',
          'checker_gap',
        )),
    staticPass: withTemporaryGateAcceptance('staticPass', manifest, evaluateStaticGate(input.health, manifest)),
    runtimePass: withTemporaryGateAcceptance('runtimePass', manifest, evaluateRuntimeGate(env, manifest, evidenceSummary)),
    browserPass: withTemporaryGateAcceptance('browserPass', manifest, evaluateBrowserGate(env, manifest, evidenceSummary)),
    flowPass: withTemporaryGateAcceptance('flowPass', manifest, evaluateFlowGate(manifest, evidenceSummary)),
    invariantPass: withTemporaryGateAcceptance('invariantPass', manifest, evaluateInvariantGate(manifest, evidenceSummary, input.health)),
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
      env === 'scan'
        ? gateFail(
            'Recovery evidence was not exercised in scan mode.',
            'missing_evidence',
          )
        : evaluatePatternGate(
            'recoveryPass',
            'Recovery and rollback requirements have no blocking findings in this run.',
            'Recovery certification found blocking findings.',
            input.health,
            manifest,
            RECOVERY_PATTERNS,
          ),
    ),
    performancePass: withTemporaryGateAcceptance(
      'performancePass',
      manifest,
      env === 'scan'
        ? gateFail(
            'Performance evidence was not exercised in scan mode.',
            'missing_evidence',
          )
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
      evaluatePatternGate(
        'observabilityPass',
        'Observability and audit requirements have no blocking findings in this run.',
        'Observability certification found blocking findings.',
        input.health,
        manifest,
        OBSERVABILITY_PATTERNS,
      ),
    ),
    evidenceFresh: {
      status: 'pass',
      reason: 'All certification artifacts in this run are fresh.',
    },
    pulseSelfTrustPass: input.parserInventory.unavailableChecks.length === 0
      ? {
          status: 'pass',
          reason: 'All discovered parser checks loaded successfully.',
        }
      : withTemporaryGateAcceptance('pulseSelfTrustPass', manifest, gateFail(
          `Parser self-trust failed because ${input.parserInventory.unavailableChecks.length} check(s) could not load.`,
          'checker_gap',
        )),
  };

  const foundationalGates: PulseGateName[] = [
    'scopeClosed',
    'adapterSupported',
    'specComplete',
    'pulseSelfTrustPass',
  ];
  const allPass = GATE_ORDER.every(gateName => gates[gateName].status === 'pass');
  const foundationsPass = foundationalGates.every(gateName => gates[gateName].status === 'pass');

  const rawScore = input.health.score;
  const score = computeScore(rawScore, gates);
  const criticalFailures = GATE_ORDER
    .filter(gateName => gates[gateName].status === 'fail')
    .map(gateName => `${gateName}: ${gates[gateName].reason}`);

  return {
    version: '2.0.0',
    status: !foundationsPass ? 'NOT_CERTIFIED' : allPass ? 'CERTIFIED' : 'PARTIAL',
    rawScore,
    score,
    commitSha: getCommitSha(input.rootDir),
    environment: env,
    timestamp,
    manifestPath: input.manifestResult.manifestPath,
    unknownSurfaces: input.manifestResult.unknownSurfaces.filter(surface => !getActiveTemporaryAcceptances(manifest).some(entry => entry.targetType === 'surface' && entry.target === surface)),
    unavailableChecks: input.parserInventory.unavailableChecks.map(item => item.name),
    unsupportedStacks: input.manifestResult.unsupportedStacks,
    criticalFailures,
    gates,
    evidenceSummary,
    gateEvidence,
  };
}
