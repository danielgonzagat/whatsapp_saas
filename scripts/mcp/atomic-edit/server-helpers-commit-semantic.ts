import { computeZones } from './engine.js';
import { buildTrace, levelFor, shapePayload } from './trace.js';
import { resolveAllowedRootForAbsolutePath, REPO_ROOT } from './guard.js';
import { previewDiff, characterDiff, type SemanticEditResult } from './advanced.js';
import { atomicWrite, sha256, log, targetDetails } from './server-helpers-io.js';
import { runPostEditVerify } from './server-helpers-verify.js';
import { ok, fail, type ToolOk } from './server-helpers-result.js';

export function commitSemantic(
  relPath: string,
  absPath: string,
  before: string,
  r: SemanticEditResult,
  preview: boolean,
  verify?: 'typecheck' | 'lint',
): ToolOk {
  if (!r.validation.ok) {
    return fail(`rejected: would introduce a syntax error. ${r.validation.introduced ?? ''}`);
  }
  if (r.newText === before) {
    return ok({
      ok: true,
      changed: false,
      note: 'no change',
      file: relPath,
      ...targetDetails(absPath, relPath),
      ...r.detail,
    });
  }
  const semLevel = levelFor(preview);
  const semInline = characterDiff(before, r.newText, relPath);
  const repoRoot = resolveAllowedRootForAbsolutePath(absPath) ?? REPO_ROOT;
  const semZones = computeZones(before, r.newText);
  const semTrace = buildTrace({
    file: relPath,
    repoRoot,
    operator: `semantic:${String((r.detail as Record<string, unknown>).op ?? 'edit')}`,
    before,
    newText: r.newText,
    inlinePreview: semInline,
    validation: {
      language: r.validation.language,
      before: r.validation.before,
      after: r.validation.after,
    },
    preservedZones: semZones.preservedZones,
    modifiedZones: semZones.modifiedZones,
    movementZones: semZones.movementZones,
    preview,
    changed: !preview,
  });
  if (preview) {
    return ok(
      shapePayload(
        semLevel,
        {
          ok: true,
          preview: true,
          changed: false,
          file: relPath,
          ...targetDetails(absPath, relPath),
          ...r.detail,
        },
        {
          inlinePreview: semInline,
          legacyDiff: previewDiff(before, r.newText, relPath),
          trace: semTrace,
        },
      ),
    );
  }
  atomicWrite(absPath, r.newText);
  log(`semantic edit ${JSON.stringify(r.detail)} in ${relPath}`);
  const verifyResult = verify
    ? runPostEditVerify(relPath, absPath, repoRoot, verify)
    : null;
  return ok(
    shapePayload(
      semLevel,
      {
        ok: true,
        changed: true,
        file: relPath,
        ...targetDetails(absPath, relPath),
        afterSha256: sha256(r.newText),
        ...(verifyResult ? { verify: verifyResult } : {}),
        ...r.detail,
      },
      {
        inlinePreview: semInline,
        legacyDiff: previewDiff(before, r.newText, relPath),
        trace: semTrace,
      },
    ),
  );
}
