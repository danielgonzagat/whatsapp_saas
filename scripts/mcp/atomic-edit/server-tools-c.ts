import * as fs from 'node:fs';
import * as path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { computeZones } from './engine.js';
import { resolveAllowedRootForAbsolutePath, resolveSafeTarget, REPO_ROOT } from './guard.js';
import { buildTrace, levelFor, shapePayload } from './trace.js';
import { outline } from './nav.js';
import { editSymbol, previewDiff, characterDiff, type SymbolOp } from './advanced.js';
import { guardSha, log, atomicWrite, readUtf8, normalizeRepoRelPath, targetDetails } from './server-helpers-io.js';
import { runPostEditVerify } from './server-helpers-verify.js';
import { ok, fail } from './server-helpers-result.js';
import { globFindFiles } from './server-helpers-glob.js';
import { autoLockFile, lockDir } from './server-helpers-product-locks.js';
import * as crypto from 'node:crypto';

export function registerToolsC(server: McpServer): void {
server.registerTool(
  'code_outline_batch',
  {
    title: 'File signature map for multiple files (batch)',
    description:
      'Returns outline (signature map, no bodies) for every file matching a glob pattern. ' +
      'Max 20 files to prevent overload. Use glob patterns like "backend/src/**/*.service.ts".',
    inputSchema: {
      glob: z.string().describe('glob pattern relative to cwd, e.g. "backend/src/**/*.service.ts"'),
      cwd: z.string().optional().describe('working directory (default ".")'),
    },
  },
  async (a) => {
    try {
      const cwdTarget = resolveSafeTarget(a.cwd ?? '.');
      const absCwd = cwdTarget.absPath;
      const absFiles = globFindFiles(absCwd, a.glob);
      const limit = 20;
      const sliced = absFiles.slice(0, limit);
      const files = [];
      for (const absFile of sliced) {
        let relPath: string;
        try {
          relPath = resolveSafeTarget(absFile).relPath;
        } catch {
          continue;
        }
        const text = readUtf8(absFile);
        const o = await outline(relPath, text);
        files.push({
          file: relPath,
          sha256: crypto.createHash('sha256').update(text).digest('hex'),
          symbols: o.symbols,
        });
      }
      return ok({
        ok: true,
        glob: a.glob,
        cwd: a.cwd ?? '.',
        matchedTotal: absFiles.length,
        returned: files.length,
        truncated: absFiles.length > limit,
        files,
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

// ───────────────────────── read-only metadata (never contents) ─────────────

server.registerTool(
  'code_file_stat',
  {
    title: 'Stat a file or directory (metadata only, never contents)',
    description:
      'Returns file/directory metadata WITHOUT EVER returning file contents. ' +
      'Returns ok:true changed:false with target metadata. ' +
      'For files: kind=file, bytes, sha256, mtimeMs. ' +
      'For directories: kind=directory (no sha256, no bytes). ' +
      'For missing paths: kind=missing (non-throwing). ' +
      'Governance-protected paths are marked protected:true with no content/sha256/bytes.',
    inputSchema: {
      file: z.string().describe('repo-relative or absolute path to stat'),
    },
  },
  async (a) => {
    try {
      let absPath: string;
      let relPath: string;

      try {
        const resolved = resolveSafeTarget(a.file);
        absPath = resolved.absPath;
        relPath = resolved.relPath;
      } catch (resolveError) {
        const message = resolveError instanceof Error ? resolveError.message : String(resolveError);
        if (/governance-protected/.test(message)) {
          const protectedAbsPath = path.isAbsolute(a.file)
            ? path.resolve(a.file)
            : path.resolve(REPO_ROOT, a.file);
          const protectedRepoRoot =
            resolveAllowedRootForAbsolutePath(protectedAbsPath) ?? REPO_ROOT;
          const protectedRelPath = normalizeRepoRelPath(
            path.relative(protectedRepoRoot, protectedAbsPath),
          );
          const protectedExists = fs.existsSync(protectedAbsPath);
          const protectedKind = protectedExists
            ? fs.statSync(protectedAbsPath).isDirectory()
              ? 'directory'
              : 'file'
            : 'missing';
          return ok({
            ok: true,
            changed: false,
            file: protectedRelPath,
            exists: protectedExists,
            kind: protectedKind,
            protected: true,
            note: 'Governance-protected: metadata only, no content/bytes/sha256 exposed.',
            target: {
              repoRoot: protectedRepoRoot,
              file: protectedRelPath,
              absPath: protectedAbsPath,
            },
          });
        }
        throw resolveError;
      }

      if (!fs.existsSync(absPath)) {
        return ok({
          ok: true,
          changed: false,
          file: relPath,
          exists: false,
          kind: 'missing',
          ...targetDetails(absPath, relPath),
        });
      }

      const stat = fs.statSync(absPath);
      if (stat.isDirectory()) {
        return ok({
          ok: true,
          changed: false,
          file: relPath,
          exists: true,
          kind: 'directory',
          mtimeMs: stat.mtimeMs,
          ...targetDetails(absPath, relPath),
        });
      }

      if (!stat.isFile()) {
        return fail(`refused: ${relPath} is not a regular file or directory`);
      }

      const fileBytes = fs.readFileSync(absPath);
      return ok({
        ok: true,
        changed: false,
        file: relPath,
        exists: true,
        kind: 'file',
        bytes: stat.size,
        sha256: crypto.createHash('sha256').update(fileBytes).digest('hex'),
        mtimeMs: stat.mtimeMs,
        ...targetDetails(absPath, relPath),
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

// ───────────────────────── v2: symbol-named edits + cross-file rename ──────

server.registerTool(
  'atomic_edit_symbol',
  {
    title: 'Replace / insert-after / remove a named AST entity',
    description:
      "CodeStruct editCode: structurally edit a symbol by selector — op='replace' (swap its whole " +
      "definition), 'insert_after' (add a sibling after it), 'remove' (delete it). Indentation preserved, " +
      'syntax revalidated, atomic write. The block-level operator the literature shows beats fragile ' +
      'offsets for function/class changes. Supports preview (dry-run).',
    inputSchema: {
      file: z.string(),
      selector: z.string(),
      op: z.enum(['replace', 'insert_after', 'remove']),
      code: z.string().optional().describe('required for replace / insert_after; omit for remove'),
      expectedSha256: z
        .string()
        .optional()
        .describe("optimistic-concurrency guard: refuse if the file's sha256 differs"),
      preview: z.boolean().optional().describe('dry-run: validate + return diff, do not write'),
      verify: z.enum(['typecheck', 'lint']).optional(),
      lock: z.boolean().optional(),
    },
  },
  async (a) => {
    try {
      const { absPath, relPath, repoRoot } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      guardSha(before, a.expectedSha256);
      const r = await editSymbol(relPath, before, a.selector, a.op as SymbolOp, a.code);
      if (!r.validation.ok) {
        return fail(
          `rejected: ${a.op} on ${r.selector} would introduce a syntax error. ${r.validation.introduced ?? ''}`,
        );
      }
      if (r.newText === before)
        return ok({ ok: true, changed: false, note: 'no change', file: relPath });
      const symLevel = levelFor(a.preview ?? false);
      const symInline = characterDiff(before, r.newText, relPath);
      const symZones = computeZones(before, r.newText);
      const symTrace = buildTrace({
        file: relPath,
        repoRoot,
        operator: `edit_symbol:${r.op}`,
        before,
        newText: r.newText,
        inlinePreview: symInline,
        validation: {
          language: r.validation.language,
          before: r.validation.before,
          after: r.validation.after,
        },
        preservedZones: symZones.preservedZones,
        modifiedZones: symZones.modifiedZones,
        movementZones: symZones.movementZones,
        preview: a.preview ?? false,
        changed: !(a.preview ?? false),
      });
      if (a.preview ?? false) {
        return ok(
          shapePayload(
            symLevel,
            {
              ok: true,
              preview: true,
              changed: false,
              file: relPath,
              selector: r.selector,
              op: r.op,
            },
            {
              inlinePreview: symInline,
              legacyDiff: previewDiff(before, r.newText, relPath),
              trace: symTrace,
            },
          ),
        );
      }
      let symLockId: string | null = null;
      if (a.lock) symLockId = autoLockFile(relPath);
      try {
        atomicWrite(absPath, r.newText);
        log(`edit_symbol ${a.op} ${r.selector} in ${relPath}`);
        const verifyResult = a.verify
          ? runPostEditVerify(relPath, absPath, repoRoot, a.verify)
          : null;
        return ok(
          shapePayload(
            symLevel,
            { ok: true, changed: true, file: relPath, selector: r.selector, op: r.op, ...(verifyResult ? { verify: verifyResult } : {}) },
            {
              inlinePreview: symInline,
              legacyDiff: previewDiff(before, r.newText, relPath),
              trace: symTrace,
            },
          ),
        );
      } finally {
        if (symLockId) {
          try { fs.rmdirSync(lockDir(symLockId), { recursive: true }); } catch { /* cleanup */ }
        }
      }
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

}
