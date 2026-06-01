/**
 * server-helpers-multifile.ts — the multi-file atomic transaction primitive,
 * extracted from the proven atomic_transaction handler so every multi-file
 * writer (atomic_transaction, atomic_ast_rewrite, atomic_apply_workspace_edit)
 * shares ONE all-or-nothing commit path.
 *
 * Firewall contract (unchanged from atomic_transaction):
 *  - Phase 1: resolve every file through resolveSafeTarget (repo-containment +
 *    protected-file refusal), apply its edits + validate in memory. If ANY file
 *    would regress syntax, the whole plan is refused and NOTHING is written.
 *  - Phase 2: write all changed files; if a write throws mid-flight, already-
 *    written files are restored from their pre-edit snapshot (best-effort) and
 *    the transaction fails.
 *  - One AtomicEditTrace per changed file.
 *
 * Callers pass edits as 1-based line/column TextEditSpec[] (UTF-16 columns).
 * Byte-offset / LSP-position conversion is the CALLER's responsibility.
 */
import { applyEdits, computeZones, type TextEditSpec, type ApplyResult } from './engine.js';
import { resolveSafeTarget } from './guard.js';
import { readUtf8, atomicWrite, log } from './server-helpers-io.js';
import { buildTrace, writeTrace } from './trace.js';
import { characterDiff } from './advanced.js';
import { ok, fail, type ToolOk } from './server-helpers-result.js';
import { requireNegativeActionProof, removedByteCountBetween } from './server-helpers-negative-proof.js';
import { registerPendingWrites, clearPendingWrites } from './connection-gate.js';
import * as path from 'node:path';

export interface MultiFileEntry {
  /** repo-relative path */
  file: string;
  /** ≥1 non-overlapping ranged edits (1-based line/column, UTF-16) */
  edits: TextEditSpec[];
}

interface Staged {
  relPath: string;
  absPath: string;
  repoRoot: string;
  before: string;
  result: ApplyResult;
}

/**
 * Apply a multi-file edit plan atomically (all-or-nothing). `operator` labels
 * the trace ledger entry. Returns a ToolOk (fail() on any validation/write
 * problem; nothing is written when it fails).
 */
export function applyMultiFilePlan(
  plan: MultiFileEntry[],
  operator: string,
  preview: boolean,
  proofOfIncorrectness?: string,
): ToolOk {
  if (plan.length === 0) return fail('empty plan: no files to edit');

  // Phase 1 — resolve + apply + validate ALL in memory. Write nothing.
  const staged: Staged[] = [];
  for (const entry of plan) {
    if (entry.edits.length === 0) continue;
    const { absPath, relPath, repoRoot } = resolveSafeTarget(entry.file);
    const before = readUtf8(absPath);
    const result = applyEdits(relPath, before, entry.edits);
    if (!result.validation.ok) {
      return fail(
        `transaction REFUSED — ${relPath} would regress ` +
          `(${result.validation.language}: ${result.validation.before}->${result.validation.after}). ` +
          `${result.validation.introduced ?? ''} — NOTHING written (all-or-nothing).`,
      );
    }
    staged.push({ relPath, absPath, repoRoot, before, result });
  }
  if (staged.length === 0) return ok({ ok: true, changed: false, note: 'plan produced no edits' });

  const changedStaged = staged.filter((s) => s.result.newText !== s.before);
  const removedByteCount = changedStaged.reduce(
    (total, s) => total + removedByteCountBetween(s.before, s.result.newText),
    0,
  );
  const negativeActionProof = preview || removedByteCount <= 0
    ? undefined
    : requireNegativeActionProof({
        action: operator,
        target: changedStaged.map((s) => s.relPath).join(', '),
        targetUnit: 'multi-file-plan',
        removedByteCount,
        proofOfIncorrectness,
      });

  const traces = staged.map((s) => ({
    file: s.relPath,
    trace: buildTrace({
      file: s.relPath,
      repoRoot: s.repoRoot,
      operator,
      before: s.before,
      newText: s.result.newText,
      inlinePreview: characterDiff(s.before, s.result.newText, s.relPath),
      validation: {
        language: s.result.validation.language,
        before: s.result.validation.before,
        after: s.result.validation.after,
      },
      metrics: {
        changedChars: s.result.changedChars,
        lineRewriteSurfaceChars: s.result.lineSurfaceChars,
        expansionFactorAvoided: s.result.expansionFactor,
        bytesNet: s.result.newText.length - s.before.length,
      },
      preservedZones: computeZones(s.before, s.result.newText).preservedZones,
      modifiedZones: computeZones(s.before, s.result.newText).modifiedZones,
      movementZones: [],
      preview,
      changed: !preview && s.result.newText !== s.before,
      negativeActionProof,
    }),
  }));

  const files = staged.map((s, index) => ({
    file: s.relPath,
    changed: s.result.newText !== s.before,
    atomicDiff: traces[index].trace.inlinePreview,
    intentionChars: s.result.changedChars,
    expansionFactorAvoided: s.result.expansionFactor,
  }));

  const summarize = (headline: string, traceRefs: string[] = []): string => {
    const changedFiles = files.filter((f) => f.changed);
    const previews = changedFiles.length
      ? changedFiles.map((f) => `${f.file}\n${f.atomicDiff}`).join('\n\n')
      : 'No file content changed.';
    const tracesBlock = traceRefs.length
      ? `\n\nTraces:\n${traceRefs.map((t) => `- ${t}`).join('\n')}`
      : '';
    return (
      `${headline}\n\n${previews}\n\n` +
      `Validation:\n- syntax: ok\n- typecheck: not-run\n- protected file: no\n- sha256: ok` +
      tracesBlock
    );
  };

  if (preview) {
    const summaryForHuman = summarize(`✅ ${operator} preview`);
    return ok({
      summaryForHuman,
      summary: summaryForHuman,
      ok: true,
      preview: true,
      transaction: true,
      changed: false,
      note: `dry-run: ${staged.length} file(s) validated, NOTHING written`,
      files,
    });
  }

  // Phase 2 — write all; roll back written files if any write throws.
  const written: { absPath: string; before: string }[] = [];
  // The transaction is one atomic set: register every target as pending so the
  // byte-floor connection gate judges the set as a whole, not file-by-file.
  registerPendingWrites(staged.map((s) => s.absPath));
  try {
    for (const s of staged) {
      if (s.result.newText === s.before) continue;
      atomicWrite(s.absPath, s.result.newText);
      written.push({ absPath: s.absPath, before: s.before });
    }
  } catch (writeErr) {
    for (const w of written) {
      try {
        atomicWrite(w.absPath, w.before);
      } catch {
        /* best-effort rollback; report original error below */
      }
    }
    return fail(
      `transaction write failed; rolled back ${written.length} file(s): ` +
        (writeErr instanceof Error ? writeErr.message : String(writeErr)),
    );
  } finally {
    clearPendingWrites();
  }

  const traceRefs: string[] = [];
  for (const item of traces) {
    const changedFile = files.find((f) => f.file === item.file && f.changed);
    if (!changedFile) continue;
    const persisted = writeTrace(item.trace);
    Object.assign(changedFile, persisted);
    traceRefs.push(
      persisted.tracePath ?? `trace error for ${item.file}: ${persisted.traceWriteError ?? 'unknown'}`,
    );
  }
  log(`${operator} wrote ${written.length}/${staged.length} file(s)`);
  const summaryForHuman = summarize(`✅ ${operator} applied`, traceRefs);
  return ok({
    summaryForHuman,
    summary: summaryForHuman,
    ok: true,
    transaction: true,
    changed: true,
    filesWritten: written.length,
    files,
    ...(negativeActionProof ? { negativeActionProof } : {}),
  });
}

/**
 * Write a set of WHOLE-FILE replacements (rel -> newContent) with rollback +
 * one trace per file. For callers (cross-file rename) that already computed full
 * file contents rather than ranged edits, and that already validated the plan
 * all-or-nothing. On a mid-loop write failure it restores every already-written
 * file (best-effort) and throws. Returns the persisted trace paths.
 */
export function writeWholeFilePlan(
  repoRoot: string,
  changes: Iterable<[string, string]>,
  operator: string,
): string[] {
  const entries = [...changes].map(([rel, after]) => {
    const absPath = path.join(repoRoot, rel);
    return { rel, absPath, before: readUtf8(absPath), after };
  });
  const written: { absPath: string; before: string }[] = [];
  // Cross-file plan is one atomic set: register every target as pending so the
  // byte-floor connection gate sees the whole set (rewired paths resolve together).
  registerPendingWrites(entries.map((e) => e.absPath));
  try {
    for (const e of entries) {
      if (e.after === e.before) continue;
      atomicWrite(e.absPath, e.after);
      written.push({ absPath: e.absPath, before: e.before });
    }
  } catch (writeErr) {
    for (const w of written.reverse()) {
      try {
        atomicWrite(w.absPath, w.before);
      } catch {
        /* best-effort rollback */
      }
    }
    throw new Error(
      `cross-file write failed; rolled back ${written.length} file(s): ` +
        (writeErr instanceof Error ? writeErr.message : String(writeErr)),
    );
  } finally {
    clearPendingWrites();
  }
  const traceRefs: string[] = [];
  for (const e of entries) {
    if (e.after === e.before) continue;
    try {
      const zones = computeZones(e.before, e.after);
      const trace = buildTrace({
        file: e.rel,
        repoRoot,
        operator,
        before: e.before,
        newText: e.after,
        inlinePreview: characterDiff(e.before, e.after, e.rel),
        validation: { language: 'ts', before: 0, after: 0 },
        metrics: {
          changedChars: 0,
          lineRewriteSurfaceChars: 0,
          expansionFactorAvoided: 1,
          bytesNet: e.after.length - e.before.length,
        },
        preservedZones: zones.preservedZones,
        modifiedZones: zones.modifiedZones,
        movementZones: [],
      });
      const persisted = writeTrace(trace);
      if (persisted.tracePath) traceRefs.push(persisted.tracePath);
    } catch {
      /* trace is best-effort */
    }
  }
  return traceRefs;
}
