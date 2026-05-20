import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { applyEdits, replaceText, renameSymbol, replaceLiteral, validate, wrapRange, type WrapKind, type TextEditSpec, type ApplyResult, type ValidationResult, computeZones } from './engine.js';
import { resolveAllowedRootForAbsolutePath, resolveSafeTarget, REPO_ROOT } from './guard.js';
import { buildTrace, levelFor, shapePayload, writeTrace } from './trace.js';
import { browse, outline, readSymbol } from './nav.js';
import { editSymbol, renameSymbolCrossFile, previewDiff, characterDiff, addNamedImport, removeNamedImport, replacePropertyValue, type SymbolOp, type SemanticEditResult, renamePropertyKey, addAwaitToCall } from './advanced.js';
import { sha256, guardSha, log, atomicWrite, readUtf8, normalizeRepoRelPath, normalizeAllowedPath, relPathAllowed, changedSpanMetrics, hasArg, normalizeEslintDryRunArgs, requireEslintDryRunArgs, parseEslintJson, targetDetails, shellPath, nearestPackageRelPath, type EslintDryRunResult } from './server-helpers-io.js';
import { runPostEditVerify, packageVerificationPlan, unusedSymbolFromLintMessage } from './server-helpers-verify.js';
import { buildLintResidueActionCandidates, applyKnownLintResidueFixes } from './server-helpers-lint-fix.js';
import { ok, fail, commit, type ToolOk } from './server-helpers-result.js';
import { commitSemantic } from './server-helpers-commit-semantic.js';
import { replaceCalleeKeepArgs, replaceCallArg, insertCallArg, removeCallArg } from './engine-ops.js';
import { universalReplaceLiteral, universalReplacePropertyValue, universalRenamePropertyKey } from './engine-universal.js';
import { replaceOperator, reorderListItem, changeSignature, replaceBodyKeepSignature, addDecorator, replaceDecorator, moveIntoScope } from './engine-complete.js';


export function registerToolsA(server: McpServer): void {
server.registerTool(
  'atomic_edit',
  {
    title: 'Unified atomic code editing — dispatches to the correct precise operator',
    description:
      'Single entry-point for all atomic editing operations. The `op` parameter selects the operation, ' +
      'and the rest of the params are specific to that operation. Supported ops: ' +
      'replace_text, replace_range, replace_literal, ' +
      'insert_at, delete_range, edit_symbol, ' +
      'add_import, remove_import, rename_symbol, ' +
      'replace_property_value, rename_property_key.',
    inputSchema: {
      op: z.enum([
        'replace_text', 'replace_range', 'replace_literal',
        'insert_at', 'delete_range', 'edit_symbol',
        'add_import', 'remove_import', 'rename_symbol',
        'replace_property_value', 'rename_property_key',
      ]),
      file: z.string(),
      oldText: z.string().optional(),
      newText: z.string().optional(),
      occurrence: z.number().int().min(1).optional(),
      startLine: z.number().int().min(1).optional(),
      startColumn: z.number().int().min(1).optional(),
      endLine: z.number().int().min(1).optional(),
      endColumn: z.number().int().min(1).optional(),
      selector: z.string().optional(),
      symbolOp: z.enum(['replace', 'insert_after', 'remove']).optional(),
      code: z.string().optional(),
      module: z.string().optional(),
      name: z.string().optional(),
      alias: z.string().optional(),
      typeOnly: z.boolean().optional(),
      property: z.string().optional(),
      value: z.string().optional(),
      newKey: z.string().optional(),
      expectedSha256: z.string().optional(),
      preview: z.boolean().optional(),
      verify: z.enum(['typecheck', 'lint']).optional(),
      lock: z.boolean().optional(),
    },
  },
  async (a) => {
    try {
      const { absPath, relPath, repoRoot } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      guardSha(before, a.expectedSha256);

      switch (a.op) {
        case 'replace_text': {
          if (!a.oldText || a.newText === undefined) throw new Error('replace_text requires oldText+newText');
          const r = replaceText(relPath, before, a.oldText, a.newText, a.occurrence);
          return commit(relPath, absPath, before, r, { op: 'atomic_edit:replace_text' }, a.preview ?? false, a.verify, a.lock);
        }
        case 'replace_range': {
          if (!a.startLine || !a.startColumn || !a.endLine || !a.endColumn || a.newText === undefined) throw new Error('replace_range requires coordinates+newText');
          const r = applyEdits(relPath, before, [{ start: { line: a.startLine, column: a.startColumn }, end: { line: a.endLine, column: a.endColumn }, newText: a.newText }]);
          return commit(relPath, absPath, before, r, { op: 'atomic_edit:replace_range' }, a.preview ?? false, a.verify, a.lock);
        }
        case 'replace_literal': {
          if (!a.oldText || a.newText === undefined) throw new Error('replace_literal requires oldText+newText');
          const r = await replaceLiteral(relPath, before, a.oldText, a.newText, a.startLine);
          if (!r.validation.ok) return fail('rejected: replace_literal would break syntax. ' + (r.validation.introduced ?? ''));
          if (r.newText === before) return ok({ ok: true, changed: false, note: 'no change', file: relPath });
          if (!a.preview) atomicWrite(absPath, r.newText);
          return ok({ ok: true, changed: !a.preview, file: relPath, matched: r.matched });
        }
        case 'insert_at': {
          if (!a.startLine || !a.startColumn || a.newText === undefined) throw new Error('insert_at requires position+newText');
          const p = { line: a.startLine, column: a.startColumn };
          const r = applyEdits(relPath, before, [{ start: p, end: p, newText: a.newText }]);
          return commit(relPath, absPath, before, r, { op: 'atomic_edit:insert_at' }, a.preview ?? false);
        }
        case 'delete_range': {
          if (!a.startLine || !a.startColumn || !a.endLine || !a.endColumn) throw new Error('delete_range requires coordinates');
          const r = applyEdits(relPath, before, [{ start: { line: a.startLine, column: a.startColumn }, end: { line: a.endLine, column: a.endColumn }, newText: '' }]);
          return commit(relPath, absPath, before, r, { op: 'atomic_edit:delete_range' }, a.preview ?? false);
        }
        case 'edit_symbol': {
          if (!a.selector || !a.symbolOp) throw new Error('edit_symbol requires selector+symbolOp');
          const r = await editSymbol(relPath, before, a.selector, a.symbolOp as SymbolOp, a.code);
          if (!r.validation.ok) return fail('rejected: ' + a.symbolOp + ' on ' + r.selector + ' would introduce a syntax error. ' + (r.validation.introduced ?? ''));
          if (r.newText === before) return ok({ ok: true, changed: false, note: 'no change', file: relPath });
          if (!a.preview) atomicWrite(absPath, r.newText);
          return ok({ ok: true, changed: !a.preview, preview: a.preview ?? false, file: relPath, selector: r.selector, op: r.op });
        }
        case 'add_import': {
          if (!a.name || !a.module) throw new Error('add_import requires name+module');
          const r = await addNamedImport(relPath, before, a.module, a.name, a.alias, a.typeOnly);
          return commitSemantic(relPath, absPath, before, r, a.preview ?? false);
        }
        case 'remove_import': {
          if (!a.name || !a.module) throw new Error('remove_import requires name+module');
          const r = await removeNamedImport(relPath, before, a.module, a.name);
          return commitSemantic(relPath, absPath, before, r, a.preview ?? false);
        }
        case 'replace_property_value': {
          if (!a.property || a.value === undefined) throw new Error('replace_property_value requires property+value');
          const r = await replacePropertyValue(relPath, before, a.property, a.value, a.selector);
          return commitSemantic(relPath, absPath, before, r, a.preview ?? false);
        }
        case 'rename_property_key': {
          if (!a.property || !a.newKey) throw new Error('rename_property_key requires property+newKey');
          const r = await renamePropertyKey(relPath, before, a.property, a.newKey, a.selector);
          return commitSemantic(relPath, absPath, before, r, a.preview ?? false);
        }
        case 'rename_symbol': {
          if (!a.startLine || !a.startColumn || !a.newText) throw new Error('rename_symbol requires position+newText');
          const r = await renameSymbol(relPath, before, { line: a.startLine, column: a.startColumn }, a.newText);
          if (!r.validation.ok) return fail('Rename rejected: ' + (r.validation.introduced ?? ''));
          if (!a.preview) atomicWrite(absPath, r.newText);
          return ok({ ok: true, changed: !a.preview, file: relPath, symbol: r.symbol, occurrences: r.occurrences });
        }
        default:
          return fail('Unknown op: ' + a.op);
      }
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_replace_range',
  {
    title: 'Replace an exact character range',
    description:
      'Replace text between (startLine,startColumn) and (endLine,endColumn) — 1-based, end-exclusive — ' +
      'with newText. Structurally validated before write. Use this instead of rewriting a whole line ' +
      'when the real intention is sub-line (a literal, an argument, a token).',
    inputSchema: {
      file: z.string().describe('repo-relative path'),
      startLine: z.number().int().min(1),
      startColumn: z.number().int().min(1),
      endLine: z.number().int().min(1),
      endColumn: z.number().int().min(1),
      newText: z.string(),
      preview: z
        .boolean()
        .optional()
        .describe('dry-run only when uncertain; exact edits are already validated before write'),
      verify: z.enum(['typecheck', 'lint']).optional(),
      lock: z.boolean().optional(),
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      const r = applyEdits(relPath, before, [
        {
          start: { line: a.startLine, column: a.startColumn },
          end: { line: a.endLine, column: a.endColumn },
          newText: a.newText,
        },
      ]);
      return commit(relPath, absPath, before, r, {}, a.preview ?? false, a.verify, a.lock);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_replace_text',
  {
    title: 'Replace exact text (builtin-edit ergonomics + validation)',
    description:
      'Replace a verbatim oldText block with newText — same ergonomics as the blunt builtin edit/str_replace ' +
      '(no coordinates needed), BUT syntax-regression-validated + atomic-write + governance-guarded like every ' +
      'atomic op. PREFER THIS over the builtin edit for each multi-line/block change: it is just as easy and it ' +
      'refuses to persist broken code. Requires a unique match (add surrounding context) or an explicit ' +
      'occurrence index. Supports preview + expectedSha256.',
    inputSchema: {
      file: z
        .string()
        .describe(
          'repo-relative to the MCP server root; use an absolute path when operating inside a linked worktree',
        ),
      oldText: z
        .string()
        .describe('exact verbatim text to replace, including whitespace/indentation'),
      newText: z.string(),
      occurrence: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('1-based; omit to require a unique match (refuses ambiguity)'),
      expectedSha256: z
        .string()
        .optional()
        .describe("optimistic-concurrency guard: refuse if the file's sha256 differs"),
      preview: z
        .boolean()
        .optional()
        .describe('dry-run only when uncertain; exact edits are already validated before write'),
      verify: z.enum(['typecheck', 'lint']).optional(),
      lock: z.boolean().optional(),
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      guardSha(before, a.expectedSha256);
      const r = replaceText(relPath, before, a.oldText, a.newText, a.occurrence);
      return commit(relPath, absPath, before, r, {}, a.preview ?? false, a.verify, a.lock);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_insert_at',
  {
    title: 'Insert text at a position',
    description:
      'Insert text at (line,column) without rewriting the surrounding line. Zero-width edit (start===end).',
    inputSchema: {
      file: z.string(),
      line: z.number().int().min(1),
      column: z.number().int().min(1),
      text: z.string(),
      preview: z.boolean().optional().describe('dry-run: validate + return diff, do not write'),
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      const p = { line: a.line, column: a.column };
      const r = applyEdits(relPath, before, [{ start: p, end: p, newText: a.text }]);
      return commit(relPath, absPath, before, r, {}, a.preview ?? false);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_delete_range',
  {
    title: 'Delete an exact character range',
    description:
      'Delete text between (startLine,startColumn) and (endLine,endColumn), 1-based, end-exclusive.',
    inputSchema: {
      file: z.string(),
      startLine: z.number().int().min(1),
      startColumn: z.number().int().min(1),
      endLine: z.number().int().min(1),
      endColumn: z.number().int().min(1),
      preview: z.boolean().optional().describe('dry-run: validate + return diff, do not write'),
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      const r = applyEdits(relPath, before, [
        {
          start: { line: a.startLine, column: a.startColumn },
          end: { line: a.endLine, column: a.endColumn },
          newText: '',
        },
      ]);
      return commit(relPath, absPath, before, r, {}, a.preview ?? false);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_create_file',
  {
    title: 'Create (or wholesale-replace) a file — syntax-validated, atomic, governed',
    description:
      'Create a NEW source file (or, with overwrite:true, replace one wholesale) with `content`, through the ' +
      'SAME pipeline as every atomic op: governance guard, full syntax-regression validation, atomic write, ' +
      'char-level trace. This is the first-class FILE-LEVEL operator for decomposition/extraction (topologies: ' +
      'identity-preserved position-moved, API-preserved impl-moved): create the new module here, then trim the ' +
      'origin with atomic_edit_symbol/atomic_replace_range and rewire with atomic_add_import. NEVER fall back to ' +
      'a shell heredoc (cat > file) — that bypasses validation, trace and governance and is a banned escape.',
    inputSchema: {
      file: z.string().describe('repo-relative path of the file to create'),
      content: z.string().describe('full file content'),
      overwrite: z
        .boolean()
        .optional()
        .describe(
          'replace an existing file wholesale (default false → refuse if it already exists)',
        ),
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
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const exists = fs.existsSync(absPath);
      const existingBefore = exists ? fs.readFileSync(absPath, 'utf8') : '';
      // A/B loop R7 finding + Atomic Action Principle: regenerating a whole
      // existing file to change PART of it is the banned macro-mutation (it
      // re-emits the entire file as a tool argument — the dominant token
      // sink). atomic_create_file is for NEW files only. Modifying an
      // existing non-empty file MUST go through a surgical operator.
      if (exists && existingBefore.trim() !== '') {
        return fail(
          `refused: ${relPath} already exists and is non-empty. atomic_create_file ` +
            `is for NEW files only. To CHANGE part of an existing file use a ` +
            `surgical operator — atomic_edit_symbol (replace/remove a symbol), ` +
            `atomic_delete_range / atomic_replace_range (a span), ` +
            `atomic_replace_text (a verbatim block), atomic_add_import — so only ` +
            `the changed sub-structure is emitted, never the whole file.`,
        );
      }
      const before = existingBefore;
      guardSha(before, a.expectedSha256);
      const edit =
        before === ''
          ? { start: { line: 1, column: 1 }, end: { line: 1, column: 1 }, newText: a.content }
          : (() => {
              const lines = before.split('\n');
              return {
                start: { line: 1, column: 1 },
                end: { line: lines.length, column: lines[lines.length - 1].length + 1 },
                newText: a.content,
              };
            })();
      const r = applyEdits(relPath, before, [edit]);
      if (!exists && !(a.preview ?? false)) {
        fs.mkdirSync(path.dirname(absPath), { recursive: true });
      }
      return commit(
        relPath,
        absPath,
        before,
        r,
        { op: 'atomic_create_file', created: !exists },
        a.preview ?? false,
        a.verify,
        a.lock,
      );
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

// ──────────────────────── v5: call/argument operations (all languages) ──

server.registerTool(
  'atomic_replace_callee',
  {
    title: 'Replace function/method name — preserve all arguments',
    description:
      'Replace the callee at a call site, preserving all arguments exactly. Works on every language. ' +
      'Example: sendMessage(phone, content) → sendTemplateMessage(phone, content).',
    inputSchema: {
      file: z.string(),
      line: z.number().int().min(1).describe('Line of the call expression'),
      column: z.number().int().min(1).describe('Column within the callee identifier'),
      newCallee: z.string().describe('Replacement function/method name'),
      preview: z.boolean().optional().describe('dry-run: validate + show result, do not write'),
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      const r = replaceCalleeKeepArgs(relPath, before, a.line, a.column, a.newCallee);
      if (!r.validation.ok) return fail('rejected: ' + (r.validation.introduced ?? 'syntax regression'));
      if (r.newText === before) return ok({ ok: true, changed: false, note: 'callee already matches', file: relPath });
      if (a.preview ?? false) return ok({ ok: true, preview: true, changed: false, file: relPath, oldCallee: r.oldCallee, newCallee: r.newCallee });
      atomicWrite(absPath, r.newText);
      return ok({ ok: true, changed: true, file: relPath, oldCallee: r.oldCallee, newCallee: r.newCallee });
    } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
  },
);

server.registerTool(
  'atomic_replace_arg',
  {
    title: 'Replace one argument in a call — preserve everything else',
    description: 'Replace arg at argIndex (0-based) in a call. Works on every language. Example: foo(a, old, c)→foo(a, new, c).',
    inputSchema: {
      file: z.string(),
      line: z.number().int().min(1), column: z.number().int().min(1),
      argIndex: z.number().int().min(0).describe('0-based argument index'),
      newText: z.string().describe('Replacement argument text'),
      preview: z.boolean().optional(),
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      const r = replaceCallArg(relPath, before, a.line, a.column, a.argIndex, a.newText);
      if (!r.validation.ok) return fail('rejected: ' + (r.validation.introduced ?? 'syntax regression'));
      if (r.newText === before) return ok({ ok: true, changed: false, note: 'no change', file: relPath });
      if (a.preview ?? false) return ok({ ok: true, preview: true, changed: false, file: relPath });
      atomicWrite(absPath, r.newText);
      return ok({ ok: true, changed: true, file: relPath });
    } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
  },
);

server.registerTool(
  'atomic_insert_arg',
  {
    title: 'Insert a new argument into a call',
    description: 'Insert newText at argIndex (0-based). Example: foo(a,c)→foo(a,b,c).',
    inputSchema: {
      file: z.string(),
      line: z.number().int().min(1), column: z.number().int().min(1),
      argIndex: z.number().int().min(0).describe('0-based insertion position'),
      newText: z.string().describe('New argument text'),
      preview: z.boolean().optional(),
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      const r = insertCallArg(relPath, before, a.line, a.column, a.argIndex, a.newText);
      if (!r.validation.ok) return fail('rejected: ' + (r.validation.introduced ?? 'syntax regression'));
      if (a.preview ?? false) return ok({ ok: true, preview: true, changed: false, file: relPath });
      atomicWrite(absPath, r.newText);
      return ok({ ok: true, changed: true, file: relPath });
    } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
  },
);

server.registerTool(
  'atomic_remove_arg',
  {
    title: 'Remove an argument from a call',
    description: 'Remove arg at argIndex (0-based). Cleans up commas. Example: bar(x,y,z)→bar(x,z).',
    inputSchema: {
      file: z.string(),
      line: z.number().int().min(1), column: z.number().int().min(1),
      argIndex: z.number().int().min(0).describe('0-based argument index to remove'),
      preview: z.boolean().optional(),
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      const r = removeCallArg(relPath, before, a.line, a.column, a.argIndex);
      if (!r.validation.ok) return fail('rejected: ' + (r.validation.introduced ?? 'syntax regression'));
      if (r.newText === before) return ok({ ok: true, changed: false, note: 'no change', file: relPath });
      if (a.preview ?? false) return ok({ ok: true, preview: true, changed: false, file: relPath });
      atomicWrite(absPath, r.newText);
      return ok({ ok: true, changed: true, file: relPath });
    } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
  },
);

// ──────────────────────── v6: universal literal/property ops ──────────

server.registerTool(
  'atomic_replace_literal_universal',
  {
    title: 'Replace a literal value — every language',
    description: 'Replace string/number/boolean/null at line:column. Works on every language.',
    inputSchema: {
      file: z.string(), line: z.number().int().min(1), column: z.number().int().min(1),
      newLiteral: z.string().describe('Replacement source text'),
      preview: z.boolean().optional(),
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      const r = universalReplaceLiteral(relPath, before, a.line, a.column, a.newLiteral);
      if (!r.validation.ok) return fail('rejected: ' + (r.validation.introduced ?? 'syntax regression'));
      if (r.newText === before) return ok({ ok: true, changed: false, note: 'no change', file: relPath });
      if (a.preview ?? false) return ok({ ok: true, preview: true, changed: false, file: relPath, oldText: r.oldText, newLiteral: r.newLiteral });
      atomicWrite(absPath, r.newText);
      return ok({ ok: true, changed: true, file: relPath, oldText: r.oldText, newLiteral: r.newLiteral });
    } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
  },
);

server.registerTool(
  'atomic_replace_property_value_universal',
  {
    title: 'Replace property value — every language',
    description: 'Replace value of property preserving key. Detects colon/equals/TOML/YAML style.',
    inputSchema: { file: z.string(), property: z.string(), value: z.string(), preview: z.boolean().optional() },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      const r = universalReplacePropertyValue(relPath, before, a.property, a.value);
      if (!r.validation.ok) return fail('rejected: ' + (r.validation.introduced ?? 'syntax regression'));
      if (r.newText === before) return ok({ ok: true, changed: false, note: 'no change', file: relPath });
      if (a.preview ?? false) return ok({ ok: true, preview: true, changed: false, file: relPath, key: r.key, oldValue: r.oldValue, newValue: r.newValue });
      atomicWrite(absPath, r.newText);
      return ok({ ok: true, changed: true, file: relPath, key: r.key, oldValue: r.oldValue, newValue: r.newValue });
    } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
  },
);

server.registerTool(
  'atomic_rename_property_key_universal',
  {
    title: 'Rename property key — preserve value — every language',
    description: 'Rename property key preserving its value. Works on every language style.',
    inputSchema: { file: z.string(), property: z.string(), newKey: z.string(), preview: z.boolean().optional() },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      const r = universalRenamePropertyKey(relPath, before, a.property, a.newKey);
      if (!r.validation.ok) return fail('rejected: ' + (r.validation.introduced ?? 'syntax regression'));
      if (a.preview ?? false) return ok({ ok: true, preview: true, changed: false, file: relPath, key: r.key, newKey: r.newKey });
      atomicWrite(absPath, r.newText);
      return ok({ ok: true, changed: true, file: relPath, key: r.key, newKey: r.newKey });
    } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
  },
);

// ──────────────────────── v7: complete topology ops ──────────────

server.registerTool('atomic_replace_operator', {
  title: 'Replace binary/logical operator — preserve operands',
  description: 'Replace operator at line:column. Example: if (count < limit) → if (count <= limit).',
  inputSchema: { file: z.string(), line: z.number().int().min(1), column: z.number().int().min(1), newOp: z.string(), preview: z.boolean().optional() },
}, async (a) => {
  try {
    const { absPath, relPath } = resolveSafeTarget(a.file);
    const before = readUtf8(absPath);
    const r = replaceOperator(relPath, before, a.line, a.column, a.newOp);
    if (!r.validation.ok) return fail('rejected: ' + (r.validation.introduced ?? 'syntax regression'));
    if (r.newText === before) return ok({ ok: true, changed: false, note: 'operator already matches', file: relPath });
    if (a.preview ?? false) return ok({ ok: true, preview: true, changed: false, file: relPath, oldOp: r.oldOp, newOp: r.newOp });
    atomicWrite(absPath, r.newText);
    return ok({ ok: true, changed: true, file: relPath, oldOp: r.oldOp, newOp: r.newOp });
  } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
});

server.registerTool('atomic_reorder_list', {
  title: 'Move item in comma-separated list — tracked as movement',
  description: 'Move item fromIndex→toIndex in a { } ( ) or [ ] list. Tracked as movement, not delete+create.',
  inputSchema: { file: z.string(), line: z.number().int().min(1), column: z.number().int().min(1), fromIndex: z.number().int().min(0), toIndex: z.number().int().min(0), preview: z.boolean().optional() },
}, async (a) => {
  try {
    const { absPath, relPath } = resolveSafeTarget(a.file);
    const before = readUtf8(absPath);
    const r = reorderListItem(relPath, before, a.line, a.column, a.fromIndex, a.toIndex);
    if (!r.validation.ok) return fail('rejected: ' + (r.validation.introduced ?? 'syntax regression'));
    if (r.newText === before) return ok({ ok: true, changed: false, file: relPath });
    if (a.preview ?? false) return ok({ ok: true, preview: true, changed: false, file: relPath, moved: r.moved, fromIndex: r.fromIndex, toIndex: r.toIndex });
    atomicWrite(absPath, r.newText);
    return ok({ ok: true, changed: true, file: relPath, moved: r.moved, fromIndex: r.fromIndex, toIndex: r.toIndex });
  } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
});

server.registerTool('atomic_change_signature', {
  title: 'Change function signature — preserve body',
  description: 'Modes: rename_param, add_param, remove_param, add_return_type. Preserves body byte-exact.',
  inputSchema: { file: z.string(), fnLine: z.number().int().min(1), fnColumn: z.number().int().min(1), mode: z.enum(['rename_param', 'add_param', 'remove_param', 'add_return_type']), paramIndex: z.number().int().min(-1), newValue: z.string(), preview: z.boolean().optional() },
}, async (a) => {
  try {
    const { absPath, relPath } = resolveSafeTarget(a.file);
    const before = readUtf8(absPath);
    const r = changeSignature(relPath, before, a.fnLine, a.fnColumn, a.mode, a.paramIndex, a.newValue);
    if (!r.validation.ok) return fail('rejected: ' + (r.validation.introduced ?? 'syntax regression'));
    if (r.newText === before) return ok({ ok: true, changed: false, file: relPath });
    if (a.preview ?? false) return ok({ ok: true, preview: true, changed: false, file: relPath });
    atomicWrite(absPath, r.newText);
    return ok({ ok: true, changed: true, file: relPath });
  } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
});

server.registerTool('atomic_replace_body', {
  title: 'Replace function body — preserve signature',
  description: 'Swap function/method implementation while keeping signature byte-exact.',
  inputSchema: { file: z.string(), fnLine: z.number().int().min(1), fnColumn: z.number().int().min(1), newBody: z.string(), preview: z.boolean().optional() },
}, async (a) => {
  try {
    const { absPath, relPath } = resolveSafeTarget(a.file);
    const before = readUtf8(absPath);
    const r = replaceBodyKeepSignature(relPath, before, a.fnLine, a.fnColumn, a.newBody);
    if (!r.validation.ok) return fail('rejected: ' + (r.validation.introduced ?? 'syntax regression'));
    if (a.preview ?? false) return ok({ ok: true, preview: true, changed: false, file: relPath });
    atomicWrite(absPath, r.newText);
    return ok({ ok: true, changed: true, file: relPath });
  } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
});

server.registerTool('atomic_add_decorator', {
  title: 'Add decorator/annotation before function/method/class',
  description: 'Add @decorator, @Annotation, #[attr] etc. preserving the target.',
  inputSchema: { file: z.string(), targetLine: z.number().int().min(2), decorator: z.string().describe('e.g. "@auth.requires_login" or "@UseGuards(AuthGuard)"'), preview: z.boolean().optional() },
}, async (a) => {
  try {
    const { absPath, relPath } = resolveSafeTarget(a.file);
    const before = readUtf8(absPath);
    const r = addDecorator(relPath, before, a.targetLine, a.decorator);
    if (!r.validation.ok) return fail('rejected: ' + (r.validation.introduced ?? 'syntax regression'));
    if (a.preview ?? false) return ok({ ok: true, preview: true, changed: false, file: relPath });
    atomicWrite(absPath, r.newText);
    return ok({ ok: true, changed: true, file: relPath });
  } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
});

server.registerTool('atomic_replace_decorator', {
  title: 'Replace a decorator/annotation — preserve target',
  description: 'Swap decorator on line before target. Finds the matching decorator and replaces it.',
  inputSchema: { file: z.string(), targetLine: z.number().int().min(2), oldDecorator: z.string(), newDecorator: z.string(), preview: z.boolean().optional() },
}, async (a) => {
  try {
    const { absPath, relPath } = resolveSafeTarget(a.file);
    const before = readUtf8(absPath);
    const r = replaceDecorator(relPath, before, a.targetLine, a.oldDecorator, a.newDecorator);
    if (!r.validation.ok) return fail('rejected: ' + (r.validation.introduced ?? 'syntax regression'));
    if (a.preview ?? false) return ok({ ok: true, preview: true, changed: false, file: relPath });
    atomicWrite(absPath, r.newText);
    return ok({ ok: true, changed: true, file: relPath });
  } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
});

server.registerTool('atomic_move_into_scope', {
  title: 'Move lines into a scope (if/try/with) — preserve content',
  description: 'Wrap lines startLine..endLine in a new scope. Re-indents preserved content. Example: move lines into try/catch.',
  inputSchema: { file: z.string(), startLine: z.number().int().min(1), endLine: z.number().int().min(1), scopeHeader: z.string().describe('e.g. "if (user != null) {" or "try:"'), scopeFooter: z.string().describe('e.g. "}" or "" for Python'), preview: z.boolean().optional() },
}, async (a) => {
  try {
    const { absPath, relPath } = resolveSafeTarget(a.file);
    const before = readUtf8(absPath);
    const r = moveIntoScope(relPath, before, a.startLine, a.endLine, a.scopeHeader, a.scopeFooter);
    if (!r.validation.ok) return fail('rejected: ' + (r.validation.introduced ?? 'syntax regression'));
    if (r.newText === before) return ok({ ok: true, changed: false, file: relPath });
    if (a.preview ?? false) return ok({ ok: true, preview: true, changed: false, file: relPath });
    atomicWrite(absPath, r.newText);
    return ok({ ok: true, changed: true, file: relPath });
  } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
});

}
