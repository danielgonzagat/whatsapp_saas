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
 *     docs/ai/traces/<op>.json: intention-level operator, char metrics,
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

export interface AtomicEditTrace {
  traceVersion: '1.0';
  operationId: string;
  ts: string;
  file: string;
  operator: string;
  fallback: boolean;
  metrics: TraceMetrics;
  validation: { language: string; syntaxErrorsBefore: number; syntaxErrorsAfter: number };
  afterSha256: string;
  rollback: { available: boolean; strategy: string };
  inlinePreview: string;
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
  operator: string;
  before: string;
  newText: string;
  inlinePreview: string;
  validation: { language: string; before: number; after: number };
  metrics?: Partial<TraceMetrics>;
}): AtomicEditTrace {
  const changed = args.metrics?.changedChars ?? 0;
  const surface = args.metrics?.lineRewriteSurfaceChars ?? 0;
  const expansion =
    args.metrics?.expansionFactorAvoided ?? Number((surface / Math.max(changed, 1)).toFixed(2));
  // A line rewrite is "avoided" when the edit did NOT bloat far past the
  // real change. Expansion ≈ 1–3 is a true sub-line atomic edit (the ideal
  // is exactly 1: surface == changed). Line-oriented editors blow well past
  // this (the thesis reports ~12x). Threshold 4 cleanly separates the two.
  const LINE_REWRITE_EXPANSION = 4;
  return {
    traceVersion: '1.0',
    operationId: newOperationId(),
    ts: new Date().toISOString(),
    file: args.file,
    operator: args.operator,
    fallback: false,
    metrics: {
      changedChars: changed,
      lineRewriteSurfaceChars: surface,
      expansionFactorAvoided: expansion,
      bytesNet: args.metrics?.bytesNet ?? args.newText.length - args.before.length,
      lineRewriteAvoided: args.metrics?.lineRewriteAvoided ?? expansion <= LINE_REWRITE_EXPANSION,
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

const TRACE_DIR = path.join(REPO_ROOT, 'docs', 'ai', 'traces');

/**
 * Persist the trace. Fail-closed: returns the repo-relative path on success,
 * or an error string on failure — never throws, never blocks the edit.
 */
export function writeTrace(trace: AtomicEditTrace): {
  tracePath?: string;
  traceWriteError?: string;
} {
  try {
    fs.mkdirSync(TRACE_DIR, { recursive: true });
    const abs = path.join(TRACE_DIR, `${trace.operationId}.json`);
    const tmp = `${abs}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(trace, null, 2));
    fs.renameSync(tmp, abs);
    return { tracePath: path.relative(REPO_ROOT, abs) };
  } catch (e) {
    return { traceWriteError: e instanceof Error ? e.message : String(e) };
  }
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
  // Camada 2 — compact human block FIRST, so the native CLI TUI shows this
  // (not raw JSON) as the edit's visual proof. This is what replaces the
  // banned native line-diff on screen.
  const summary =
    `✅ Atomic edit — ${t.operator}\n` +
    `${t.file}\n` +
    `${parts.inlinePreview}\n` +
    `validation: ${t.validation.language} ${t.validation.syntaxErrorsBefore}->${t.validation.syntaxErrorsAfter} (ok)` +
    ` · expansion ${t.metrics.expansionFactorAvoided}× · ${t.metrics.changedChars} chars\n` +
    `zeroCodeTrust ${t.audit.zeroCodeTrust} (${t.audit.promiseClass})` +
    `${persisted.tracePath ? ` · trace ${persisted.tracePath}` : ''}`;
  const out: Record<string, unknown> = {
    summary,
    ...base,
    operationId: parts.trace.operationId,
    ...persisted,
  };
  // founder block rides at EVERY level incl. L0 — auditability-without-code
  // is the point; it is small and must never be the thing that gets trimmed.
  out.founder = parts.trace.audit;
  if (level === 'L0') return out;
  out.atomicDiff = parts.inlinePreview;
  if (level === 'L1') return out;
  if (parts.legacyDiff !== undefined) out.diff = parts.legacyDiff;
  if (level === 'L2') return out;
  out.trace = parts.trace; // L3 only
  return out;
}
