import {
  ABI_REQUIRED_KEYS,
  ABI_VERSION,
  AbiAudience,
  AbiCapabilityMaturity,
  AbiTruthMode,
  AbiValence,
  CognitiveStateAbi,
} from './abi-schema';

/**
 * UTP-ABI-003 — Cognitive State ABI validator.
 *
 * Implements PCI.2 §6 + §4 (docs/contracts/pci/02-abi-schema.md).
 *
 * Validates a payload against the canonical schema and runs the static
 * checks that PULSE gates `prompt-leakage`, `no-roleplay`, and
 * `no-overclaim` (PCI.4 §3.1, §3.4, §3.8) require BEFORE the payload is
 * sent to the LLM.
 *
 * Returns a structured verdict — does not throw. Consumers (the ABI
 * pipeline that finalizes payload to LLM) decide what to do with FAIL.
 */

const VALID_TRUTH_MODES: ReadonlySet<AbiTruthMode> = new Set([
  'observed',
  'inferred',
  'projected',
]);

const VALID_AUDIENCES: ReadonlySet<AbiAudience> = new Set([
  'public',
  'technical',
  'origin',
  'internal',
]);

const VALID_MATURITIES: ReadonlySet<AbiCapabilityMaturity> = new Set([
  'developing',
  'operational',
  'productionReady',
]);

const VALID_VALENCES: ReadonlySet<AbiValence> = new Set([
  'positive',
  'negative',
  'neutral',
  'ambiguous',
]);

/**
 * Patterns that indicate behavioral instruction leaked into the payload.
 * Used by both `prompt-leakage` and `no-roleplay` gates.
 */
const PROMPT_LEAKAGE_PATTERNS: ReadonlyArray<{
  readonly id: string;
  readonly re: RegExp;
}> = [
  // \b is ASCII-only — `é` is not a word char, so a trailing \b would not
  // match. Look for "é" followed by whitespace/punctuation/EOS instead.
  { id: 'pt-voce-e', re: /\bvoc[êe]\s+(é|es)(?=[\s.,;:!?'"]|$)/i },
  { id: 'en-you-are', re: /\byou are\s+(an?|the)\b/i },
  { id: 'pt-seu-papel', re: /\bseu\s+papel\b/i },
  { id: 'en-your-role', re: /\byour\s+role\b/i },
  { id: 'en-act-as', re: /\bact as\s+(an?|the)\b/i },
  { id: 'pt-aja-como', re: /\baja\s+como\s+(um|uma|o|a)\b/i },
  { id: 'pt-sempre-faca', re: /\bsempre\s+(faça|fala|use|seja|responda)\b/i },
  { id: 'en-always', re: /\balways\s+(do|use|be|respond)\b/i },
  { id: 'pt-nunca-faca', re: /\bnunca\s+(faça|fale|use|seja|responda)\b/i },
  { id: 'en-never', re: /\bnever\s+(do|use|be|respond)\b/i },
  {
    id: 'en-respond-in',
    re: /\brespond\s+in\s+(json|markdown|format|portuguese|english)\b/i,
  },
  {
    id: 'pt-responda-em',
    re: /\bresponda\s+em\s+(json|markdown|formato|português|inglês)\b/i,
  },
  { id: 'persona-kloel-is', re: /\bKloel\s+(é|is|acts|acta|behaves|fala)\s+/i },
  { id: 'few-shot-userassistant', re: /\b(User:|Assistant:|System:)\s/m },
];

export interface AbiValidationIssue {
  readonly path: string;
  readonly message: string;
  readonly code: string;
}

export interface AbiValidationVerdict {
  readonly status: 'PASS' | 'FAIL';
  readonly version: string;
  readonly issues: readonly AbiValidationIssue[];
  readonly checkedAt: string;
}

function fail(
  issues: AbiValidationIssue[],
  version: string,
): AbiValidationVerdict {
  return {
    status: 'FAIL',
    version,
    issues,
    checkedAt: new Date().toISOString(),
  };
}

function pass(version: string): AbiValidationVerdict {
  return {
    status: 'PASS',
    version,
    issues: [],
    checkedAt: new Date().toISOString(),
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validate the structural shape — required keys, enum values, basic types.
 */
function structuralCheck(payload: unknown): readonly AbiValidationIssue[] {
  const issues: AbiValidationIssue[] = [];
  if (!isObject(payload)) {
    issues.push({
      path: '$',
      message: 'payload must be a plain object',
      code: 'NOT_OBJECT',
    });
    return issues;
  }
  for (const key of ABI_REQUIRED_KEYS) {
    if (!(key in payload)) {
      issues.push({
        path: `$.${key}`,
        message: `required field "${key}" is missing`,
        code: 'MISSING_REQUIRED',
      });
    }
  }
  const versionVal = (payload as Record<string, unknown>)['abiVersion'];
  if (typeof versionVal !== 'string') {
    issues.push({
      path: '$.abiVersion',
      message: 'abiVersion must be a string',
      code: 'WRONG_TYPE',
    });
  }
  const lineage = (payload as Record<string, unknown>)['lineage'];
  if (isObject(lineage) && lineage['canonicalName'] !== 'Kloel') {
    issues.push({
      path: '$.lineage.canonicalName',
      message: 'lineage.canonicalName must be the literal "Kloel"',
      code: 'LINEAGE_NAME_MISMATCH',
    });
  }
  const idProj = (payload as Record<string, unknown>)['identityProjection'];
  if (isObject(idProj)) {
    const aud = idProj['audience'];
    if (typeof aud !== 'string' || !VALID_AUDIENCES.has(aud as AbiAudience)) {
      issues.push({
        path: '$.identityProjection.audience',
        message: `audience must be one of ${[...VALID_AUDIENCES].join('|')}`,
        code: 'INVALID_AUDIENCE',
      });
    }
    const tm = idProj['truthMode'];
    if (typeof tm !== 'string' || !VALID_TRUTH_MODES.has(tm as AbiTruthMode)) {
      issues.push({
        path: '$.identityProjection.truthMode',
        message: `truthMode must be one of ${[...VALID_TRUTH_MODES].join('|')}`,
        code: 'INVALID_TRUTH_MODE',
      });
    }
    const mat = idProj['currentMaturity'];
    if (
      typeof mat !== 'string' ||
      !VALID_MATURITIES.has(mat as AbiCapabilityMaturity)
    ) {
      issues.push({
        path: '$.identityProjection.currentMaturity',
        message: `currentMaturity must be one of ${[...VALID_MATURITIES].join('|')}`,
        code: 'INVALID_MATURITY',
      });
    }
  }
  return issues;
}

/**
 * Walk every string in the payload and run prompt-leakage patterns.
 */
function promptLeakageScan(
  payload: unknown,
  pathPrefix = '$',
  out: AbiValidationIssue[] = [],
): readonly AbiValidationIssue[] {
  if (typeof payload === 'string') {
    for (const pattern of PROMPT_LEAKAGE_PATTERNS) {
      if (pattern.re.test(payload)) {
        out.push({
          path: pathPrefix,
          message: `prompt leakage detected (pattern ${pattern.id})`,
          code: 'PROMPT_LEAKAGE',
        });
        break; // one report per offending string is enough
      }
    }
    return out;
  }
  if (Array.isArray(payload)) {
    payload.forEach((item, idx) => {
      promptLeakageScan(item, `${pathPrefix}[${idx}]`, out);
    });
    return out;
  }
  if (isObject(payload)) {
    for (const [k, v] of Object.entries(payload)) {
      promptLeakageScan(v, `${pathPrefix}.${k}`, out);
    }
  }
  return out;
}

/**
 * No-overclaim: every available capability must have runtimeEvidencePct > 0.
 */
function noOverclaimCheck(payload: unknown): readonly AbiValidationIssue[] {
  if (!isObject(payload)) return [];
  const caps = (payload as Record<string, unknown>)['capabilities'];
  if (!isObject(caps)) return [];
  const available = caps['available'];
  if (!Array.isArray(available)) return [];
  const issues: AbiValidationIssue[] = [];
  available.forEach((cap, idx) => {
    if (!isObject(cap)) return;
    const evidence = cap['runtimeEvidencePct'];
    const id = typeof cap['capabilityId'] === 'string' ? cap['capabilityId'] : '?';
    if (typeof evidence !== 'number' || evidence <= 0) {
      issues.push({
        path: `$.capabilities.available[${idx}]`,
        message: `capability "${id}" declared without runtime evidence (runtimeEvidencePct=${String(evidence)})`,
        code: 'NO_OVERCLAIM',
      });
    }
  });
  return issues;
}

/**
 * Optional valence sanity check — terminal events should not carry
 * impossible polarity.
 */
function valenceSanityCheck(payload: unknown): readonly AbiValidationIssue[] {
  if (!isObject(payload)) return [];
  const valence = (payload as Record<string, unknown>)['valence'];
  if (!isObject(valence)) return [];
  const trace = valence['recentTrace'];
  if (!Array.isArray(trace)) return [];
  const issues: AbiValidationIssue[] = [];
  trace.forEach((entry, idx) => {
    if (!isObject(entry)) return;
    const v = entry['valence'];
    if (typeof v !== 'string' || !VALID_VALENCES.has(v as AbiValence)) {
      issues.push({
        path: `$.valence.recentTrace[${idx}].valence`,
        message: `valence must be one of ${[...VALID_VALENCES].join('|')}`,
        code: 'INVALID_VALENCE',
      });
    }
  });
  return issues;
}

/**
 * Validate a payload against the canonical ABI schema + PULSE static gates.
 *
 * Returns { status, issues }. Caller decides what to do with FAIL.
 */
export function validateAbiPayload(payload: unknown): AbiValidationVerdict {
  const version =
    isObject(payload) && typeof (payload as Record<string, unknown>)['abiVersion'] === 'string'
      ? ((payload as Record<string, unknown>)['abiVersion'] as string)
      : ABI_VERSION;

  const structural = structuralCheck(payload);
  if (structural.length > 0) {
    return fail([...structural], version);
  }
  const leakage = promptLeakageScan(payload);
  const overclaim = noOverclaimCheck(payload);
  const valence = valenceSanityCheck(payload);
  const all = [...leakage, ...overclaim, ...valence];
  if (all.length > 0) return fail(all, version);
  return pass(version);
}

/**
 * Type-narrow helper.
 */
export function assertValidAbi(payload: unknown): asserts payload is CognitiveStateAbi {
  const verdict = validateAbiPayload(payload);
  if (verdict.status === 'FAIL') {
    const summary = verdict.issues
      .map((i) => `${i.path}: ${i.code} — ${i.message}`)
      .join('; ');
    throw new Error(`ABI validation failed: ${summary}`);
  }
}

/**
 * Compare two abiVersion strings semver-wise. Returns:
 *   - 'compatible' when major matches (minor/patch can differ).
 *   - 'major-bump-required' when target is a major bump from current.
 *   - 'downgrade' when target is older.
 *   - 'invalid' when either is not a parseable semver.
 */
export function compareAbiVersions(
  current: string,
  target: string,
): 'compatible' | 'major-bump-required' | 'downgrade' | 'invalid' {
  const parse = (v: string): readonly [number, number, number] | null => {
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
    if (!m || !m[1] || !m[2] || !m[3]) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  };
  const c = parse(current);
  const t = parse(target);
  if (!c || !t) return 'invalid';
  if (t[0] > c[0]) return 'major-bump-required';
  if (t[0] < c[0]) return 'downgrade';
  if (t[1] < c[1] || (t[1] === c[1] && t[2] < c[2])) return 'downgrade';
  return 'compatible';
}
