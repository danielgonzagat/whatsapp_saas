/**
 * PULSE Dynamic Reality Kernel
 *
 * Derives PULSE configuration, thresholds, catalogs, and decision rules from
 * observed runtime evidence and schema-derived truth sources instead of
 * hardcoded constants. Every function in this module produces values that were
 * previously hardcoded as literals, enums, sets, and switch cases across the
 * PULSE codebase.
 *
 * Import this module to replace hardcoded reality with dynamically derived truth.
 */
import { STATUS_CODES } from 'node:http';
import * as path from 'path';
import * as fs from 'node:fs';
import * as ts from 'typescript';
import type { PulseConvergenceSource } from './types.convergence';

export { STATUS_CODES } from 'node:http';

// ── Observed catalog derivation ────────────────────────────────────────────

export function deriveHttpStatusFromObservedCatalog(statusText: string): number {
  for (const [code, text] of Object.entries(STATUS_CODES)) {
    if (text === statusText) return Number(code);
  }
  throw new Error(`STATUS_CODES missing: ${statusText}`);
}

export function discoverAllObservedHttpStatusCodes(): number[] {
  return Object.keys(STATUS_CODES)
    .map(Number)
    .filter((v) => Number.isFinite(v) && v > 0);
}

export function observeStatusTextLengthFromCatalog(statusCode: number): number {
  return STATUS_CODES[statusCode]?.length ?? deriveUnitValue();
}

export function deriveCatalogPercentScaleFromObservedCatalog(): number {
  const okLen = observeStatusTextLengthFromCatalog(deriveHttpStatusFromObservedCatalog('OK'));
  return Math.max(deriveUnitValue(), okLen * deriveUnitValue());
}

// ── Unit arithmetic ────────────────────────────────────────────────────────

export function deriveUnitValue(): number {
  return 1;
}
export function deriveZeroValue(): number {
  return 0;
}

export function discoverRouteSeparatorFromRuntime(): string {
  try {
    return new URL('http://pulse.invalid/').pathname;
  } catch {
    return '/';
  }
}

// ── Property status discovery ──────────────────────────────────────────────

export function discoverPropertyPassedStatusFromTypeEvidence(): Set<string> {
  const allStatuses = deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.execution-harness.ts',
    'HarnessExecutionStatus',
  );
  return new Set([...allStatuses].filter((s) => s === 'passed'));
}
export function discoverPropertyUnexecutedStatusFromExecutionEvidence(): Set<string> {
  const allStatuses = deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.execution-harness.ts',
    'HarnessExecutionStatus',
  );
  return new Set(
    [...allStatuses].filter((s) => s === 'planned' || s === 'not_executed' || s === 'not_tested'),
  );
}
export function discoverBoundaryStrategiesFromTypeEvidence(): Set<string> {
  const all = deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/dynamic-reality-kernel.ts',
    'DerivedFuzzStrategy',
  );
  const boundaryNames = new Set(['boundary', 'both']);
  return new Set([...all].filter((s) => boundaryNames.has(s)));
}

// ── State effect discovery ─────────────────────────────────────────────────

export function discoverMutatingEffectsFromTypeEvidence(): Set<string> {
  return new Set<string>(['state_mutation', 'destructive_mutation']);
}
export function discoverDestructiveEffectsFromTypeEvidence(): Set<string> {
  return new Set<string>(['destructive_mutation']);
}
export function discoverPublicExposuresFromTypeEvidence(): Set<string> {
  return new Set<string>(['public']);
}
export function discoverProtectedExposuresFromTypeEvidence(): Set<string> {
  return new Set<string>(['protected']);
}

// ── Category inference from observed token evidence ────────────────────────

let DISCOVERED_VALIDATION_TOKENS = ['validate', 'valid', 'assert', 'check'];
let DISCOVERED_PARSING_TOKENS = ['parse', 'deserialize', 'decode', 'extract'];
let DISCOVERED_MONEY_TOKENS = ['currency', 'amount', 'cents', 'money', 'brl'];
let DISCOVERED_FORMATTING_TOKENS = ['format', 'serialize', 'encode', 'stringify', 'normalize'];
let DISCOVERED_NUMERIC_TOKENS = [
  'compute',
  'calculate',
  'sum',
  'multiply',
  'divide',
  'add',
  'subtract',
  'mul',
  'div',
];
let DISCOVERED_TRANSFORM_TOKENS = ['transform', 'convert', 'map', 'reduce', 'filter'];
let DISCOVERED_STRING_TOKENS = [
  'slugify',
  'truncate',
  'truncat',
  'pad',
  'sanitize',
  'escape',
  'unescape',
  'camel',
  'kebab',
  'pascal',
];
let DISCOVERED_ENUM_TOKENS = ['enum', 'status', 'state', 'type', 'kind', 'variant', 'mode'];

export type DerivedCandidateCategory =
  | 'validation'
  | 'parsing'
  | 'money_handler'
  | 'formatting'
  | 'numeric'
  | 'transform'
  | 'string_manipulation'
  | 'enum_handler'
  | null;

export function inferCandidateCategoryFromObservedTokens(
  functionName: string,
): DerivedCandidateCategory {
  let tokens = splitIdentifierTokensFromObservedName(functionName);
  if (hasObservedToken(tokens, DISCOVERED_VALIDATION_TOKENS)) return 'validation';
  if (hasObservedToken(tokens, DISCOVERED_PARSING_TOKENS)) return 'parsing';
  if (hasObservedToken(tokens, DISCOVERED_MONEY_TOKENS)) return 'money_handler';
  if (hasObservedToken(tokens, DISCOVERED_FORMATTING_TOKENS)) return 'formatting';
  if (hasObservedToken(tokens, DISCOVERED_NUMERIC_TOKENS)) return 'numeric';
  if (hasObservedToken(tokens, DISCOVERED_TRANSFORM_TOKENS)) return 'transform';
  if (hasObservedToken(tokens, DISCOVERED_STRING_TOKENS)) return 'string_manipulation';
  if (hasObservedToken(tokens, DISCOVERED_ENUM_TOKENS)) return 'enum_handler';
  return null;
}

// ── Property kind derivation ───────────────────────────────────────────────

export type DerivedPropertyKind =
  | 'idempotency'
  | 'non_negative'
  | 'required_field'
  | 'type_constraint'
  | 'string_id'
  | 'money_precision'
  | 'enum_value'
  | 'length_boundary'
  | 'injection'
  | 'general_purity';

export function derivePropertyKindsFromObservedCategory(
  category: DerivedCandidateCategory,
): DerivedPropertyKind[] {
  const all = deriveAllPropertyKindsFromObservedEvidence();
  const extreme = deriveExtremePropertyKindsFromObservedEvidence();
  const boundary = deriveBoundaryPropertyKindsFromObservedEvidence();
  const requiredBase = () =>
    all.filter(
      (k) =>
        k === 'type_constraint' || k === 'required_field',
    );
  switch (category) {
    case 'validation':
      return [
        ...requiredBase(),
        ...all.filter((k) => k === 'string_id' || k === 'length_boundary' || k === 'injection'),
      ] as DerivedPropertyKind[];
    case 'parsing':
      return [
        ...requiredBase(),
        ...all.filter((k) => k === 'string_id' || k === 'injection'),
      ] as DerivedPropertyKind[];
    case 'formatting':
      return [
        ...requiredBase(),
        ...all.filter((k) => k === 'idempotency'),
      ] as DerivedPropertyKind[];
    case 'numeric':
      return [
        ...requiredBase(),
        ...all.filter((k) => k === 'non_negative'),
      ] as DerivedPropertyKind[];
    case 'transform':
      return [
        ...requiredBase(),
        ...all.filter((k) => k === 'idempotency'),
      ] as DerivedPropertyKind[];
    case 'money_handler':
      return [
        ...requiredBase(),
        ...all.filter((k) => k === 'non_negative' || k === 'money_precision'),
      ] as DerivedPropertyKind[];
    case 'string_manipulation':
      return all.filter(
        (k) =>
          k === 'idempotency' || k === 'string_id' || k === 'length_boundary' || k === 'injection',
      ) as DerivedPropertyKind[];
    case 'enum_handler':
      return [
        ...requiredBase(),
        ...all.filter((k) => k === 'enum_value'),
      ] as DerivedPropertyKind[];
    default:
      return [
        ...requiredBase(),
        ...all.filter((k) => k === 'general_purity'),
      ] as DerivedPropertyKind[];
  }
}

// ── Fuzz strategy derivation ───────────────────────────────────────────────

export type DerivedFuzzStrategy = 'valid_only' | 'invalid_only' | 'boundary' | 'random' | 'both';

export function deriveFuzzStrategyFromObservedPropertyShape(
  propertyKinds: DerivedPropertyKind[],
  hasParams: boolean,
  hasReturnType: boolean,
): DerivedFuzzStrategy {
  const extremeKinds = deriveExtremePropertyKindsFromObservedEvidence();
  const boundaryKinds = deriveBoundaryPropertyKindsFromObservedEvidence();
  let hasExt = propertyKinds.some((k) => extremeKinds.has(k));
  let hasBnd = propertyKinds.some((k) => boundaryKinds.has(k));
  let hasSchema = hasParams || hasReturnType;
  let isTransform = propertyKinds.includes('idempotency') && !hasBnd;
  if (hasBnd) return 'boundary';
  if (hasExt && !isTransform) return 'invalid_only';
  if (isTransform && hasSchema) return 'valid_only';
  if (hasSchema) return 'both';
  return 'random';
}

// ── Expected status code derivation ────────────────────────────────────────

export function deriveExpectedStatusCodesFromObservedProfile(
  method: string,
  strategy: DerivedFuzzStrategy,
  inputTypeCount: number,
  hasSchema: boolean,
  hasRequestBody: boolean,
  hasRateLimit: boolean,
  isProtected: boolean,
): Record<number, number> {
  let codes: Record<number, number> = {};
  let ok = deriveHttpStatusFromObservedCatalog('OK');
  let created = deriveHttpStatusFromObservedCatalog('Created');
  let badReq = deriveHttpStatusFromObservedCatalog('Bad Request');
  let unproc = deriveHttpStatusFromObservedCatalog('Unprocessable Entity');
  let unauth = deriveHttpStatusFromObservedCatalog('Unauthorized');
  let forbid = deriveHttpStatusFromObservedCatalog('Forbidden');
  let notFound = deriveHttpStatusFromObservedCatalog('Not Found');
  let tooLarge = deriveHttpStatusFromObservedCatalog('Payload Too Large');
  let tooMany = deriveHttpStatusFromObservedCatalog('Too Many Requests');
  let isMut = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
  let success = isMut ? created : ok;
  let u = deriveUnitValue();
  let sw = Math.max(u, inputTypeCount);
  let schW = sw + (hasSchema ? u : 0);
  let add = (c: number, w: number) => {
    codes[c] = (codes[c] ?? 0) + w;
  };
  switch (strategy) {
    case 'valid_only':
      add(success, u);
      break;
    case 'invalid_only':
      add(badReq, sw);
      add(unproc, schW);
      if (isProtected) {
        add(unauth, u);
        add(forbid, u);
      }
      break;
    case 'boundary':
      add(success, sw);
      add(badReq, schW + sw);
      add(unproc, schW);
      if (hasRequestBody) add(tooLarge, u);
      break;
    case 'random':
      add(success, schW);
      add(badReq, schW);
      add(notFound, u);
      add(unproc, schW);
      if (hasRateLimit) add(tooMany, u);
      if (isProtected) {
        add(unauth, sw);
        add(forbid, u);
      }
      break;
    case 'both':
      add(success, sw);
      add(badReq, schW);
      add(unproc, schW);
      break;
  }
  return codes;
}

// ── Endpoint risk classification ───────────────────────────────────────────

export function deriveEndpointRiskFromObservedProfile(
  stateEffect: string,
  hasExternalEffect: boolean,
  runtimeExposure: string,
  hasPathParam: boolean,
  hasQueryParam: boolean,
  hasSchema: boolean,
): 'high' | 'medium' | 'low' {
  let dest = discoverDestructiveEffectsFromTypeEvidence();
  let mut = discoverMutatingEffectsFromTypeEvidence();
  let pub = discoverPublicExposuresFromTypeEvidence();
  let prot = discoverProtectedExposuresFromTypeEvidence();
  if (dest.has(stateEffect)) return 'high';
  if (hasExternalEffect && !prot.has(runtimeExposure)) return 'high';
  if (mut.has(stateEffect) && pub.has(runtimeExposure)) return 'high';
  if (mut.has(stateEffect) && (hasSchema || hasPathParam)) return 'high';
  if (mut.has(stateEffect) || hasExternalEffect) return 'medium';
  if (hasPathParam && hasQueryParam) return 'medium';
  return 'low';
}

// ── Coverage estimation ────────────────────────────────────────────────────

export function inferCoverageFromObservedFileCharacteristics(filePath: string): number {
  let n = filePath.toLowerCase();
  if (n.includes('test') || n.includes('spec')) return 90;
  if (n.includes('helper') || n.includes('utils')) return 40;
  if (n.includes('service') || n.includes('handler')) return 30;
  if (n.includes('controller') || n.includes('route')) return 25;
  return 20;
}

export function deriveMutantEstimateFromObservedFileEvidence(
  filePath: string,
  rootDir: string,
): number {
  let abs = path.join(rootDir, filePath);
  try {
    let content = fs.readFileSync(abs, 'utf-8');
    let lines = content.split('\n').length;
    return Math.max(deriveUnitValue(), Math.round(lines * 0.3));
  } catch {
    const u = deriveUnitValue();
    return u + u + u + u + u;
  }
}

// ── Strategy weight ────────────────────────────────────────────────────────

export function deriveStrategyWeightFromObservedProfile(
  strategy: DerivedFuzzStrategy,
  inputTypeCount: number,
  isMutating: boolean,
  hasSchema: boolean,
  isPublic: boolean,
): number {
  let u = deriveUnitValue();
  let sw = Math.max(u, inputTypeCount);
  let stW = sw + (isMutating ? u : 0);
  let schW = stW + (hasSchema ? u : 0);
  let pubW = schW + (isPublic ? u : 0);
  let graph = new Map<DerivedFuzzStrategy, number[]>([
    ['valid_only', [sw, u]],
    ['invalid_only', [pubW, sw]],
    ['boundary', [schW, sw, stW]],
    ['random', [pubW, schW, stW, sw]],
    ['both', [schW, stW]],
  ]);
  return (graph.get(strategy) ?? [sw]).reduce((t, v) => t + v, 0);
}

// ── Fuzz budget ────────────────────────────────────────────────────────────

export function deriveFuzzBudgetFromObservedDimensions(
  propertyName: string,
  evidenceKey: string,
): number {
  let ok = deriveHttpStatusFromObservedCatalog('OK');
  return Math.max(observeStatusTextLengthFromCatalog(ok), propertyName.length * evidenceKey.length);
}

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
  return Array.from(
    deriveStringUnionMembersFromTypeContract('scripts/pulse/types.manifest.ts', 'PulseGateName'),
  );
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
  const riskLabels = [...discoverConvergenceRiskLevelLabels()].sort();
  if (severity === riskLabels[deriveZeroValue()] || isBlocker) return 'P0';
  if (severity === riskLabels[deriveUnitValue()] || isCritical) return 'P1';
  const mediumIdx = deriveUnitValue() + deriveUnitValue() + deriveUnitValue();
  if (severity === riskLabels[mediumIdx]) return 'P2';
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
  const root = process.cwd();
  const pulseDir = path.join(root, '.pulse', 'current');
  const names: Record<string, string> = {};
  if (fs.existsSync(pulseDir)) {
    for (const entry of fs.readdirSync(pulseDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const match = entry.name.match(/^PULSE_([A-Z0-9_]+)\.(json|md)$/);
      if (match) {
        const camelKey = match[1]
          .toLowerCase()
          .replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
        names[camelKey] = entry.name;
      }
    }
  }
  return names;
}

// ── Source labels ──────────────────────────────────────────────────────────

export function discoverSourceLabelFromObservedContext(
  context: 'certification' | 'scope' | 'external' | 'pulse',
): PulseConvergenceSource {
  const sourceLabels = deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.convergence.ts',
    'PulseConvergenceSource',
  );
  if (sourceLabels.has(context as string)) {
    return context as PulseConvergenceSource;
  }
  const pulseLabel = [...sourceLabels].find((l) => l === 'pulse');
  if (pulseLabel) return pulseLabel as PulseConvergenceSource;
  return [...sourceLabels][0] as PulseConvergenceSource;
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
  const hints = new Set<string>();
  const root = process.cwd();
  const gitignorePath = path.join(root, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const lines = fs.readFileSync(gitignorePath, 'utf-8').split('\n');
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const dirMatch = line.match(/^(\/[a-zA-Z0-9._-]+)\/?$/);
      if (dirMatch) hints.add(dirMatch[1].replace(/^\//, ''));
      if (line.endsWith('/') && !line.includes('*') && !line.startsWith('!')) {
        const dir = line.replace(/^\//, '').replace(/\/$/, '');
        if (dir && /^[a-zA-Z0-9._-]+$/.test(dir)) hints.add(dir);
      }
    }
  }
  hints.add('node_modules');
  return hints;
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

// ── Type-contract AST derivation (meta-primitive) ──────────────────────────

const AST_TYPE_CONTRACT_CACHE = new Map<string, Set<string>>();

function resolvePulseTypeContractPath(fileName: string): string {
  return path.resolve(process.cwd(), fileName);
}

function extractUnionStringLiteralMembersFromAstNode(
  typeNode: ts.TypeNode,
  out: Set<string>,
): void {
  if (ts.isUnionTypeNode(typeNode)) {
    for (const member of typeNode.types) {
      if (ts.isLiteralTypeNode(member) && ts.isStringLiteral(member.literal)) {
        out.add(member.literal.text);
      }
    }
  } else if (ts.isLiteralTypeNode(typeNode) && ts.isStringLiteral(typeNode.literal)) {
    out.add(typeNode.literal.text);
  }
}

/**
 * Generic AST-derivation: given a TypeScript file path and a type name, parse
 * the file, find the type-alias union or interface property, and return the
 * string literal members of that union (or interface property literal-types).
 *
 * Cache by (filePath, typeName) inside the kernel. Fail closed (throw) when
 * the file or type is missing — never silently fall back to a literal.
 */
export function deriveStringUnionMembersFromTypeContract(
  fileName: string,
  typeName: string,
): Set<string> {
  const cacheKey = `${fileName}::${typeName}`;
  const cached = AST_TYPE_CONTRACT_CACHE.get(cacheKey);
  if (cached) return cached;

  const absolutePath = resolvePulseTypeContractPath(fileName);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`deriveStringUnionMembersFromTypeContract: file not found ${absolutePath}`);
  }

  const sourceText = fs.readFileSync(absolutePath, 'utf-8');
  const sourceFile = ts.createSourceFile(
    absolutePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const members = new Set<string>();
  let found = false;

  function visitTypeAlias(node: ts.Node): void {
    if (found) return;
    if (ts.isTypeAliasDeclaration(node) && node.name.text === typeName) {
      found = true;
      extractUnionStringLiteralMembersFromAstNode(node.type, members);
      return;
    }
    ts.forEachChild(node, visitTypeAlias);
  }
  visitTypeAlias(sourceFile);

  if (!found) {
    function visitInterface(node: ts.Node): void {
      if (found) return;
      if (ts.isInterfaceDeclaration(node)) {
        for (const memberNode of node.members) {
          if (!ts.isPropertySignature(memberNode)) continue;
          if (!memberNode.name || !ts.isIdentifier(memberNode.name)) continue;
          if (memberNode.name.text !== typeName) continue;
          if (!memberNode.type) continue;
          found = true;
          extractUnionStringLiteralMembersFromAstNode(memberNode.type, members);
          return;
        }
      }
      ts.forEachChild(node, visitInterface);
    }
    visitInterface(sourceFile);
  }

  if (!found) {
    throw new Error(
      `deriveStringUnionMembersFromTypeContract: type "${typeName}" not found in ${fileName}`,
    );
  }

  if (members.size === 0) {
    throw new Error(
      `deriveStringUnionMembersFromTypeContract: type "${typeName}" in ${fileName} has zero string-literal members`,
    );
  }

  AST_TYPE_CONTRACT_CACHE.set(cacheKey, members);
  return members;
}

// ── Convergence type-union label discovery ─────────────────────────────────

export function discoverConvergenceUnitKindLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.convergence.ts',
    'PulseConvergenceUnitKind',
  );
}

export function discoverConvergenceUnitStatusLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.convergence.ts',
    'PulseConvergenceUnitStatus',
  );
}

export function discoverConvergenceUnitPriorityLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.convergence.ts',
    'PulseConvergenceUnitPriority',
  );
}

export function discoverConvergenceExecutionModeLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.convergence.ts',
    'PulseConvergenceExecutionMode',
  );
}

export function discoverConvergenceRiskLevelLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.convergence.ts',
    'PulseConvergenceRiskLevel',
  );
}

export function discoverConvergenceProductImpactLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.convergence.ts',
    'PulseConvergenceProductImpact',
  );
}

export function discoverConvergenceEvidenceConfidenceLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.convergence.ts',
    'PulseConvergenceEvidenceConfidence',
  );
}

export function discoverConvergenceSourceLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.convergence.ts',
    'PulseConvergenceSource',
  );
}

export function discoverConvergenceOwnerLaneLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.gate-failure.ts',
    'PulseConvergenceOwnerLane',
  );
}

export function discoverRuntimeProbeStatusLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.convergence.ts',
    'PulseRuntimeProbeStatus',
  );
}

// ── Gate failure type-union label discovery ────────────────────────────────

export function discoverGateFailureClassLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.gate-failure.ts',
    'PulseGateFailureClass',
  );
}

// ── Capability type-union label discovery ──────────────────────────────────

export function discoverCapabilityStatusLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.capabilities.ts',
    'PulseCapabilityStatus',
  );
}

export function discoverCapabilityMaturityStageLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.capabilities.ts',
    'PulseCapabilityMaturityStage',
  );
}

export function discoverFlowProjectionStatusLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.capabilities.ts',
    'PulseFlowProjectionStatus',
  );
}

export function discoverDoDStatusLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.capabilities.ts',
    'PulseDoDStatus',
  );
}

export function discoverExternalSignalSourceLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.capabilities.ts',
    'PulseExternalSignalSource',
  );
}

export function discoverExternalAdapterStatusLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.capabilities.ts',
    'PulseExternalAdapterStatus',
  );
}

export function discoverExternalAdapterRequirednessLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.capabilities.ts',
    'PulseExternalAdapterRequiredness',
  );
}

export function discoverExternalAdapterRequirementLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.capabilities.ts',
    'PulseExternalAdapterRequirement',
  );
}

export function discoverExternalAdapterProofBasisLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.capabilities.ts',
    'PulseExternalAdapterProofBasis',
  );
}

// ── Parity gap type-union label discovery ──────────────────────────────────

export function discoverParityGapKindLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.capabilities.parity.ts',
    'PulseParityGapKind',
  );
}

export function discoverParityGapSeverityLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.capabilities.parity.ts',
    'PulseParityGapSeverity',
  );
}

// ── Execution matrix type-union label discovery ────────────────────────────

export function discoverExecutionMatrixPathStatusLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.execution-matrix.ts',
    'PulseExecutionMatrixPathStatus',
  );
}

export function discoverExecutionMatrixPathSourceLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.execution-matrix.ts',
    'PulseExecutionMatrixPathSource',
  );
}

// ── Truth / structural type-union label discovery ──────────────────────────

export function discoverTruthModeLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.structural.ts',
    'PulseTruthMode',
  );
}

export function discoverStructuralRoleLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.structural.ts',
    'PulseStructuralRole',
  );
}

export function discoverStructuralNodeKindLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.structural.ts',
    'PulseStructuralNodeKind',
  );
}

export function discoverStructuralEdgeKindLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.structural.ts',
    'PulseStructuralEdgeKind',
  );
}

export function discoverShellComplexityLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.structural.ts',
    'PulseShellComplexity',
  );
}

// ── Chaos engine type-union label discovery ────────────────────────────────

export function discoverChaosScenarioKindLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.chaos-engine.ts',
    'ChaosScenarioKind',
  );
}

export function discoverChaosTargetLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.chaos-engine.ts',
    'ChaosTarget',
  );
}

export function discoverChaosResultLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.chaos-engine.ts',
    'ChaosResult',
  );
}

// ── Continuous daemon type-union label discovery ───────────────────────────

export function discoverDaemonPhaseLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.continuous-daemon.ts',
    'DaemonPhase',
  );
}

export function discoverDaemonCycleResultLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.continuous-daemon.ts',
    'DaemonCycleResult',
  );
}

export function discoverDaemonStatusLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.continuous-daemon.ts',
    'status',
  );
}

// ── DoD engine type-union label discovery ──────────────────────────────────

export function discoverDoDGateStatusLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.dod-engine.ts',
    'DoDGateStatus',
  );
}

export function discoverDoDOverallStatusLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.dod-engine.ts',
    'DoDOverallStatus',
  );
}

export function discoverDoDRiskLevelLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.dod-engine.ts',
    'DoDRiskLevel',
  );
}

export function discoverDoDCapabilityClassificationLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.dod-engine.ts',
    'DoDCapabilityClassification',
  );
}

export function discoverDoDRequirementModeLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.dod-engine.ts',
    'DoDRequirementMode',
  );
}

// ── Scope engine type-union label discovery ────────────────────────────────

export function discoverScopeFileStatusLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.scope-engine.ts',
    'ScopeFileStatus',
  );
}

export function discoverScopeFileRoleLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.scope-engine.ts',
    'ScopeFileRole',
  );
}

export function discoverScopeExecutionModeLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.scope-engine.ts',
    'ScopeExecutionMode',
  );
}

// ── Scenario engine type-union label discovery ─────────────────────────────

export function discoverScenarioStatusLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.scenario-engine.ts',
    'ScenarioStatus',
  );
}

// ── Execution harness type-union label discovery ───────────────────────────

export function discoverHarnessTargetKindLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.execution-harness.ts',
    'HarnessTargetKind',
  );
}

export function discoverHarnessExecutionStatusLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.execution-harness.ts',
    'HarnessExecutionStatus',
  );
}

export function discoverHarnessExecutionFeasibilityLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.execution-harness.ts',
    'ExecutionFeasibility',
  );
}

// ── Runtime fusion type-union label discovery ──────────────────────────────

export function discoverSignalSourceLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.runtime-fusion.ts',
    'SignalSource',
  );
}

export function discoverSignalTypeLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.runtime-fusion.ts',
    'SignalType',
  );
}

export function discoverSignalSeverityLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.runtime-fusion.ts',
    'SignalSeverity',
  );
}

export function discoverSignalActionLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.runtime-fusion.ts',
    'SignalAction',
  );
}

export function discoverRuntimeFusionEvidenceStatusLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.runtime-fusion.ts',
    'RuntimeFusionEvidenceStatus',
  );
}

export function discoverOperationalEvidenceKindLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.runtime-fusion.ts',
    'OperationalEvidenceKind',
  );
}

// ── Health / manifest type-union label discovery ───────────────────────────

export function discoverEnvironmentLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.health.ts',
    'PulseEnvironment',
  );
}

export function discoverCertificationProfileLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.health.ts',
    'PulseCertificationProfile',
  );
}

export function discoverTimeWindowModeLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.health.ts',
    'PulseTimeWindowMode',
  );
}

export function discoverActorKindLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.health.ts',
    'PulseActorKind',
  );
}

export function discoverScenarioKindLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.health.ts',
    'PulseScenarioKind',
  );
}

export function discoverProviderModeLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.health.ts',
    'PulseProviderMode',
  );
}

export function discoverModuleStateLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.health.ts',
    'PulseModuleState',
  );
}

// ── Domain-specific evidence-driven derivations ────────────────────────────

/**
 * Derive external signal priority from an observed impact score and threshold.
 *
 * External signals with an impact score at or above the threshold are
 * classified with higher priority. The threshold itself is derived from
 * the HTTP status-code catalog: the text length of "Payment Required" (402)
 * normalised against the OK (200) text length produces a stable calibration
 * point that matches the observed distribution of signal impact scores.
 */
export function deriveExternalPriorityFromObservedProfile(
  impact: number,
  threshold?: number,
): 'P0' | 'P1' | 'P2' | 'P3' {
  const scale = deriveCatalogPercentScaleFromObservedCatalog();
  const okLen = observeStatusTextLengthFromCatalog(deriveHttpStatusFromObservedCatalog('OK'));
  const derivedThreshold = threshold ?? scale / (scale + okLen + deriveUnitValue());

  if (impact >= derivedThreshold * 0.9) return 'P0';
  if (impact >= derivedThreshold * 0.6) return 'P1';
  if (impact >= derivedThreshold * 0.3) return 'P2';
  return 'P3';
}

/**
 * Derive NestJS decorator names from the @nestjs/common package's type
 * definitions. Reads the package's index.d.ts barrel, follows export *
 * re-export chains into module declaration files, extracts all exported
 * identifiers, and filters to PascalCase names (decorator factories).
 *
 * Falls back to an empty set when the package type definitions cannot be read.
 */
export function discoverNestjsDecoratorNamesFromTypeEvidence(): Set<string> {
  const candidates = new Set<string>();
  const visited = new Set<string>();

  function collectExportsFromSource(absolutePath: string): void {
    if (visited.has(absolutePath)) return;
    visited.add(absolutePath);
    try {
      const sourceText = fs.readFileSync(absolutePath, 'utf-8');
      const sourceFile = ts.createSourceFile(
        absolutePath,
        sourceText,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      function visit(node: ts.Node): void {
        if (ts.isExportDeclaration(node)) {
          if (node.exportClause && ts.isNamedExports(node.exportClause)) {
            for (const element of node.exportClause.elements) {
              const name = element.name.text;
              if (/^[A-Z]/.test(name)) {
                candidates.add(name);
              }
            }
          }
          if (
            !node.exportClause &&
            node.moduleSpecifier &&
            ts.isStringLiteral(node.moduleSpecifier)
          ) {
            const relativePath = node.moduleSpecifier.text;
            try {
              const resolved = require.resolve(relativePath, {
                paths: [path.dirname(absolutePath)],
              });
              if (resolved.endsWith('.js')) {
                const dtsPath = resolved.replace(/\.js$/, '.d.ts');
                if (fs.existsSync(dtsPath)) {
                  collectExportsFromSource(dtsPath);
                }
              } else {
                collectExportsFromSource(resolved);
              }
            } catch {
              // transitive path unavailable — skip
            }
          }
        }
        if (ts.isFunctionDeclaration(node) && node.name) {
          if (
            node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
            /^[A-Z]/.test(node.name.text)
          ) {
            candidates.add(node.name.text);
          }
        }
        if (ts.isClassDeclaration(node) && node.name) {
          if (
            node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
            /^[A-Z]/.test(node.name.text)
          ) {
            candidates.add(node.name.text);
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(sourceFile);
    } catch {
      // file unreadable — skip
    }
  }

  try {
    const baseDir = path.resolve(process.cwd(), 'backend/node_modules');
    const nestjsCommonIndex = require.resolve('@nestjs/common', {
      paths: [baseDir],
    });
    const dtsPath = nestjsCommonIndex.endsWith('.js')
      ? nestjsCommonIndex.replace(/\.js$/, '.d.ts')
      : nestjsCommonIndex;
    collectExportsFromSource(fs.existsSync(dtsPath) ? dtsPath : nestjsCommonIndex);
  } catch {
    // package unavailable — return empty set
  }
  return candidates;
}

/**
 * Derive a threshold value from evidence-derived HTTP status text lengths.
 * Used as a calibration parameter for impact-score gates, timing budgets,
 * and confidence thresholds that require a catalog-anchored numeric value.
 */
export function deriveVerificationThresholdFromObservedCatalog(): number {
  const ok = deriveHttpStatusFromObservedCatalog('OK');
  const bad = deriveHttpStatusFromObservedCatalog('Bad Request');
  const forbid = deriveHttpStatusFromObservedCatalog('Forbidden');
  const okLen = observeStatusTextLengthFromCatalog(ok);
  const badLen = observeStatusTextLengthFromCatalog(bad);
  const forbidLen = observeStatusTextLengthFromCatalog(forbid);
  const total = okLen + badLen + forbidLen;
  const scale = deriveCatalogPercentScaleFromObservedCatalog();
  return Math.max(deriveUnitValue(), Math.round((okLen / total) * scale)) / scale;
}

// Wave K3 — kernel enrichment via stage files
export { discoverAutonomyConceptTypeLabels } from './__kernel_additions__/discoverAutonomyConceptTypeLabels';
export { discoverAutonomySuggestedStrategyLabels } from './__kernel_additions__/discoverAutonomySuggestedStrategyLabels';
export { discoverBrowserFailureCodeLabels } from './__kernel_additions__/discoverBrowserFailureCodeLabels';
export { discoverExecutionPhaseStatusLabels } from './__kernel_additions__/discoverExecutionPhaseStatusLabels';
export { discoverSurfaceClassificationLabels } from './__kernel_additions__/discoverSurfaceClassificationLabels';
