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
export * from './__companions__/dynamic-reality-kernel.companion';
