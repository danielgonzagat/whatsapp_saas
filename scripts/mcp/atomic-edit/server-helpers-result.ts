import * as fs from 'node:fs';
import { computeZones, type ValidationResult, type ApplyResult } from './engine.js';
import { resolveAllowedRootForAbsolutePath, REPO_ROOT } from './guard.js';
import { buildTrace, levelFor, shapePayload, writeTrace } from './trace.js';
import { atomicWrite, sha256, log, targetDetails } from './server-helpers-io.js';
import { characterDiff, previewDiff } from './advanced.js';
import { runPostEditVerify } from './server-helpers-verify.js';
import { lockDir, autoLockCleanup, autoLockFile } from './server-helpers-product-locks.js';

export interface ToolOk {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
  /** SDK CallToolResult is an open record; satisfy its index signature. */
  [x: string]: unknown;
}

export function ok(
  payload: Record<string, unknown>,
  options: { includeMachineJson?: boolean } = {},
): ToolOk {
  const summary = payload.summaryForHuman ?? payload.summary;
  const machinePayload =
    typeof summary === 'string' && summary.length > 0
      ? Object.fromEntries(
          Object.entries(payload).filter(([key]) => key !== 'summaryForHuman' && key !== 'summary'),
        )
      : payload;
  const json = { type: 'text' as const, text: JSON.stringify(machinePayload, null, 2) };
  if (typeof summary !== 'string' || summary.length === 0) {
    return { content: [json] };
  }
  if (options.includeMachineJson === false) {
    return { content: [{ type: 'text', text: summary }] };
  }
  return { content: [{ type: 'text', text: summary }, json] };
}

export function fail(message: string): ToolOk {
  log('ERROR', message);
  return {
    content: [{ type: 'text', text: JSON.stringify({ ok: false, error: message }, null, 2) }],
    isError: true,
  };
}

/** Persist only if validation did not regress; report metrics. When
 * `preview` is set, validate + return the diff but DO NOT write (dry-run —
 * lets the agent verify before committing, killing the blind-edit failure
 * mode the literature flags). */
export function commit(
  relPath: string,
  absPath: string,
  before: string,
  result: ApplyResult,
  extra: Record<string, unknown> = {},
  preview = false,
  verify?: 'typecheck' | 'lint',
  lock?: boolean,
): ToolOk {
  const v: ValidationResult = result.validation;
  if (!v.ok) {
    return fail(
      `rejected: edit would introduce a ${v.language} syntax error ` +
        `(${v.before} -> ${v.after}). ${v.introduced ?? ''} — file NOT modified.`,
    );
  }
  if (result.newText === before) {
    return ok({
      ok: true,
      changed: false,
      note: 'edit produced identical content; file untouched',
      file: relPath,
      ...targetDetails(absPath, relPath),
    });
  }
  const level = levelFor(preview);
  const operator = String(
    (extra as Record<string, unknown>).op ??
      (extra as Record<string, unknown>).operator ??
      'atomic_edit',
  );
  const inlinePreview = characterDiff(before, result.newText, relPath);
  const repoRoot = resolveAllowedRootForAbsolutePath(absPath) ?? REPO_ROOT;
  const editZones = computeZones(before, result.newText);
  const trace = buildTrace({
    file: relPath,
    repoRoot,
    operator,
    before,
    newText: result.newText,
    inlinePreview,
    validation: { language: v.language, before: v.before, after: v.after },
    metrics: {
      changedChars: result.changedChars,
      lineRewriteSurfaceChars: result.lineSurfaceChars,
      expansionFactorAvoided: result.expansionFactor,
    },
    preservedZones: editZones.preservedZones,
    modifiedZones: editZones.modifiedZones,
    movementZones: editZones.movementZones,
    preview,
    changed: !preview,
  });
  if (preview) {
    return ok(
      shapePayload(
        level,
        {
          ok: true,
          preview: true,
          changed: false,
          note: 'dry-run: validated, NOT written',
          file: relPath,
          ...targetDetails(absPath, relPath),
          validation: {
            language: v.language,
            syntaxErrorsBefore: v.before,
            syntaxErrorsAfter: v.after,
          },
          intentionChars: result.changedChars,
          expansionFactorAvoided: result.expansionFactor,
          ...extra,
        },
        { inlinePreview, legacyDiff: previewDiff(before, result.newText, relPath), trace },
      ),
    );
  }

  let commitLockId: string | null = null;
  if (lock) {
    autoLockCleanup(relPath);
    commitLockId = autoLockFile(relPath);
  }

  try {
    // A/B loop R6 finding: whole-file create/overwrite echoed the ENTIRE file
    // back as a char-diff (before='' ⇒ diff == whole file) inside summaryForHuman
    // AND again as `atomicDiff` — i.e. the content the model just supplied,
    // returned to it twice, the dominant token sink (1.58M vs 0.95M). For these
    // ops return a COMPACT confirmation; full char-proof is persisted to the
    // trace file (path returned). Sub-line in-place edits keep the inline proof.
    if (before === '' || operator === 'atomic_create_file') {
      atomicWrite(absPath, result.newText);
      const persisted = writeTrace(trace);
      const lines = result.newText.split('\n').length;
      log(`created ${relPath} (${lines} lines)`);
      const verifyResult = verify
        ? runPostEditVerify(relPath, absPath, repoRoot, verify)
        : null;
      return ok({
        ok: true,
        changed: true,
        created: before === '',
        file: relPath,
        ...targetDetails(absPath, relPath),
        lines,
        bytesNet: result.newText.length - before.length,
        afterSha256: sha256(result.newText),
        validation: {
          language: v.language,
          syntaxErrorsBefore: v.before,
          syntaxErrorsAfter: v.after,
        },
        ...(verifyResult ? { verify: verifyResult } : {}),
        summaryForHuman:
          `✅ ${before === '' ? 'Created' : 'Replaced'} ${relPath} ` +
          `(${lines} lines, syntax ${v.after <= v.before ? 'ok' : 'REGRESSED'}). ` +
          `Content was supplied by you; char-level proof persisted to the trace ` +
          `file (not echoed back, to save context).`,
        operation: trace.operation,
        operationId: trace.operationId,
        founder: trace.audit,
        ...persisted,
        ...extra,
      });
    }
    atomicWrite(absPath, result.newText);
    log(`wrote ${relPath} (+${result.newText.length - before.length} bytes net)`);
    const verifyResult = verify
      ? runPostEditVerify(relPath, absPath, repoRoot, verify)
      : null;
    return ok(
      shapePayload(
        level,
        {
          ok: true,
          changed: true,
          file: relPath,
          ...targetDetails(absPath, relPath),
          validation: {
            language: v.language,
            syntaxErrorsBefore: v.before,
            syntaxErrorsAfter: v.after,
          },
          intentionChars: result.changedChars,
          lineRewriteSurfaceChars: result.lineSurfaceChars,
          expansionFactorAvoided: result.expansionFactor,
          bytesNet: result.newText.length - before.length,
          afterSha256: sha256(result.newText),
          ...(verifyResult ? { verify: verifyResult } : {}),
          ...extra,
        },
        { inlinePreview, legacyDiff: previewDiff(before, result.newText, relPath), trace },
      ),
    );
  } finally {
    if (commitLockId) {
      try {
        fs.rmdirSync(lockDir(commitLockId), { recursive: true });
      } catch {
        // best-effort cleanup
      }
    }
  }
}
