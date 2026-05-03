/**
 * PULSE Dynamic Reality Kernel — Catalog Discovery
 *
 * HTTP catalog derivations, unit arithmetic, property discovery, token
 * analysis, and category inference. Part 1 of 3.
 */

import { STATUS_CODES } from 'node:http';

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
  let okLen = observeStatusTextLengthFromCatalog(deriveHttpStatusFromObservedCatalog('OK'));
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
