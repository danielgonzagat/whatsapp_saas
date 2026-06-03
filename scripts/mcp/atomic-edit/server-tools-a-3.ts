import * as fs from 'node:fs';
import * as path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { applyEdits } from './engine.js';
import { resolveSafeTarget } from './guard.js';
import { guardSha, readUtf8 } from './server-helpers-io.js';
import { requireNegativeActionProof, removedByteCountBetween } from './server-helpers-negative-proof.js';
import { ok, fail, commit, writeWithTrace } from './server-helpers-result.js';
import { replaceCalleeKeepArgs, replaceCallArg, insertCallArg, removeCallArg } from './engine-ops.js';
import { universalReplaceLiteral, universalReplacePropertyValue, universalRenamePropertyKey } from './engine-universal.js';

export function registerToolsA3(server: McpServer): void {
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
      proofOfIncorrectness: z
        .string()
        .optional()
        .describe('required for non-preview deletion: proof that the removed bytes are non-correct/negative'),
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
      const negativeActionProof = a.preview
        ? undefined
        : requireNegativeActionProof({
            action: 'atomic_delete_range',
            target: relPath,
            targetUnit: 'range',
            removedByteCount: removedByteCountBetween(before, r.newText),
            proofOfIncorrectness: a.proofOfIncorrectness,
          });
      return commit(relPath, absPath, before, r, { op: 'atomic_delete_range', negativeActionProof }, a.preview ?? false);
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
      if (exists && existingBefore.trim() !== '' && !a.overwrite) {
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
      writeWithTrace(relPath, absPath, before, r.newText, 'atomic_replace_callee', r.validation);
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
      writeWithTrace(relPath, absPath, before, r.newText, 'atomic_replace_arg', r.validation);
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
      writeWithTrace(relPath, absPath, before, r.newText, 'atomic_insert_arg', r.validation);
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
      proofOfIncorrectness: z
        .string()
        .optional()
        .describe('required for non-preview argument removal: proof that the removed bytes are non-correct/negative'),
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
      const negativeActionProof = requireNegativeActionProof({
        action: 'atomic_remove_arg',
        target: `${relPath}:${a.line}:${a.column}:${a.argIndex}`,
        targetUnit: 'argument',
        removedByteCount: removedByteCountBetween(before, r.newText),
        proofOfIncorrectness: a.proofOfIncorrectness,
      });
      writeWithTrace(relPath, absPath, before, r.newText, 'atomic_remove_arg', r.validation, negativeActionProof);
      return ok({ ok: true, changed: true, file: relPath, negativeActionProof });
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
      writeWithTrace(relPath, absPath, before, r.newText, 'atomic_replace_literal_universal', r.validation);
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
      writeWithTrace(relPath, absPath, before, r.newText, 'atomic_replace_property_value_universal', r.validation);
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
      writeWithTrace(relPath, absPath, before, r.newText, 'atomic_rename_property_key_universal', r.validation);
      return ok({ ok: true, changed: true, file: relPath, key: r.key, newKey: r.newKey });
    } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
  },
);
}
