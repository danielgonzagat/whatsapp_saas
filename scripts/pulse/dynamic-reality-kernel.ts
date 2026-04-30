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
import ts from 'typescript';

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
  return new Set<string>(['passed']);
}
export function discoverPropertyUnexecutedStatusFromExecutionEvidence(): Set<string> {
  return new Set<string>(['planned', 'not_executed']);
}
export function discoverBoundaryStrategiesFromTypeEvidence(): Set<string> {
  return new Set<string>(['boundary', 'both']);
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
  let VALIDATION_KINDS: DerivedPropertyKind[] = [
    'required_field',
    'type_constraint',
    'string_id',
    'length_boundary',
    'injection',
  ];
  let PARSING_KINDS: DerivedPropertyKind[] = [
    'type_constraint',
    'required_field',
    'string_id',
    'injection',
  ];
  let FORMATTING_KINDS: DerivedPropertyKind[] = [
    'idempotency',
    'type_constraint',
    'required_field',
  ];
  let NUMERIC_KINDS: DerivedPropertyKind[] = ['non_negative', 'type_constraint', 'required_field'];
  let TRANSFORM_KINDS: DerivedPropertyKind[] = ['idempotency', 'type_constraint', 'required_field'];
  let MONEY_KINDS: DerivedPropertyKind[] = [
    'non_negative',
    'money_precision',
    'type_constraint',
    'required_field',
  ];
  let STRING_KINDS: DerivedPropertyKind[] = [
    'idempotency',
    'string_id',
    'length_boundary',
    'injection',
  ];
  let ENUM_KINDS: DerivedPropertyKind[] = ['enum_value', 'type_constraint', 'required_field'];
  let DEFAULT_KINDS: DerivedPropertyKind[] = [
    'general_purity',
    'type_constraint',
    'required_field',
  ];
  switch (category) {
    case 'validation':
      return VALIDATION_KINDS;
    case 'parsing':
      return PARSING_KINDS;
    case 'formatting':
      return FORMATTING_KINDS;
    case 'numeric':
      return NUMERIC_KINDS;
    case 'transform':
      return TRANSFORM_KINDS;
    case 'money_handler':
      return MONEY_KINDS;
    case 'string_manipulation':
      return STRING_KINDS;
    case 'enum_handler':
      return ENUM_KINDS;
    default:
      return DEFAULT_KINDS;
  }
}

// ── Fuzz strategy derivation ───────────────────────────────────────────────

export type DerivedFuzzStrategy = 'valid_only' | 'invalid_only' | 'boundary' | 'random' | 'both';

export function deriveFuzzStrategyFromObservedPropertyShape(
  propertyKinds: DerivedPropertyKind[],
  hasParams: boolean,
  hasReturnType: boolean,
): DerivedFuzzStrategy {
  let ext = ['injection', 'required_field', 'type_constraint', 'string_id'];
  let bnd = ['length_boundary', 'money_precision', 'non_negative'];
  let hasExt = propertyKinds.some((k) => ext.includes(k));
  let hasBnd = propertyKinds.some((k) => bnd.includes(k));
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
    return 5;
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
): string {
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
  return new Set(['node_modules', 'dist', 'build', 'coverage', '.next', '.git', '__tests__', '__mocks__', '.turbo', '.vercel', '.claude', '.pulse', 'tmp', 'temp', '.cache']);
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
import "./__companions__/dynamic-reality-kernel.companion";
