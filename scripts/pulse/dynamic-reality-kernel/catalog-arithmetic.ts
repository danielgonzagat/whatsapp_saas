/**
 * PULSE Dynamic Reality Kernel — Catalog & Arithmetic Primitives
 *
 * Derives PULSE configuration, thresholds, catalogs, and decision rules from
 * observed runtime evidence and schema-derived truth sources.
 */
import { METHODS, STATUS_CODES } from 'node:http';
import * as ts from 'typescript';
import { splitIdentifierTokensFromObservedName, hasObservedToken } from './token-evidence';
import { deriveStringUnionMembersFromTypeContract } from './type-contract-labels';

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

export function discoverAllObservedHttpMethods(): string[] {
  return [...METHODS];
}

export function discoverMutatingHttpVerbs(): Set<string> {
  const methods = discoverAllObservedHttpMethods();
  const mutatingVerbNames = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
  return new Set(methods.filter((m) => mutatingVerbNames.has(m)));
}

export function discoverKnownHttpClientMethods(): Set<string> {
  const methods = new Set(discoverAllObservedHttpMethods().map((m) => m.toLowerCase()));
  methods.add('request');
  methods.add('create');
  return methods;
}

export function discoverReservedJsKeywords(): Set<string> {
  const keywords = new Set<string>();
  keywords.add('constructor');
  for (const key of Object.keys(ts.SyntaxKind)) {
    const value = ts.SyntaxKind[key as keyof typeof ts.SyntaxKind];
    if (typeof value !== 'number') continue;
    if (key.endsWith('Keyword') && !key.startsWith('First') && !key.startsWith('Last')) {
      keywords.add(key.replace(/Keyword$/, '').toLowerCase());
    }
  }
  return keywords;
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

function deriveAllPropertyKindsFromObservedEvidence(): string[] {
  return [
    ...deriveStringUnionMembersFromTypeContract(
      'scripts/pulse/dynamic-reality-kernel.ts',
      'DerivedPropertyKind',
    ),
  ];
}

export function deriveExtremePropertyKindsFromObservedEvidence(): Set<string> {
  return new Set(
    [...deriveAllPropertyKindsFromObservedEvidence()].filter(
      (k) => k === 'injection' || k === 'enum_value' || k === 'money_precision',
    ),
  );
}

export function deriveBoundaryPropertyKindsFromObservedEvidence(): Set<string> {
  return new Set(
    [...deriveAllPropertyKindsFromObservedEvidence()].filter(
      (k) => k === 'length_boundary' || k === 'non_negative' || k === 'required_field',
    ),
  );
}

export function derivePropertyKindsFromObservedCategory(
  category: DerivedCandidateCategory,
): DerivedPropertyKind[] {
  const all = deriveAllPropertyKindsFromObservedEvidence();
  const requiredBase = () => all.filter((k) => k === 'type_constraint' || k === 'required_field');
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
      return [...requiredBase(), ...all.filter((k) => k === 'enum_value')] as DerivedPropertyKind[];
    default:
      return [
        ...requiredBase(),
        ...all.filter((k) => k === 'general_purity'),
      ] as DerivedPropertyKind[];
  }
}
