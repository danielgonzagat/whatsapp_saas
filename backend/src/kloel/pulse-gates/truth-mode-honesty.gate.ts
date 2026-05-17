import { fail, Gate, GateMode, GateVerdict, pass } from './pulse-gates.types';

/**
 * UTP-PULSE-004 — `truth-mode-honesty` gate.
 *
 * Implements PCI.4 §3.5: cognitive output declares truthMode that matches
 * how the content was produced. Detects:
 *
 *   1. truthMode vs producedBy mismatch (classifier claiming `observed`, etc.)
 *   2. ABI identityProjection without truthMode — claim with no epistemic tag
 *   3. Mixed truthMode (observed/inferred/projected) under the same
 *      cognition key — inconsistent epistemic tracing
 *   4. Terminal cognitive event without valence — PCI.5 §3.3 violation
 *   5. Identity projection leak — etymology/origin present in audience
 *      `public` (origin spiritual never contaminates public audience)
 *
 * Default mode is controlled by gate-mode-controller. The factory parameter
 * is a fallback for tests / standalone use.
 */

const MEASURED_BY = 'truth-mode-honesty.gate' as const;

// ─── type exports ───────────────────────────────────────────────────────

type TruthModeKey = 'observed' | 'inferred' | 'projected';
type ProducedBy = 'direct' | 'classifier' | 'model' | 'simulation';

/** Per-item check — producer must match declared truthMode. */
export interface TruthModeItem {
  readonly truthMode: TruthModeKey;
  readonly producedBy: ProducedBy;
  readonly path?: string;
}

/** A single cognition entry — used for mixed-mode + valence checks. */
interface TruthModeCognitiveEntry {
  readonly key: string;
  readonly truthMode?: string;
  readonly valence?: string;
  readonly isTerminal?: boolean;
  readonly path?: string;
}

/** ABI-level data for projection-leak and missing-truthMode checks. */
interface TruthModeAbiCheck {
  readonly identityProjection?: {
    readonly truthMode?: string;
    readonly audience?: string;
  };
  readonly lineage?: {
    readonly etymology?: string;
    readonly origin?: string;
  };
}

/** Discriminated: comprehensive cognitive-snapshot check. */
export interface TruthModeCognitiveCheck {
  readonly kind: 'cognitive';
  readonly items?: readonly TruthModeItem[];
  readonly abi?: TruthModeAbiCheck;
  readonly entries?: readonly TruthModeCognitiveEntry[];
}

/**
 * Union input — single item, or a `TruthModeCognitiveCheck` object.
 * Array-of-items is handled by the Gate wrapper type.
 */
export type TruthModeHonestyInput = TruthModeItem | TruthModeCognitiveCheck;

// ─── static sets ────────────────────────────────────────────────────────

const COMPATIBLE: Record<ProducedBy, ReadonlySet<TruthModeKey>> = {
  direct: new Set(['observed']),
  classifier: new Set(['inferred']),
  model: new Set(['inferred', 'projected']),
  simulation: new Set(['projected']),
};

const VALID_TRUTH_MODES: ReadonlySet<string> = new Set([
  'observed',
  'inferred',
  'projected',
]);

const VALID_AUDIENCES: ReadonlySet<string> = new Set([
  'public',
  'technical',
  'origin',
  'internal',
]);

const VALID_VALENCES: ReadonlySet<string> = new Set([
  'positive',
  'negative',
  'neutral',
  'ambiguous',
]);

// ─── type guards ────────────────────────────────────────────────────────

function isCognitiveCheck(
  v: unknown,
): v is TruthModeCognitiveCheck {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as Record<string, unknown>)['kind'] === 'cognitive'
  );
}

function isTruthModeItem(v: unknown): v is TruthModeItem {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o['truthMode'] === 'string' && typeof o['producedBy'] === 'string';
}

// ─── check helpers ──────────────────────────────────────────────────────

interface Offense {
  readonly path: string;
  readonly detail: string;
}

function checkItems(items: readonly TruthModeItem[]): Offense[] {
  const offenses: Offense[] = [];
  for (const it of items) {
    const allowed = COMPATIBLE[it.producedBy];
    if (!allowed.has(it.truthMode)) {
      offenses.push({
        path: it.path ?? '$',
        detail: `${it.producedBy} produces ${[...allowed].join('|')} but declared ${it.truthMode}`,
      });
    }
  }
  return offenses;
}

/**
 * ABI-level checks:
 *   (a) identityProjection truthMode missing or invalid
 *   (b) etymology/origin leaking into `public` audience
 */
function checkAbi(abi: TruthModeAbiCheck): Offense[] {
  const offenses: Offense[] = [];

  // (a) Claim without truthMode
  if (abi.identityProjection) {
    const tm = abi.identityProjection.truthMode;
    if (tm === undefined || tm === '') {
      offenses.push({
        path: '$.identityProjection.truthMode',
        detail: 'identityProjection must declare truthMode — claim without epistemic tag is dishonesty',
      });
    } else if (!VALID_TRUTH_MODES.has(tm)) {
      offenses.push({
        path: '$.identityProjection.truthMode',
        detail: `invalid truthMode "${tm}" — must be ${[...VALID_TRUTH_MODES].join('|')}`,
      });
    }

    // Validate audience is a known value
    const aud = abi.identityProjection.audience;
    if (aud !== undefined && aud !== '' && !VALID_AUDIENCES.has(aud)) {
      offenses.push({
        path: '$.identityProjection.audience',
        detail: `invalid audience "${aud}" — must be ${[...VALID_AUDIENCES].join('|')}`,
      });
    }
  }

  // (b) Etymology/origin leak into public audience
  const audience = abi.identityProjection?.audience;
  if (audience === 'public' && abi.lineage) {
    if (abi.lineage.etymology !== undefined) {
      offenses.push({
        path: '$.lineage.etymology',
        detail: 'etymology must not be present in audience "public" — origin spiritual never contaminates public audience (PCI.5 §4.2, PCI.4 §3.3)',
      });
    }
    if (abi.lineage.origin !== undefined) {
      offenses.push({
        path: '$.lineage.origin',
        detail: 'origin must not be present in audience "public" — origin spiritual never contaminates public audience (PCI.5 §4.2, PCI.4 §3.3)',
      });
    }
  }

  return offenses;
}

/**
 * Cognition-entry checks:
 *   (c) Mixed truthMode across entries sharing the same cognition key
 *   (d) Terminal event without valence
 *   (e) Invalid valence value
 */
function checkCognitionEntries(
  entries: readonly TruthModeCognitiveEntry[],
): Offense[] {
  const offenses: Offense[] = [];

  // (c) Detect mixed truthMode per cognition key
  const byKey = new Map<string, TruthModeCognitiveEntry[]>();
  for (const e of entries) {
    const list = byKey.get(e.key) ?? [];
    list.push(e);
    byKey.set(e.key, list);
  }

  for (const [, group] of byKey) {
    const modes = new Set(
      group.map((e) => e.truthMode).filter((m): m is string => m !== undefined && m !== ''),
    );
    if (modes.size > 1) {
      const first = group[0]!;
      offenses.push({
        path: first.path ?? `cognition.${first.key}`,
        detail: `cognition key "${first.key}" has mixed truthModes: ${[...modes].join(', ')} — inconsistent epistemic tracing (PCI.5 §1.2)`,
      });
    }
  }

  // (d) + (e) Terminal event valence
  for (const e of entries) {
    if (e.isTerminal && (e.valence === undefined || e.valence === '')) {
      offenses.push({
        path: e.path ?? `cognition.${e.key}`,
        detail: `terminal event "${e.key}" must declare valence (PCI.5 §3.3)`,
      });
    }
    if (
      e.valence !== undefined &&
      e.valence !== '' &&
      !VALID_VALENCES.has(e.valence)
    ) {
      offenses.push({
        path: e.path ?? `cognition.${e.key}`,
        detail: `invalid valence "${e.valence}" — must be ${[...VALID_VALENCES].join('|')}`,
      });
    }
  }

  return offenses;
}

// ─── gate factory ───────────────────────────────────────────────────────

export function makeTruthModeHonestyGate(
  mode: GateMode = 'log_only',
): Gate<TruthModeHonestyInput | readonly TruthModeHonestyInput[]> {
  return {
    name: 'truth-mode-honesty',
    mode,
    check: (input): GateVerdict => {
      const allOffenses: Offense[] = [];

      if (Array.isArray(input)) {
        for (const element of input) {
          if (isCognitiveCheck(element)) {
            if (element.items) allOffenses.push(...checkItems(element.items));
            if (element.abi) allOffenses.push(...checkAbi(element.abi));
            if (element.entries) allOffenses.push(...checkCognitionEntries(element.entries));
          } else if (isTruthModeItem(element)) {
            allOffenses.push(...checkItems([element]));
          }
        }
      } else if (isCognitiveCheck(input)) {
        if (input.items) allOffenses.push(...checkItems(input.items));
        if (input.abi) allOffenses.push(...checkAbi(input.abi));
        if (input.entries) allOffenses.push(...checkCognitionEntries(input.entries));
      } else if (isTruthModeItem(input)) {
        allOffenses.push(...checkItems([input]));
      }

      if (allOffenses.length === 0) {
        return pass('truth-mode-honesty', mode, MEASURED_BY);
      }
      return fail(
        'truth-mode-honesty',
        mode,
        MEASURED_BY,
        `${allOffenses.length} truthMode dishonesty issue(s)`,
        allOffenses.map((o) => ({ path: o.path, detail: o.detail })),
      );
    },
  };
}
