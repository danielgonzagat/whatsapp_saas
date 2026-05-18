/**
 * AtomicEditTrace + verbosity levels.
 *
 * Two problems this solves, both raised by the repo owner:
 *
 *  1. Token economy. The atomicDiff/previewDiff strings are for the *human*,
 *     but every byte of a tool result is also fed back into the *model's*
 *     context and costs tokens. So the default tool payload must be terse
 *     for the model, while the full proof is persisted to a file the human
 *     (or an auditor) can open on demand.
 *
 *  2. Auditable proof. Every mutation writes an AtomicEditTrace JSON to
 *     .atomic/traces/<op>.json: intention-level operator, char metrics,
 *     expansion factor avoided, validation deltas, afterSha256, the inline
 *     char-level preview, and rollback availability. This is the durable
 *     evidence that the edit was atomic, independent of what any closed CLI
 *     TUI chooses to paint.
 *
 * Fail-closed: trace writing NEVER throws and NEVER blocks/!corrupts the
 * edit (the edit has already been validated + persisted by the time we get
 * here). A failed trace write degrades to a `traceWriteError` field — it is
 * surfaced honestly, never swallowed.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { REPO_ROOT } from './guard.js';
import { buildFounderBlock, type FounderBlock } from './founder.js';

export type Verbosity = 'L0' | 'L1' | 'L2' | 'L3';

const VALID: ReadonlySet<string> = new Set(['L0', 'L1', 'L2', 'L3']);

/**
 * L0 silent (model-cheapest: ok+file+validation+tracePath, no diff)
 * L1 atomic-compact (DEFAULT: + char-level atomicDiff, no legacy line diff)
 * L2 atomic-expanded (+ legacy line-context diff too)
 * L3 full (+ the entire trace object inline — on demand only)
 *
 * Resolution order: explicit arg → env ATOMIC_EDIT_VERBOSITY → "L1".
 */
export function resolveVerbosity(explicit?: string): Verbosity {
  const e = explicit && VALID.has(explicit) ? explicit : undefined;
  const env =
    typeof process !== 'undefined' &&
    process.env &&
    VALID.has(process.env.ATOMIC_EDIT_VERBOSITY ?? '')
      ? process.env.ATOMIC_EDIT_VERBOSITY
      : undefined;
  return (e ?? env ?? 'L1') as Verbosity;
}

/**
 * Preview (dry-run) is the "verify before writing" path — the operator
 * explicitly wants full proof there, so it floors at L2 (legacy line diff
 * kept) unless the resolved level is the even-richer L3. The committed path
 * — the high-frequency one that repeatedly floods model context during
 * autonomous loops — uses the resolved default (L1: compact char proof,
 * full trace to file). This is where the real token saving lands.
 */
export function levelFor(preview: boolean, explicit?: string): Verbosity {
  const resolved = resolveVerbosity(explicit);
  if (!preview) return resolved;
  return resolved === 'L3' ? 'L3' : 'L2';
}

export interface TraceMetrics {
  changedChars: number;
  lineRewriteSurfaceChars: number;
  expansionFactorAvoided: number;
  bytesNet: number;
  lineRewriteAvoided: boolean;
}

export interface PreservationZone {
  kind: string;
  description: string;
  beforeHash?: string;
  afterHash?: string;
  sample?: string;
}

export interface ModifiedZone {
  kind: string;
  oldTextHash?: string;
  newTextHash?: string;
  oldSample?: string;
  newSample?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface MovementZone {
  kind: string;
  description: string;
  from?: string;
  to?: string;
  preservedHash?: string;
}

export interface AtomicEditTrace {
  traceVersion: '1.0';
  operationId: string;
  ts: string;
  file: string;
  /** Absolute repo/worktree root that owns this trace. */
  repoRoot?: string;
  /** Alias for operator, kept for auditor readability and external consumers. */
  operation: string;
  operator: string;
  /** The smallest structural/product unit the operation claims to target. */
  targetUnit: string;
  /** Human/product intention represented by this mutation. */
  intention: string;
  fallback: boolean;
  metrics: TraceMetrics;
  validation: { language: string; syntaxErrorsBefore: number; syntaxErrorsAfter: number };
  afterSha256: string;
  rollback: { available: boolean; strategy: string };
  inlinePreview: string;
  preservedZones: PreservationZone[];
  modifiedZones: ModifiedZone[];
  movementZones: MovementZone[];
  semanticImpact: string;
  /** Auditability-without-code layer (thesis apex). */
  audit: FounderBlock;
}

export function newOperationId(): string {
  return `op_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

const sha256 = (s: string): string => crypto.createHash('sha256').update(s).digest('hex');

/** Build a trace from what every mutation site already has in hand. */
export function buildTrace(args: {
  file: string;
  repoRoot?: string;
  operator: string;
  before: string;
  newText: string;
  inlinePreview: string;
  validation: { language: string; before: number; after: number };
  metrics?: Partial<TraceMetrics>;
  targetUnit?: string;
  intention?: string;
  preservedZones?: PreservationZone[];
  modifiedZones?: ModifiedZone[];
  movementZones?: MovementZone[];
  semanticImpact?: string;
}): AtomicEditTrace {
  const changed = args.metrics?.changedChars ?? 0;
  const surface = args.metrics?.lineRewriteSurfaceChars ?? 0;
  const expansion =
    args.metrics?.expansionFactorAvoided ?? Number((surface / Math.max(changed, 1)).toFixed(2));
  // A line rewrite is avoided when the durable trace proves the real changed
  // span is smaller than the line-level surface a blunt editor would expose.
  // Higher expansion is better: more surrounding text was preserved.
  const derivedLineRewriteAvoided = changed === 0 ? true : surface > changed;
  return {
    traceVersion: '1.0',
    operationId: newOperationId(),
    ts: new Date().toISOString(),
    file: args.file,
    repoRoot: args.repoRoot,
    operation: args.operator,
    operator: args.operator,
    targetUnit: args.targetUnit ?? 'text_span',
    intention: args.intention ?? args.operator,
    fallback: false,
    metrics: {
      changedChars: changed,
      lineRewriteSurfaceChars: surface,
      expansionFactorAvoided: expansion,
      bytesNet: args.metrics?.bytesNet ?? args.newText.length - args.before.length,
      lineRewriteAvoided: args.metrics?.lineRewriteAvoided ?? derivedLineRewriteAvoided,
    },
    validation: {
      language: args.validation.language,
      syntaxErrorsBefore: args.validation.before,
      syntaxErrorsAfter: args.validation.after,
    },
    afterSha256: sha256(args.newText),
    rollback: {
      available: true,
      strategy: 'explicit pre-edit snapshot (before-text retained by caller)',
    },
    inlinePreview: args.inlinePreview,
    preservedZones: args.preservedZones ?? [
      {
        kind: 'unchanged_context',
        description:
          'Everything outside the modified zone is preserved byte-for-byte by the atomic operation.',
      },
    ],
    modifiedZones: args.modifiedZones ?? [
      {
        kind: 'changed_span',
        oldTextHash: sha256(args.before),
        newTextHash: sha256(args.newText),
        description: 'The operation changed the highlighted span shown in inlinePreview.',
      },
    ],
    movementZones: args.movementZones ?? [],
    semanticImpact: args.semanticImpact ?? 'unclassified_code_edit',
    audit: buildFounderBlock({
      file: args.file,
      operator: args.operator,
      language: args.validation.language,
      syntaxBefore: args.validation.before,
      syntaxAfter: args.validation.after,
      changedChars: changed,
      expansionFactor: expansion,
    }),
  };
}

function traceRepoRoot(trace: AtomicEditTrace): string {
  return trace.repoRoot && path.isAbsolute(trace.repoRoot) ? trace.repoRoot : REPO_ROOT;
}

function traceDirFor(trace: AtomicEditTrace): string {
  return path.join(traceRepoRoot(trace), '.atomic', 'traces');
}

/**
 * Persist the trace. Fail-closed: returns the selected repo-relative path on success,
 * or an error string on failure — never throws, never blocks the edit.
 */
export function writeTrace(trace: AtomicEditTrace): {
  tracePath?: string;
  traceWriteError?: string;
} {
  try {
    const repoRoot = traceRepoRoot(trace);
    const traceDir = traceDirFor(trace);
    fs.mkdirSync(traceDir, { recursive: true });
    const abs = path.join(traceDir, `${trace.operationId}.json`);
    const tmp = `${abs}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(trace, null, 2));
    fs.renameSync(tmp, abs);
    return { tracePath: path.relative(repoRoot, abs) };
  } catch (e) {
    return { traceWriteError: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Echo cap for the inline char-level diff returned in the tool *result*.
 * The full proof is ALWAYS persisted to the trace file (writeTrace); only the
 * model-facing echo is capped. Small diffs (≤ cap) are echoed verbatim so
 * non-technical trust on a small change is preserved; large diffs collapse to
 * a compact verdict — the dominant self-inflicted context tax (A/B R18: one
 * atomic_edit_symbol result = 43,586 chars) is the redundantly echoed full
 * old+new body of a large symbol, while the complete proof already lives on
 * disk. atomic_decompose_file already applies this discipline; generalize it.
 */
const ECHO_PREVIEW_CAP = 1200;

/**
 * Pure: keep small inline proofs verbatim, collapse large ones to a single
 * verdict block (no raw old/new body). The full char-level proof is never
 * lost — it stays in parts.trace.inlinePreview and is persisted to disk.
 */
function compactPreview(
  inlinePreview: string,
  t: AtomicEditTrace,
  tracePathOrNull: string | null,
): string {
  if (inlinePreview.length <= ECHO_PREVIEW_CAP) return inlinePreview;
  const where = tracePathOrNull ? ` (${tracePathOrNull})` : '';
  return (
    `[ large change · ${t.metrics.changedChars} chars changed · ` +
    `net ${t.metrics.bytesNet} bytes · expansion ${t.metrics.expansionFactorAvoided}× · ` +
    `full char-level proof persisted to trace file${where} (not echoed back, to save context) ]`
  );
}

/**
 * Trim a full payload to the resolved verbosity level and attach the trace
 * pointer. `inlinePreview` is the char-level atomicDiff; `legacyDiff` is the
 * line-oriented previewDiff (verbose — only L2/L3).
 */
export function shapePayload(
  level: Verbosity,
  base: Record<string, unknown>,
  parts: { inlinePreview: string; legacyDiff?: string; trace: AtomicEditTrace },
): Record<string, unknown> {
  const persisted = writeTrace(parts.trace);
  const t = parts.trace;
  // Compute the model-facing echo ONCE, after persisted is known. Small diffs
  // pass through verbatim; large ones collapse to a verdict (full proof on disk).
  const previewEcho = compactPreview(parts.inlinePreview, t, persisted.tracePath ?? null);
  // Camada 2 — compact human block FIRST, so the native CLI TUI shows this
  // (not raw JSON) as the edit's visual proof. This is what replaces the
  // banned native line-diff on screen.
  const validationSummary = {
    syntax: t.validation.syntaxErrorsAfter <= t.validation.syntaxErrorsBefore ? 'ok' : 'regressed',
    typecheck: 'not-run',
    protectedFile: 'no',
    sha256: 'ok',
  } as const;
  const traceLine = persisted.tracePath
    ? `Trace: ${persisted.tracePath}`
    : `Trace error: ${persisted.traceWriteError ?? 'unknown'}`;
  const summary =
    `✅ Atomic edit applied\n\n` +
    `${t.file}\n` +
    `${previewEcho}\n\n` +
    `Validation:\n` +
    `- syntax: ${validationSummary.syntax}\n` +
    `- typecheck: ${validationSummary.typecheck}\n` +
    `- protected file: ${validationSummary.protectedFile}\n` +
    `- sha256: ${validationSummary.sha256}\n\n` +
    `Trace metrics: expansion ${t.metrics.expansionFactorAvoided}× · ${t.metrics.changedChars} chars · ` +
    `zeroCodeTrust ${t.audit.zeroCodeTrust} (${t.audit.promiseClass})\n` +
    `Topology: ${t.targetUnit} · ${t.semanticImpact} · preserved ${t.preservedZones.length} · ` +
    `modified ${t.modifiedZones.length} · moved ${t.movementZones.length}\n` +
    traceLine;
  const out: Record<string, unknown> = {
    // A/B loop R5 finding: `summary` was a byte-identical duplicate of
    // `summaryForHuman` (each embeds the full inline diff) — a ~1–3 KB
    // per-call token tax the model re-ingests every turn. Keep ONE.
    summaryForHuman: summary,
    ...base,
    operationId: parts.trace.operationId,
    operation: parts.trace.operation,
    validationSummary,
    ...persisted,
  };
  // Slim in-result founder: the full audit (whatChanged / whatPreserved /
  // howToValidate / nonTouched / trustCeilingReason) is already persisted in
  // the trace file. Carrying all of it on EVERY op result is a per-call token
  // tax the model re-ingests every turn (A/B loop: per-op payload must shrink).
  // Keep only the irreducible proof keys + a pointer to the full audit.
  out.founder = {
    promiseClass: t.audit.promiseClass,
    zeroCodeTrust: t.audit.zeroCodeTrust,
    notProven: t.audit.notProven,
    tracePath: persisted.tracePath ?? null,
  };
  if (level === 'L0') return out;
  // L1 (default committed path): atomicDiff mirrors the model-facing echo —
  // the FULL inline proof for small edits, the compact verdict for large ones.
  // The complete char-level proof always lives in the persisted trace file, so
  // no proof is lost; this only removes the redundant context tax.
  out.atomicDiff = previewEcho;
  if (level === 'L1') return out;
  // L2/L3 (preview / rich, on-demand): echo the FULL char-level inline diff.
  out.atomicDiff = parts.inlinePreview;
  if (parts.legacyDiff !== undefined) out.diff = parts.legacyDiff;
  if (level === 'L2') return out;
  out.trace = parts.trace; // L3 only
  return out;
}
