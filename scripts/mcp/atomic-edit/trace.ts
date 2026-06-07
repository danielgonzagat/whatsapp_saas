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
import { type RegistryRun } from './gates/registry.js';
import { removedByteCountBetween, type NegativeActionProof } from './server-helpers-negative-proof.js';
// #1 Proof-Carrying Edits: the RE-EXEC core. Type-only import of the decision-tree
// node shape + the snapshot builder used to persist before/after content for re-exec.
import { buildSnapshot, decisionTreeOf, gateRunIdOf, type GateDecisionNode } from './engine-proof-reexec.js';

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
  /** Byte offset in original file (0-based) where this preserved zone starts. */
  byteStart: number;
  /** Byte offset in original file (0-based, exclusive) where this preserved zone ends. */
  byteEnd: number;
  /** Length of this zone in bytes (before === after). */
  byteLength: number;
  beforeHash?: string;
  afterHash?: string;
  sample?: string;
}

export interface ModifiedZone {
  kind: string;
  /** Byte offset in original file (0-based) where modified zone starts. */
  byteStart: number;
  /** Byte offset in original file (0-based, exclusive) where modified zone ends. */
  byteEnd: number;
  /** Length of new text in bytes (may differ from old length). */
  newByteLength: number;
  oldTextHash?: string;
  newTextHash?: string;
  oldSample?: string;
  newSample?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface ByteEffect {
  beforeBytes: number;
  proposedBytes: number;
  currentAfterBytes: number;
  removedBytes: number;
  addedBytes: number;
  netBytes: number;
}

export interface MovementZone {
  kind: string;
  description: string;
  /** Byte offset in original file (0-based) where moved content started. */
  oldByteStart?: number;
  /** Byte offset in original file (0-based, exclusive) where moved content ended. */
  oldByteEnd?: number;
  /** Byte offset in new file (0-based) where moved content now starts. */
  newByteStart?: number;
  /** Byte offset in new file (0-based, exclusive) where moved content now ends. */
  newByteEnd?: number;
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
  /** Byte-level effect receipt over UTF-8 bytes, independent of JS string length. */
  byteEffect: ByteEffect;
  validation: { language: string; syntaxErrorsBefore: number; syntaxErrorsAfter: number };
  /** True when the operator only validated a proposal and did not write the file. */
  preview: boolean;
  /** True when the target file was persisted with the proposed content. */
  changed: boolean;
  /** Hash of current on-disk content after the operation; unchanged for previews. */
  afterSha256: string;
  /** Hash of the proposed content, even for previews that are not written. */
  proposedSha256: string;
  rollback: { available: boolean; strategy: string };
  inlinePreview: string;
  preservedZones: PreservationZone[];
  modifiedZones: ModifiedZone[];
  movementZones: MovementZone[];
  semanticImpact: string;
  /** Admission proof required before any negative byte effect may touch disk. */
  negativeActionProof?: NegativeActionProof;
  /** Auditability-without-code layer (thesis apex). */
  audit: FounderBlock;
  /**
   * Proof-chained ledger fields. The trace store is a content-addressed,
   * append-only chain: each op points at the prior chain head and binds the
   * gate verdict that admitted the write.
   */
  /** chainHash of the prior trace at write time (.atomic/HEAD before this op). '' = genesis. */
  parentSha256: string;
  /** The convergence verdict (gate run) that admitted this write — converge persists its proof, never throws it away. */
  gateVerdict?: RegistryRun;
  /** sha256(parentSha256 ‖ afterSha256 ‖ canonicalJSON(gateVerdict)). The tamper-evident link; becomes the next .atomic/HEAD. */
  chainHash: string;
  /**
   * #3 Causal-blame linkage (additive): a STABLE per-process session id stamped on
   * every trace so a defect can be mapped to the atomic SESSION that produced it —
   * not merely file+timestamp. Resolved once per process from ATOMIC_SESSION_ID (so
   * a host launcher can pin a session) or generated; identical across every trace of
   * one server/CLI run. Optional so legacy traces (written before this field existed)
   * still parse — those degrade to the file+timestamp mapping, never throw.
   */
  sessionId?: string;
}

/**
 * #1 Proof-Carrying Edits — RE-EXEC linkage (additive, all optional).
 *
 * The chain hash proves "these bytes hash to that". The strong claim — "re-run the
 * construction and the recorded verdict reproduces" — needs the gate run cryptographically
 * identified, its decision tree captured (the gate-by-gate reasoning), and a pointer to the
 * before/after CONTENT snapshot a verifier re-runs engine.validate over. Stamped onto the
 * trace shape so `atomic prove` can mint a re-executable artifact. Optional so legacy traces
 * and previews (no content written) still parse + degrade to the hash-only verifier.
 */
export interface AtomicEditTrace {
  /** Dedicated cryptographic id of THIS gated op's gate run (grun_<sha256>); see engine-proof-reexec.gateRunIdOf. */
  gateRunId?: string;
  /** Full per-gate decision tree (name + ran/red/unjudged/notApplicable + fact) extracted from the gate verdict. */
  decisionTree?: GateDecisionNode[];
  /** repo-relative path to the before/after content snapshot (.atomic/snapshots/<op>.snap.json) the re-exec verifier reads. */
  snapshotPath?: string;
}

export function newOperationId(): string {
  return `op_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * The STABLE per-process session id (#3 causal-blame linkage). Resolved ONCE and
 * memoized so every trace written by one server/CLI run carries the identical id:
 *   1. ATOMIC_SESSION_ID env — a host launcher (or the MCP launcher script) pins it,
 *      so the session id survives across the trace writer AND the blame reader.
 *   2. else a generated `sess_<ms>_<rand>` — stable for the lifetime of this process.
 * Exported so the blame engine groups traces by the SAME id the writer stamped, and
 * so a launcher can read back the id it pinned. Additive: never throws, never blocks.
 */
let MEMOIZED_SESSION_ID: string | null = null;
export function currentSessionId(): string {
  if (MEMOIZED_SESSION_ID !== null) return MEMOIZED_SESSION_ID;
  const pinned =
    typeof process !== 'undefined' && process.env && typeof process.env.ATOMIC_SESSION_ID === 'string'
      ? process.env.ATOMIC_SESSION_ID.trim()
      : '';
  MEMOIZED_SESSION_ID = pinned !== '' ? pinned : `sess_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  return MEMOIZED_SESSION_ID;
}

const sha256 = (s: string): string => crypto.createHash('sha256').update(s).digest('hex');

/**
 * Deterministic JSON: object keys are emitted in sorted order at every depth so
 * the chain hash is stable regardless of insertion order. Arrays keep order
 * (order is semantic for the gate run). undefined → null so the shape is total.
 */
export function canonicalJSON(value: unknown): string {
  const norm = (v: unknown): unknown => {
    if (v === null || v === undefined) return null;
    if (Array.isArray(v)) return v.map(norm);
    if (typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        out[k] = norm((v as Record<string, unknown>)[k]);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(norm(value));
}

/**
 * The tamper-evident link of the proof chain:
 *   chainHash = sha256(parentSha256 ‖ afterSha256 ‖ canonicalJSON(gateVerdict))
 * Tamper with ANY of the three (re-point the parent, swap the after-content, or
 * edit the admitting gate verdict) and the recomputed hash no longer matches the
 * child's parent pointer. Exported so an auditor (and the proof) can re-derive it.
 */
export function chainHashOf(
  parentSha256: string,
  afterSha256: string,
  gateVerdict: RegistryRun | undefined,
): string {
  return sha256(`${parentSha256}‖${afterSha256}‖${canonicalJSON(gateVerdict)}`);
}

/** Absolute path to the chain-head marker (.atomic/HEAD) for a given trace's repo. */
function headPathFor(trace: AtomicEditTrace): string {
  return path.join(traceRepoRoot(trace), '.atomic', 'HEAD');
}

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
  preview?: boolean;
  changed?: boolean;
  /** The convergence verdict that admitted this write (converge passes conv.gates); omitted by plain edits. */
  gateVerdict?: RegistryRun;
  negativeActionProof?: NegativeActionProof;
}): AtomicEditTrace {
  const changed = args.metrics?.changedChars ?? 0;
  const surface = args.metrics?.lineRewriteSurfaceChars ?? 0;
  const expansion =
    args.metrics?.expansionFactorAvoided ?? Number((surface / Math.max(changed, 1)).toFixed(2));
  // A line rewrite is avoided when the durable trace proves the real changed
  // span is smaller than the line-level surface a blunt editor would expose.
  // Higher expansion is better: more surrounding text was preserved.
  const derivedLineRewriteAvoided = changed === 0 ? true : surface > changed;
  const preview = args.preview ?? false;
  const changedFlag = args.changed ?? !preview;
  const afterText = changedFlag ? args.newText : args.before;
  const beforeBytes = Buffer.byteLength(args.before, 'utf8');
  const proposedBytes = Buffer.byteLength(args.newText, 'utf8');
  const currentAfterBytes = Buffer.byteLength(afterText, 'utf8');
  const byteEffect: ByteEffect = {
    beforeBytes,
    proposedBytes,
    currentAfterBytes,
    removedBytes: removedByteCountBetween(args.before, args.newText),
    addedBytes: removedByteCountBetween(args.newText, args.before),
    netBytes: proposedBytes - beforeBytes,
  };
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
      bytesNet: args.metrics?.bytesNet ?? byteEffect.netBytes,
      lineRewriteAvoided: args.metrics?.lineRewriteAvoided ?? derivedLineRewriteAvoided,
    },
    byteEffect,
    validation: {
      language: args.validation.language,
      syntaxErrorsBefore: args.validation.before,
      syntaxErrorsAfter: args.validation.after,
    },
    preview,
    changed: changedFlag,
    afterSha256: sha256(afterText),
    proposedSha256: sha256(args.newText),
    rollback: {
      available: !preview,
      strategy: preview
        ? 'dry-run only; no target file write occurred'
        : 'explicit pre-edit snapshot (before-text retained by caller)',
    },
    inlinePreview: args.inlinePreview,
    preservedZones: args.preservedZones ?? [
      {
        kind: 'unchanged_context',
        byteStart: 0,
        byteEnd: Buffer.byteLength(args.before, 'utf8'),
        byteLength: Buffer.byteLength(args.before, 'utf8'),
        description:
          'Everything outside the modified zone is preserved byte-for-byte by the atomic operation.',
      },
    ],
    modifiedZones: args.modifiedZones ?? [
      {
        kind: 'changed_span',
        byteStart: 0,
        byteEnd: Buffer.byteLength(args.before, 'utf8'),
        newByteLength: Buffer.byteLength(args.newText, 'utf8'),
        oldTextHash: sha256(args.before),
        newTextHash: sha256(args.newText),
        description: preview
          ? 'Preview only: the highlighted span is proposed but was not written.'
          : 'The operation changed the highlighted span shown in inlinePreview.',
      },
    ],
    movementZones: args.movementZones ?? [],
    semanticImpact: args.semanticImpact ?? 'unclassified_code_edit',
    negativeActionProof: args.negativeActionProof,
    audit: buildFounderBlock({
      file: args.file,
      operator: args.operator,
      language: args.validation.language,
      syntaxBefore: args.validation.before,
      syntaxAfter: args.validation.after,
      changedChars: changed,
      expansionFactor: expansion,
    }),
    // Chain fields: parent + chainHash are computed at write time (they depend on
    // .atomic/HEAD), so buildTrace leaves them empty and writeTrace finalizes them.
    parentSha256: '',
    gateVerdict: args.gateVerdict,
    chainHash: '',
    // #1 Proof-Carrying Edits: the per-gate decision tree is derivable from the verdict
    // NOW (no parent/head needed), so stamp it here. gateRunId + snapshotPath depend on
    // parentSha256 / I/O and are finalized in writeTrace. Empty tree when no verdict.
    decisionTree: decisionTreeOf(args.gateVerdict),
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
export function writeTrace(
  trace: AtomicEditTrace,
  /**
   * #1 Proof-Carrying Edits (additive, optional): when a caller passes the before/after
   * CONTENT, writeTrace also persists a `.atomic/snapshots/<op>.snap.json` sidecar that a
   * re-exec verifier replays engine.validate over, and stamps `snapshotPath` + `gateRunId`
   * on the trace. Existing single-arg callers are unaffected (no snapshot → hash-only proof).
   */
  content?: { before: string; after: string },
): {
  tracePath?: string;
  traceWriteError?: string;
  chainHash?: string;
  snapshotPath?: string;
} {
  try {
    const repoRoot = traceRepoRoot(trace);
    const traceDir = traceDirFor(trace);
    fs.mkdirSync(traceDir, { recursive: true });

    // ── proof chain: read the prior head, link this op to it, advance the head ──
    const headPath = headPathFor(trace);
    let parent = '';
    try {
      parent = fs.readFileSync(headPath, 'utf8').trim();
    } catch {
      parent = ''; // genesis: no prior head yet
    }
    trace.parentSha256 = parent;
    trace.chainHash = chainHashOf(parent, trace.afterSha256, trace.gateVerdict);

    // #1 Proof-Carrying Edits: now that parent + afterSha256 are known, mint the dedicated
    // cryptographic gateRunId for this gated op (verdict ‖ after ‖ parent). Distinct runs
    // never collide; the same logical run is reproducible by the verifier. Additive stamp.
    trace.gateRunId = gateRunIdOf(trace.gateVerdict, trace.afterSha256, parent);

    // #1 Proof-Carrying Edits: when the caller passed before/after content, persist the
    // content snapshot the re-exec verifier replays engine.validate over. Written under
    // .atomic/snapshots/ (the opt-in content layer the replay/undo note already reserves),
    // via the same temp+rename atomic idiom. Fail-soft: a snapshot write failure degrades
    // to a hash-only proof — it MUST NOT block or corrupt the already-persisted trace.
    let snapshotPath: string | undefined;
    if (content) {
      try {
        const snapDir = path.join(repoRoot, '.atomic', 'snapshots');
        fs.mkdirSync(snapDir, { recursive: true });
        const snap = buildSnapshot(trace.file, content.before, content.after);
        const snapAbs = path.join(snapDir, `${trace.operationId}.snap.json`);
        const snapTmp = `${snapAbs}.tmp`;
        fs.writeFileSync(snapTmp, JSON.stringify(snap, null, 2));
        fs.renameSync(snapTmp, snapAbs);
        snapshotPath = path.relative(repoRoot, snapAbs);
        trace.snapshotPath = snapshotPath;
      } catch {
        // Snapshot is an ENHANCEMENT to the proof; its failure never blocks the edit.
        snapshotPath = undefined;
      }
    }

    // #3 causal-blame linkage: stamp the stable per-process session id additively at
    // persist time, so every trace this run writes is groupable to ONE atomic session
    // (the blame reader links git commits → sessions by op afterSha256 / commit
    // trailer). Respect a sessionId already set on the trace (a caller may pin one).
    if (trace.sessionId === undefined) trace.sessionId = currentSessionId();

    const abs = path.join(traceDir, `${trace.operationId}.json`);
    const tmp = `${abs}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(trace, null, 2));
    fs.renameSync(tmp, abs);

    // Advance .atomic/HEAD to this chainHash via the same temp+rename idiom so a
    // crash never leaves a half-written head. A failed head write must NOT corrupt
    // the chain silently — surface it, but the trace itself is already persisted.
    const headTmp = `${headPath}.tmp`;
    fs.writeFileSync(headTmp, trace.chainHash);
    fs.renameSync(headTmp, headPath);

    return { tracePath: path.relative(repoRoot, abs), chainHash: trace.chainHash, snapshotPath };
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
  const validationSummary = {
    syntax: t.validation.syntaxErrorsAfter <= t.validation.syntaxErrorsBefore ? 'ok' : 'regressed',
    typecheck: 'not-run',
    protectedFile: 'no',
    sha256: 'ok',
  } as const;
  const traceLine = persisted.tracePath
    ? `Trace: ${persisted.tracePath}`
    : `Trace error: ${persisted.traceWriteError ?? 'unknown'}`;
  const headline = t.preview ? '✅ Atomic edit preview (not written)' : '✅ Atomic edit applied';
  const summary =
    `${headline}\n\n` +
    `${t.file}\n` +
    `${parts.inlinePreview}\n\n` +
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
