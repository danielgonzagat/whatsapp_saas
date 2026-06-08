import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { applyEdits, renameSymbol, replaceLiteral, type TextEditSpec, computeZones } from './engine.js';
import { extractImportSpecifiers } from './connection-gate.js';
import { resolveSafeTarget } from './guard.js';
import { buildTrace, levelFor, shapePayload, writeTrace } from './trace.js';
import { browse, outline, readSymbol } from './nav.js';
import { previewDiff, characterDiff } from './advanced.js';
import { sha256, guardSha, log, readUtf8, targetDetails } from './server-helpers-io.js';
import { requireNegativeActionProof, requireNegativeProofForRemovedBytes } from './server-helpers-negative-proof.js';
import { ok, fail, commit, writeWithTrace } from './server-helpers-result.js';

const DELETE_REVERSE_SOURCE_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const DELETE_REVERSE_SKIP_DIRS = new Set([
  '.git',
  '.atomic',
  '.claude',
  '.mcp-cache',
  '.next',
  '.turbo',
  '.cache',
  'build',
  'coverage',
  'dist',
  'node_modules',
]);

function deleteCandidateTargets(baseAbs: string): string[] {
  const candidates = [
    baseAbs,
    `${baseAbs}.ts`,
    `${baseAbs}.tsx`,
    `${baseAbs}.js`,
    `${baseAbs}.jsx`,
    `${baseAbs}.mjs`,
    `${baseAbs}.cjs`,
    `${baseAbs}.json`,
    path.join(baseAbs, 'index.ts'),
    path.join(baseAbs, 'index.tsx'),
    path.join(baseAbs, 'index.js'),
  ];
  if (baseAbs.endsWith('.js')) {
    candidates.push(`${baseAbs.slice(0, -3)}.ts`, `${baseAbs.slice(0, -3)}.tsx`);
  }
  return candidates;
}

function relativeImportTargetsDeletedFile(fromAbs: string, spec: string, deletedAbs: string): boolean {
  if (!spec.startsWith('.')) return false;
  const baseAbs = path.resolve(path.dirname(fromAbs), spec);
  return deleteCandidateTargets(baseAbs).some((cand) => path.resolve(cand) === deletedAbs);
}

function collectDeleteReverseSourceFiles(absDir: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (DELETE_REVERSE_SKIP_DIRS.has(entry.name)) continue;
    const abs = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      collectDeleteReverseSourceFiles(abs, out);
    } else if (entry.isFile() && DELETE_REVERSE_SOURCE_RE.test(abs)) {
      out.push(abs);
    }
  }
}

function findDeleteReverseImportDependents(
  repoRoot: string,
  deletedAbs: string,
): { file: string; spec: string }[] {
  const target = path.resolve(deletedAbs);
  const files: string[] = [];
  collectDeleteReverseSourceFiles(repoRoot, files);
  const dependents: { file: string; spec: string }[] = [];
  for (const abs of files) {
    if (path.resolve(abs) === target) continue;
    let content: string;
    try {
      content = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    for (const spec of extractImportSpecifiers(content)) {
      if (relativeImportTargetsDeletedFile(abs, spec, target)) {
        dependents.push({ file: path.relative(repoRoot, abs).replaceAll('\\', '/'), spec });
      }
    }
  }
  return dependents;
}

const GENERATED_TREE_SEGMENTS = new Set([
  '.cache',
  '.next',
  '.turbo',
  'build',
  'chrome-home',
  'chrome-tmp',
  'coverage',
  'dist',
  'node-compile-cache',
  'playwright-report',
  'temp',
  'test-results',
  'tmp',
]);

function looksLikeGeneratedTree(relPath: string): boolean {
  return relPath
    .split(/[\\/]+/)
    .filter(Boolean)
    .some((part) => GENERATED_TREE_SEGMENTS.has(part) || part.endsWith('-cache') || part.endsWith('-tmp'));
}

function gitTrackedFilesUnder(repoRoot: string, relPath: string): string[] {
  try {
    const output = childProcess.execFileSync('git', ['ls-files', '--', relPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    throw new Error('could not verify tracked files with git ls-files; refusing generated tree delete');
  }
}

function collectGeneratedTreeStats(absDir: string, maxFiles: number): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  const visit = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const stat = fs.lstatSync(abs);
      if (entry.isDirectory()) {
        visit(abs);
      } else {
        files += 1;
        bytes += stat.size;
        if (files > maxFiles) {
          throw new Error(`refused: generated tree has more than maxFiles=${maxFiles} files`);
        }
      }
    }
  };
  visit(absDir);
  return { files, bytes };
}

const pos = z.object({
  line: z.number().int().min(1).describe('1-based line'),
  column: z.number().int().min(1).describe('1-based column (UTF-16 units within the line)'),
});

export function registerToolsB(server: McpServer): void {
server.registerTool(
  'atomic_delete_file',
  {
    title: 'Delete a file — governed, atomic, traced',
    description:
      'Delete a file through the same governance guard as every atomic op: repo-containment, ' +
      'protected-file refusal, and trace persistence. Refuses directories. Idempotent for ' +
      'missing files (returns changed:false without throwing). Preview returns what would be ' +
      'removed without deleting. Supports preview?: boolean, expectedSha256?: string, and proofOfIncorrectness?: string for non-preview deletion.',
    inputSchema: {
      file: z.string().describe('repo-relative path of the file to delete'),
      expectedSha256: z
        .string()
        .optional()
        .describe("optimistic-concurrency guard: refuse if the file's sha256 differs"),
      preview: z.boolean().optional().describe('dry-run: validate + return diff, do not delete'),
      proofOfIncorrectness: z
        .string()
        .optional()
        .describe('required for non-preview deletion: proof that the removed bytes are non-correct/negative'),
    },
  },
  async (a) => {
    try {
      const { absPath, relPath, repoRoot } = resolveSafeTarget(a.file);
      if (!fs.existsSync(absPath)) {
        return ok({
          ok: true,
          changed: false,
          note: `file already absent: ${relPath}`,
          file: relPath,
          ...targetDetails(absPath, relPath),
          exists: false,
        });
      }

      const st = fs.statSync(absPath);
      if (st.isDirectory()) {
        return fail(`refused: ${relPath} is a directory, not a file.`);
      }

      const before = readUtf8(absPath);
      guardSha(before, a.expectedSha256);
      const reverseDependents = findDeleteReverseImportDependents(repoRoot, absPath);
      if (reverseDependents.length > 0) {
        const sample = reverseDependents
          .slice(0, 5)
          .map((d) => `${d.file} imports ${d.spec}`)
          .join('; ');
        return fail(
          `refused: ${relPath} is still imported by ${reverseDependents.length} dependent file(s): ${sample}. ` +
            'Remove or rewrite those reverse imports in the same atomic transaction before deleting this file.',
        );
      }
      const preview = a.preview ?? false;
      const beforeByteLength = Buffer.byteLength(before, 'utf8');
      const negativeActionProof = preview
        ? undefined
        : requireNegativeActionProof({
            action: 'atomic_delete_file',
            target: relPath,
            targetUnit: 'file',
            removedByteCount: beforeByteLength,
            proofOfIncorrectness: a.proofOfIncorrectness,
          });
      const inlinePreview = characterDiff(before, '', relPath);
      const delZones = computeZones(before, '');
      const trace = buildTrace({
        file: relPath,
        repoRoot,
        operator: 'atomic_delete_file',
        before,
        newText: '',
        inlinePreview,
        validation: { language: 'generic', before: 0, after: 0 },
        metrics: {
          changedChars: before.length,
          lineRewriteSurfaceChars: before.length,
          expansionFactorAvoided: 1,
          bytesNet: -beforeByteLength,
        },
        preservedZones: delZones.preservedZones,
        modifiedZones: delZones.modifiedZones,
        movementZones: delZones.movementZones,
        targetUnit: 'file',
        intention: `delete ${relPath} (${beforeByteLength} bytes)`,
        semanticImpact: preview ? 'preview_file_deletion' : 'file_deleted',
        negativeActionProof,
        preview,
        changed: !preview,
      });

      if (preview) {
        return ok(
          shapePayload(
            levelFor(true),
            {
              ok: true,
              preview: true,
              changed: false,
              file: relPath,
              ...targetDetails(absPath, relPath),
              note: 'dry-run: file NOT deleted',
              bytesWouldFree: beforeByteLength,
              afterSha256: sha256(before),
            },
            { inlinePreview, legacyDiff: previewDiff(before, '', relPath), trace },
          ),
        );
      }

      fs.unlinkSync(absPath);
      const persisted = writeTrace(trace);
      log(`deleted ${relPath} (${beforeByteLength} bytes)`);
      return ok({
        ok: true,
        changed: true,
        deleted: true,
        file: relPath,
        ...targetDetails(absPath, relPath),
        bytesDeleted: beforeByteLength,
        afterSha256: sha256(''),
        validation: {
          language: 'generic',
          syntaxErrorsBefore: 0,
          syntaxErrorsAfter: 0,
        },
        summaryForHuman:
          `✅ Deleted ${relPath} ` +
          `(${beforeByteLength} bytes freed). ` +
          `Full proof persisted to trace file (not echoed back, to save context).`,
        operation: trace.operation,
        operationId: trace.operationId,
        founder: trace.audit,
        negativeActionProof,
        ...persisted,
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_delete_generated_tree',
  {
    title: 'Delete a generated directory tree — governed, traced',
    description:
      'Delete a generated/untracked directory tree such as cache, tmp, build, coverage, node-compile-cache, ' +
      'chrome-tmp, or chrome-home. Refuses repo root, non-generated path names, and any tree containing git-tracked files. ' +
      'Requires proofOfIncorrectness for non-preview deletion and records a metadata trace.',
    inputSchema: {
      dir: z.string().describe('repo-relative generated directory path to delete'),
      maxFiles: z.number().int().min(1).max(10000).optional().describe('safety cap; default 2000 files'),
      preview: z.boolean().optional().describe('dry-run: validate + return metadata, do not delete'),
      proofOfIncorrectness: z
        .string()
        .optional()
        .describe('required for non-preview deletion: proof that the generated tree is removable negative residue'),
    },
  },
  async (a) => {
    try {
      const { absPath, relPath, repoRoot } = resolveSafeTarget(a.dir);
      if (!fs.existsSync(absPath)) {
        return ok({
          ok: true,
          changed: false,
          note: `directory already absent: ${relPath}`,
          dir: relPath,
          exists: false,
        });
      }
      const stat = fs.statSync(absPath);
      if (!stat.isDirectory()) {
        return fail(`refused: ${relPath} is not a directory.`);
      }
      if (!relPath || relPath === '.' || path.resolve(absPath) === path.resolve(repoRoot)) {
        return fail('refused: generated tree delete cannot target the repository root.');
      }
      if (!looksLikeGeneratedTree(relPath)) {
        return fail(`refused: ${relPath} does not look like a generated/cache/tmp tree.`);
      }
      const tracked = gitTrackedFilesUnder(repoRoot, relPath);
      if (tracked.length > 0) {
        return fail(
          `refused: ${relPath} contains ${tracked.length} git-tracked file(s), e.g. ${tracked.slice(0, 5).join(', ')}`,
        );
      }
      const maxFiles = a.maxFiles ?? 2000;
      const stats = collectGeneratedTreeStats(absPath, maxFiles);
      const preview = a.preview ?? false;
      const before = `generated tree: ${relPath}\nfiles: ${stats.files}\nbytes: ${stats.bytes}\n`;
      const negativeActionProof = preview
        ? undefined
        : requireNegativeActionProof({
            action: 'atomic_delete_generated_tree',
            target: relPath,
            targetUnit: 'directory',
            removedByteCount: stats.bytes,
            proofOfIncorrectness: a.proofOfIncorrectness,
          });
      const inlinePreview = characterDiff(before, '', relPath);
      const zones = computeZones(before, '');
      const trace = buildTrace({
        file: relPath,
        repoRoot,
        operator: 'atomic_delete_generated_tree',
        before,
        newText: '',
        inlinePreview,
        validation: { language: 'generic', before: 0, after: 0 },
        metrics: {
          changedChars: before.length,
          lineRewriteSurfaceChars: before.length,
          expansionFactorAvoided: 1,
          bytesNet: -stats.bytes,
        },
        preservedZones: zones.preservedZones,
        modifiedZones: zones.modifiedZones,
        movementZones: zones.movementZones,
        targetUnit: 'directory',
        intention: `delete generated tree ${relPath} (${stats.files} files, ${stats.bytes} bytes)`,
        semanticImpact: preview ? 'preview_generated_tree_deletion' : 'generated_tree_deleted',
        negativeActionProof,
        preview,
        changed: !preview,
      });
      if (preview) {
        return ok(
          shapePayload(
            levelFor(true),
            {
              ok: true,
              preview: true,
              changed: false,
              dir: relPath,
              filesWouldDelete: stats.files,
              bytesWouldFree: stats.bytes,
              note: 'dry-run: directory tree NOT deleted',
            },
            { inlinePreview, legacyDiff: previewDiff(before, '', relPath), trace },
          ),
        );
      }
      fs.rmSync(absPath, { recursive: true, force: true });
      const persisted = writeTrace(trace);
      log(`deleted generated tree ${relPath} (${stats.files} files, ${stats.bytes} bytes)`);
      return ok({
        ok: true,
        changed: true,
        deleted: true,
        dir: relPath,
        filesDeleted: stats.files,
        bytesDeleted: stats.bytes,
        operation: trace.operation,
        operationId: trace.operationId,
        founder: trace.audit,
        negativeActionProof,
        ...persisted,
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_apply_edits',
  {
    title: 'Apply a batch of non-overlapping edits atomically',
    description:
      'LSP TextEdit[] semantics: all edits validated together, applied all-or-nothing, single atomic write. ' +
      'Use for multi-site changes that are ONE intention (e.g. several literals in one config) so they ' +
      'land as one reviewable, conflict-minimal mutation.',
    inputSchema: {
      file: z.string(),
      edits: z
        .array(
          z.object({
            start: pos,
            end: pos,
            newText: z.string(),
          }),
        )
        .min(1),
      preview: z.boolean().optional().describe('dry-run: validate + return diff, do not write'),
      proofOfIncorrectness: z
        .string()
        .optional()
        .describe('required when any edit removes bytes: proof that removed bytes are non-correct/negative'),
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      const r = applyEdits(relPath, before, a.edits as TextEditSpec[]);
      const negativeActionProof = requireNegativeProofForRemovedBytes({
        action: 'atomic_apply_edits',
        target: relPath,
        targetUnit: 'edits',
        before,
        after: r.newText,
        proofOfIncorrectness: a.proofOfIncorrectness,
        preview: a.preview ?? false,
      });
      return commit(
        relPath,
        absPath,
        before,
        r,
        { editCount: a.edits.length, op: 'atomic_apply_edits', ...(negativeActionProof ? { negativeActionProof } : {}) },
        a.preview ?? false,
      );
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_rename_symbol',
  {
    title: 'Scope-correct rename (single file)',
    description:
      'Rename the identifier at (line,column) and all its scope-correct references within the same file, ' +
      'respecting binding/shadowing (ts-morph). One intention instead of N text rewrites. ' +
      'Cross-file rename is intentionally out of scope v1.',
    inputSchema: {
      file: z.string(),
      line: z.number().int().min(1),
      column: z.number().int().min(1),
      newName: z.string().min(1),
      proofOfIncorrectness: z
        .string()
        .optional()
        .describe('required when rename removes bytes: proof that removed bytes are non-correct/negative'),
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      const r = await renameSymbol(relPath, before, { line: a.line, column: a.column }, a.newName);
      if (!r.validation.ok) {
        return fail(
          `rejected: rename would introduce a syntax error. ${r.validation.introduced ?? ''}`,
        );
      }
      if (r.newText === before)
        return ok({ ok: true, changed: false, note: 'no change', file: relPath });
      const negativeActionProof = requireNegativeProofForRemovedBytes({
        action: 'atomic_rename_symbol',
        target: `${relPath}:${r.symbol}->${a.newName}`,
        targetUnit: 'symbol',
        before,
        after: r.newText,
        proofOfIncorrectness: a.proofOfIncorrectness,
      });
      writeWithTrace(relPath, absPath, before, r.newText, 'atomic_rename_symbol', r.validation, negativeActionProof);
      log(`renamed ${r.symbol} in ${relPath} (${r.occurrences} refs)`);
      return ok({
        ok: true,
        changed: true,
        file: relPath,
        symbol: r.symbol,
        references: r.occurrences,
        ...(negativeActionProof ? { negativeActionProof } : {}),
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_replace_literal',
  {
    title: 'Replace a literal by value (AST-targeted)',
    description:
      'Replace a string/numeric/boolean/null literal whose source text equals currentText with newText, ' +
      "selected via the AST (not text matching). The thesis worked example: \"'5511999999999'\" -> 'null' " +
      'as one intention. Refuses ambiguous matches unless onLine disambiguates to exactly one.',
    inputSchema: {
      file: z.string(),
      currentText: z
        .string()
        .describe('exact source text of the literal, incl. quotes for strings'),
      newText: z
        .string()
        .describe('replacement source text, incl. quotes if it should stay a string'),
      onLine: z.number().int().min(1).optional().describe('constrain to this 1-based line'),
      expectedSha256: z
        .string()
        .optional()
        .describe("optimistic-concurrency guard: refuse if the file's sha256 differs"),
      preview: z.boolean().optional().describe('dry-run: validate + return diff, do not write'),
      proofOfIncorrectness: z
        .string()
        .optional()
        .describe('required when replacement removes bytes: proof that removed bytes are non-correct/negative'),
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      guardSha(before, a.expectedSha256);
      const r = await replaceLiteral(relPath, before, a.currentText, a.newText, a.onLine);
      const matched = r.matched[0];
      const applied = applyEdits(relPath, before, [
        {
          start: { line: matched.line, column: matched.column },
          end: { line: matched.line, column: matched.column + matched.old.length },
          newText: a.newText,
        },
      ]);
      if (applied.newText !== r.newText) {
        return fail('literal replacement span mismatch — file NOT modified.');
      }
      const negativeActionProof = requireNegativeProofForRemovedBytes({
        action: 'atomic_replace_literal',
        target: relPath,
        targetUnit: 'literal',
        before,
        after: applied.newText,
        proofOfIncorrectness: a.proofOfIncorrectness,
        preview: a.preview ?? false,
      });
      return commit(
        relPath,
        absPath,
        before,
        applied,
        {
          matched: r.matched,
          op: 'replace_literal',
          ...(negativeActionProof ? { negativeActionProof } : {}),
        },
        a.preview ?? false,
      );
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

// ───────────────────────── v2: read-side (the dominant accuracy lever) ─────

server.registerTool(
  'code_browse',
  {
    title: 'List a directory (structured)',
    description:
      'Repo-relative directory listing (dirs first, node_modules/.git hidden). Read-side step 1: ' +
      'locate the file before reading its structure. Relative paths target the MCP server root; ' +
      'workers in linked worktrees should pass absolute paths from `pwd` to avoid editing the coordinator checkout.',
    inputSchema: {
      dir: z
        .string()
        .describe(
          "repo-relative to the MCP server root, or absolute worktree directory; '.' is server root",
        ),
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.dir || '.');
      return ok({
        ok: true,
        dir: relPath || '.',
        ...targetDetails(absPath, relPath),
        entries: browse(absPath),
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'code_outline',
  {
    title: 'File signature map (no bodies)',
    description:
      'Token-cheap structural summary: every named function/class/method/interface/type/var with its ' +
      "selector and line range — NO bodies. CodeStruct's readCode summarization mode; the highest-leverage " +
      'read primitive. Use before editing so you address symbols by name, not by guessed line numbers. ' +
      'Relative paths target the MCP server root; workers in linked worktrees should pass absolute file paths from `pwd`.',
    inputSchema: {
      file: z
        .string()
        .describe(
          'repo-relative to the MCP server root, or absolute file path inside a registered worktree',
        ),
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const o = await outline(relPath, readUtf8(absPath));
      return ok({ ok: true, file: relPath, ...targetDetails(absPath, relPath), ...o });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'code_read_symbol',
  {
    title: 'Read one symbol by scoped selector',
    description:
      "Return the complete syntactic unit for a selector (e.g. 'UserService.load', 'Foo::bar', 'helper') " +
      'plus its exact start/end line+column — chain straight into an atomic edit without re-deriving ' +
      'positions. Refuses ambiguous selectors with the candidate list. Relative paths target the MCP server root; ' +
      'workers in linked worktrees should pass absolute file paths from `pwd`.',
    inputSchema: {
      file: z
        .string()
        .describe(
          'repo-relative to the MCP server root, or absolute file path inside a registered worktree',
        ),
      selector: z.string().describe("unscoped 'name' or scoped 'Class.method' / 'A.B.c'"),
      line: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('1-based line: if provided with column, resolve by position instead of selector'),
      column: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('1-based column: if provided with line, resolve by position instead of selector'),
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const position =
        a.line !== undefined && a.column !== undefined
          ? { line: a.line, column: a.column }
          : undefined;
      const r = await readSymbol(relPath, readUtf8(absPath), a.selector, position);
      return ok({ ok: true, file: relPath, ...targetDetails(absPath, relPath), ...r });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

}
