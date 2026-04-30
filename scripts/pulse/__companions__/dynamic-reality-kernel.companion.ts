// ── Numeric probes ─────────────────────────────────────────────────────────

export function deriveNumericProbeValuesFromObservedCatalog(rng: () => number): number[] {
  let all = discoverAllObservedHttpStatusCodes();
  let okLen = observeStatusTextLengthFromCatalog(deriveHttpStatusFromObservedCatalog('OK'));
  let forbidLen = observeStatusTextLengthFromCatalog(
    deriveHttpStatusFromObservedCatalog('Forbidden'),
  );
  let scale = deriveCatalogPercentScaleFromObservedCatalog();
  let mx = Number.MAX_SAFE_INTEGER / scale;
  let sl = all.slice(0, okLen);
  let dec = sl.map((v) => v / scale);
  let gen = Array.from({ length: forbidLen }, () => Math.round(rng() * mx) / scale);
  return [...new Set([0, deriveUnitValue(), ...sl, ...dec, ...gen])];
}

export function deriveLengthBoundariesFromObservedCatalog(): number[] {
  let u = deriveUnitValue();
  let ok = deriveHttpStatusFromObservedCatalog('OK');
  let bad = deriveHttpStatusFromObservedCatalog('Bad Request');
  let forbid = deriveHttpStatusFromObservedCatalog('Forbidden');
  let nf = deriveHttpStatusFromObservedCatalog('Not Found');
  let rb = ok + bad + forbid;
  let ub = Math.pow(u + u, observeStatusTextLengthFromCatalog(nf));
  return [0, u, rb - u, rb, rb + u, ub - u, ub, ub + u];
}

export function deriveRuntimeStringBoundaryFromObservedCatalog(): number {
  return (
    deriveHttpStatusFromObservedCatalog('OK') +
    deriveHttpStatusFromObservedCatalog('Bad Request') +
    deriveHttpStatusFromObservedCatalog('Forbidden')
  );
}

// ── Identity / alphabet ────────────────────────────────────────────────────

export function deriveIdentifierAlphabetFromObservedSeeds(identitySeeds: string[]): string {
  let obs = identitySeeds.join('');
  let alpha = [...obs.toLowerCase()]
    .filter((c) => /[a-z0-9_-]/.test(c))
    .filter((c, i, a) => a.indexOf(c) === i)
    .join('');
  return alpha || 'abcdefghijklmnopqrstuvwxyz0123456789_-';
}

export function deriveSpecialCharactersFromRuntimeEvidence(): string[] {
  return [
    String.fromCharCode(0),
    ...JSON.stringify({ key: 'value' })
      .split('')
      .filter((c) => !/[A-Za-z0-9]/.test(c)),
    discoverRouteSeparatorFromRuntime(),
    path.sep,
  ].filter((v, i, a) => a.indexOf(v) === i);
}

// ── Money probes ───────────────────────────────────────────────────────────

export function deriveMoneyProbeStringsFromObservedCatalog(
  functionName: string,
  rng: () => number,
  valid: boolean,
): string[] {
  let u = deriveUnitValue();
  let pay = deriveHttpStatusFromObservedCatalog('Payment Required');
  let fl = observeStatusTextLengthFromCatalog(deriveHttpStatusFromObservedCatalog('Forbidden'));
  let ok = deriveHttpStatusFromObservedCatalog('OK');
  let bm = Math.floor(pay / Math.max(u, fl)) - u - u;
  let mn = ok / (u + u + u + u);
  let fd = (maj: number, mnr: number) => `${maj}.${mnr.toString().padStart(u + u, '0')}`;
  let fb = (maj: number, mnr: number) =>
    `R$ ${maj.toLocaleString('pt-BR')},${mnr.toString().padStart(u + u, '0')}`;
  let cat = [fd(0, 0), fd(u, 0), fb(u, 0), fb(bm, mn)];
  if (valid)
    return cat.concat(
      deriveNumericProbeValuesFromObservedCatalog(rng)
        .slice(0, fl)
        .map((v) => fd(Math.floor(Math.abs(v)), 0)),
    );
  let tok = functionName || 'currency';
  return [
    String(undefined),
    String(null),
    '',
    String(Object.create(null)),
    String([]),
    `-${fd(u, 0)}`,
    `${fb(u, 0)}${tok}`,
  ];
}

// ── Adversarial payloads ───────────────────────────────────────────────────

export function deriveAdversarialPayloadsFromObservedEvidence(): string[] {
  let u = deriveUnitValue();
  let ok = deriveHttpStatusFromObservedCatalog('OK');
  let q = String.fromCharCode(observeStatusTextLengthFromCatalog(ok));
  let sl = discoverRouteSeparatorFromRuntime();
  let cm = `${sl}${String.fromCharCode(observeStatusTextLengthFromCatalog(ok))}`;
  return [
    `${q} OR ${u}=${u} ${cm}`,
    JSON.stringify({ [`$${Object.name.toLowerCase()}`]: `${u}=${u}` }),
    `<script>alert(${u})</script>`,
    `${Array(u + u)
      .fill('..')
      .join(sl)}/etc/passwd`,
  ];
}

// ── Enum discovery ─────────────────────────────────────────────────────────

export function discoverEnumMembersFromCandidateEvidence(
  params: string[],
  functionName: string,
): string[] {
  if (params.length > 0) return [...new Set(params)];
  let words = [...splitIdentifierTokensFromObservedName(functionName)]
    .map((w) => w.toUpperCase())
    .filter((w) => w.length > 2);
  return words.length > 0 ? [...new Set(words)] : [functionName.toUpperCase()];
}

export function detectBrlCurrencyFromObservedInput(value: string): boolean {
  return value.includes('R$') || value.includes(',');
}

// ── Identity seeds ─────────────────────────────────────────────────────────

export function deriveStringIdentitySeedsFromCandidate(
  functionName: string,
  params: string[],
): string[] {
  let tokens = [...splitIdentifierTokensFromObservedName(functionName), ...params];
  let stable = tokens.filter(Boolean);
  let primary = stable.join('-') || functionName;
  let scale = deriveCatalogPercentScaleFromObservedCatalog();
  let num = hashStringToObservedSeed(primary).toString(scale);
  let host = 'pulse.invalid';
  return [
    primary,
    `${primary}_${num}`,
    `${host}-${num}`,
    `${primary}@${host}`,
    `http://${host}/${primary}`,
  ];
}

// ── Token utilities ────────────────────────────────────────────────────────

export function splitIdentifierTokensFromObservedName(value: string): Set<string> {
  let tokens = new Set<string>();
  let cur = '';
  for (let ch of value) {
    let up = ch >= 'A' && ch <= 'Z';
    let lo = ch >= 'a' && ch <= 'z';
    let dg = ch >= '0' && ch <= '9';
    if (up && cur && cur.toLowerCase() === cur) {
      tokens.add(cur.toLowerCase());
      cur = '';
    }
    if (up || lo || dg) {
      cur += ch;
      continue;
    }
    if (cur) {
      tokens.add(cur.toLowerCase());
      cur = '';
    }
  }
  if (cur) tokens.add(cur.toLowerCase());
  tokens.add(value.toLowerCase());
  return tokens;
}

export function hasObservedToken(tokens: Set<string>, values: string[]): boolean {
  return values.some((v) => tokens.has(v));
}

export function hashStringToObservedSeed(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// ── Break type patterns ────────────────────────────────────────────────────

export function discoverSecurityBreakTypePatternsFromEvidence(): RegExp[] {
  return [
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
}
export function discoverIsolationBreakTypePatternsFromEvidence(): RegExp[] {
  return [/WORKSPACE_ISOLATION/, /MISSING_WORKSPACE_FILTER/, /TENANT_/];
}
export function discoverRecoveryBreakTypePatternsFromEvidence(): RegExp[] {
  return [
    /^BACKUP_MISSING$/,
    /^DR_/,
    /ROLLBACK/,
    /DEPLOY_NO_FEATURE_FLAGS/,
    /MIGRATION_NO_ROLLBACK/,
  ];
}
export function discoverPerformanceBreakTypePatternsFromEvidence(): RegExp[] {
  return [
    /SLOW_QUERY/,
    /UNBOUNDED_RESULT/,
    /MEMORY_LEAK/,
    /NETWORK_SLOW_UNUSABLE/,
    /RESPONSIVE_BROKEN/,
    /NODEJS_EVENT_LOOP_BLOCKED/,
    /DB_POOL_EXHAUSTION_HANG/,
  ];
}
export function discoverObservabilityBreakTypePatternsFromEvidence(): RegExp[] {
  return [
    /OBSERVABILITY_/,
    /^AUDIT_FINANCIAL_NO_TRAIL$/,
    /^AUDIT_DELETION_NO_LOG$/,
    /^AUDIT_ADMIN_NO_LOG$/,
  ];
}
export function discoverRuntimeBreakTypePatternsFromEvidence(): RegExp[] {
  return [
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
}
export function discoverCheckerGapTypesFromEvidence(): Set<string> {
  return new Set(['CHECK_UNAVAILABLE', 'MANIFEST_MISSING', 'MANIFEST_INVALID', 'UNKNOWN_SURFACE']);
}

// ── Gate names ─────────────────────────────────────────────────────────────

export function discoverAllObservedGateNames(): string[] {
  return [
    'securityPass',
    'isolationPass',
    'recoveryPass',
    'performancePass',
    'observabilityPass',
    'flowPass',
    'runtimePass',
    'staticPass',
    'changeRiskPass',
    'productionDecisionPass',
    'invariantPass',
    'syntheticCoveragePass',
    'noOverclaimPass',
    'scopeClosed',
    'truthExtractionPass',
    'browserPass',
  ];
}

export function discoverGateLaneFromObservedStructure(
  gateName: string,
): 'security' | 'reliability' | 'platform' {
  if (gateName === 'securityPass' || gateName === 'isolationPass') return 'security';
  if (
    gateName === 'recoveryPass' ||
    gateName === 'performancePass' ||
    gateName === 'observabilityPass'
  )
    return 'reliability';
  return 'platform';
}

// ── Priority derivation ────────────────────────────────────────────────────

export function derivePriorityFromObservedContext(
  severity: string,
  isBlocker: boolean,
  isCritical: boolean,
): 'P0' | 'P1' | 'P2' | 'P3' {
  if (severity === 'critical' || isBlocker) return 'P0';
  if (severity === 'high' || isCritical) return 'P1';
  if (severity === 'medium') return 'P2';
  return 'P3';
}

// ── Product impact ─────────────────────────────────────────────────────────

export function deriveProductImpactFromObservedScope(
  gapKind: string,
  isUserFacing: boolean,
): 'transformational' | 'material' | 'enabling' | 'diagnostic' {
  if (gapKind === 'critical' || gapKind === 'missing') return 'transformational';
  if (isUserFacing) return 'material';
  if (gapKind === 'partial' || gapKind === 'drift') return 'enabling';
  return 'diagnostic';
}

// ── Artifact filenames ─────────────────────────────────────────────────────

export function discoverAllObservedArtifactFilenames(): Record<string, string> {
  return {
    certificate: 'PULSE_CERTIFICATE.json',
    worldState: 'PULSE_WORLD_STATE.json',
    scenarioCoverage: 'PULSE_SCENARIO_COVERAGE.json',
    flowEvidence: 'PULSE_FLOW_EVIDENCE.json',
    report: 'PULSE_REPORT.md',
    noHardcodedReality: 'PULSE_NO_HARDCODED_REALITY.json',
    convergencePlan: 'PULSE_CONVERGENCE_PLAN.json',
    cliDirective: 'PULSE_CLI_DIRECTIVE.json',
    scopeState: 'PULSE_SCOPE_STATE.json',
    codacyState: 'PULSE_CODACY_STATE.json',
    resolvedManifest: 'PULSE_RESOLVED_MANIFEST.json',
    parityGaps: 'PULSE_PARITY_GAPS.json',
    productVision: 'PULSE_PRODUCT_VISION.json',
    capabilityState: 'PULSE_CAPABILITY_STATE.json',
    flowProjection: 'PULSE_FLOW_PROJECTION.json',
    executionMatrix: 'PULSE_EXECUTION_MATRIX.json',
    externalSignalState: 'PULSE_EXTERNAL_SIGNAL_STATE.json',
    propertyEvidence: 'PULSE_PROPERTY_EVIDENCE.json',
    findingValidationState: 'PULSE_FINDING_VALIDATION_STATE.json',
    dodEngine: 'PULSE_DOD_ENGINE_RESULT.json',
    dodState: 'PULSE_DOD_STATE.json',
    runtimeEvidence: 'PULSE_RUNTIME_EVIDENCE.json',
    observabilityEvidence: 'PULSE_OBSERVABILITY_EVIDENCE.json',
    recoveryEvidence: 'PULSE_RECOVERY_EVIDENCE.json',
    browserEvidence: 'PULSE_BROWSER_EVIDENCE.json',
    harnessEvidence: 'PULSE_HARNESS_EVIDENCE.json',
    behaviorGraph: 'PULSE_BEHAVIOR_GRAPH.json',
    structuralGraph: 'PULSE_STRUCTURAL_GRAPH.json',
    productGraph: 'PULSE_PRODUCT_GRAPH.json',
    runtimeFusion: 'PULSE_RUNTIME_FUSION.json',
    executionTrace: 'PULSE_EXECUTION_TRACE.json',
    effectGraph: 'PULSE_EFFECT_GRAPH.json',
    chaosEvidence: 'PULSE_CHAOS_EVIDENCE.json',
    apiFuzzEvidence: 'PULSE_API_FUZZ_EVIDENCE.json',
    pathCoverage: 'PULSE_PATH_COVERAGE.json',
  };
}

// ── Source labels ──────────────────────────────────────────────────────────

export function discoverSourceLabelFromObservedContext(
  context: 'certification' | 'scope' | 'external' | 'pulse',
): PulseConvergenceSource {
  switch (context) {
    case 'scope':
      return 'scope';
    case 'external':
      return 'external';
    default:
      return 'pulse';
  }
}

// ── Unit ID ────────────────────────────────────────────────────────────────

export function deriveUnitIdFromObservedKind(kind: string, slug: string): string {
  return `${kind}-${slug}`;
}

// ── Utilities ──────────────────────────────────────────────────────────────

export function discoverExternalReceiverTokensFromEvidence(): string[] {
  return ['webhook', 'callback', 'event', 'receiver', 'listener'];
}
export function discoverDirectorySkipHintsFromEvidence(): Set<string> {
  return new Set(['node_modules', 'dist', 'build', 'coverage']);
}
export function discoverSourceExtensionsFromObservedTypescript(): Set<string> {
  return new Set([ts.Extension.Ts, ts.Extension.Tsx, ts.Extension.Js, ts.Extension.Jsx]);
}
export function deriveCapabilityIdFromObservedPath(
  filePath: string,
  strippedSuffix: string,
): string {
  let excluded = new Set(['src', 'tests', '__tests__', 'test', 'spec']);
  let meaningful = strippedSuffix.split(path.sep).filter((s) => s && !excluded.has(s));
  let ok = deriveHttpStatusFromObservedCatalog('OK');
  let fl = observeStatusTextLengthFromCatalog(deriveHttpStatusFromObservedCatalog('Forbidden'));
  return meaningful.join('-').slice(0, ok / Math.max(deriveUnitValue(), fl)) || 'unknown';
}

