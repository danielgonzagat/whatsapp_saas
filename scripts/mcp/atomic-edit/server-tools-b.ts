import * as fs from 'node:fs';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { applyEdits, renameSymbol, replaceLiteral, type TextEditSpec, computeZones } from './engine.js';
import { resolveSafeTarget } from './guard.js';
import { buildTrace, levelFor, shapePayload, writeTrace } from './trace.js';
import { browse, outline, readSymbol } from './nav.js';
import { previewDiff, characterDiff } from './advanced.js';
import { sha256, guardSha, log, atomicWrite, readUtf8, targetDetails } from './server-helpers-io.js';
import { ok, fail, commit } from './server-helpers-result.js';

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
      'removed without deleting. Supports preview?: boolean and expectedSha256?: string.',
    inputSchema: {
      file: z.string().describe('repo-relative path of the file to delete'),
      expectedSha256: z
        .string()
        .optional()
        .describe("optimistic-concurrency guard: refuse if the file's sha256 differs"),
      preview: z.boolean().optional().describe('dry-run: validate + return diff, do not delete'),
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
      const preview = a.preview ?? false;
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
          bytesNet: -before.length,
        },
        preservedZones: delZones.preservedZones,
        modifiedZones: delZones.modifiedZones,
        movementZones: delZones.movementZones,
        targetUnit: 'file',
        intention: `delete ${relPath} (${before.length} bytes)`,
        semanticImpact: preview ? 'preview_file_deletion' : 'file_deleted',
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
              bytesWouldFree: before.length,
              afterSha256: sha256(before),
            },
            { inlinePreview, legacyDiff: previewDiff(before, '', relPath), trace },
          ),
        );
      }

      fs.unlinkSync(absPath);
      const persisted = writeTrace(trace);
      log(`deleted ${relPath} (${before.length} bytes)`);
      return ok({
        ok: true,
        changed: true,
        deleted: true,
        file: relPath,
        ...targetDetails(absPath, relPath),
        bytesDeleted: before.length,
        afterSha256: sha256(''),
        validation: {
          language: 'generic',
          syntaxErrorsBefore: 0,
          syntaxErrorsAfter: 0,
        },
        summaryForHuman:
          `✅ Deleted ${relPath} ` +
          `(${before.length} bytes freed). ` +
          `Full proof persisted to trace file (not echoed back, to save context).`,
        operation: trace.operation,
        operationId: trace.operationId,
        founder: trace.audit,
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
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      const r = applyEdits(relPath, before, a.edits as TextEditSpec[]);
      return commit(relPath, absPath, before, r, { editCount: a.edits.length }, a.preview ?? false);
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
      atomicWrite(absPath, r.newText);
      log(`renamed ${r.symbol} in ${relPath} (${r.occurrences} refs)`);
      return ok({
        ok: true,
        changed: true,
        file: relPath,
        symbol: r.symbol,
        references: r.occurrences,
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
      return commit(
        relPath,
        absPath,
        before,
        applied,
        {
          matched: r.matched,
          op: 'replace_literal',
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
