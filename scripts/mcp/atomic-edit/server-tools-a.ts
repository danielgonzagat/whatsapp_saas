import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { applyEdits, replaceText, renameSymbol, replaceLiteral } from './engine.js';
import { resolveSafeTarget } from './guard.js';
import { editSymbol, addNamedImport, removeNamedImport, replacePropertyValue, type SymbolOp, renamePropertyKey } from './advanced.js';
import { guardSha, readUtf8 } from './server-helpers-io.js';
import { requireNegativeActionProof, requireNegativeProofForRemovedBytes, removedByteCountBetween } from './server-helpers-negative-proof.js';
import { ok, fail, commit, writeWithTrace } from './server-helpers-result.js';
import { commitSemantic } from './server-helpers-commit-semantic.js';
import { registerToolsA2 } from './server-tools-a-2.js';
import { registerToolsA3 } from './server-tools-a-3.js';
import { doReplaceAt } from './server-tools-locate.js';

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
        'replace_property_value', 'rename_property_key', 'replace_at',
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
      mode: z.enum(['content', 'after_anchor', 'before_anchor']).optional(),
      anchor: z.string().optional(),
      expectedSha256: z.string().optional(),
      preview: z.boolean().optional(),
      proofOfIncorrectness: z
        .string()
        .optional()
        .describe('required for negative byte actions: proof that removed bytes are non-correct/negative'),
      verify: z.enum(['typecheck', 'lint']).optional(),
      lock: z.boolean().optional(),
    },
  },
  async (a) => {
    try {
      if (a.op === 'replace_at') {
        if (!a.mode || a.anchor === undefined || a.newText === undefined) {
          return fail('replace_at requires mode, anchor, newText');
        }
        return doReplaceAt({
          file: a.file,
          mode: a.mode,
          anchor: a.anchor,
          newText: a.newText,
          occurrence: a.occurrence,
          expectedSha256: a.expectedSha256,
          preview: a.preview,
          proofOfIncorrectness: a.proofOfIncorrectness,
          verify: a.verify,
          lock: a.lock,
        });
      }
      const { absPath, relPath, repoRoot } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      guardSha(before, a.expectedSha256);

      switch (a.op) {
        case 'replace_text': {
          if (!a.oldText || a.newText === undefined) throw new Error('replace_text requires oldText+newText');
          const r = replaceText(relPath, before, a.oldText, a.newText, a.occurrence);
          const negativeActionProof = requireNegativeProofForRemovedBytes({
            action: 'atomic_edit:replace_text',
            target: relPath,
            targetUnit: 'file',
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
            { op: 'atomic_edit:replace_text', ...(negativeActionProof ? { negativeActionProof } : {}) },
            a.preview ?? false,
            a.verify,
            a.lock,
          );
        }
        case 'replace_range': {
          if (!a.startLine || !a.startColumn || !a.endLine || !a.endColumn || a.newText === undefined) throw new Error('replace_range requires coordinates+newText');
          const r = applyEdits(relPath, before, [{ start: { line: a.startLine, column: a.startColumn }, end: { line: a.endLine, column: a.endColumn }, newText: a.newText }]);
          const negativeActionProof = requireNegativeProofForRemovedBytes({
            action: 'atomic_edit:replace_range',
            target: relPath,
            targetUnit: 'range',
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
            { op: 'atomic_edit:replace_range', ...(negativeActionProof ? { negativeActionProof } : {}) },
            a.preview ?? false,
            a.verify,
            a.lock,
          );
        }
        case 'replace_literal': {
          if (!a.oldText || a.newText === undefined) throw new Error('replace_literal requires oldText+newText');
          const r = await replaceLiteral(relPath, before, a.oldText, a.newText, a.startLine);
          if (!r.validation.ok) return fail('rejected: replace_literal would break syntax. ' + (r.validation.introduced ?? ''));
          if (r.newText === before) return ok({ ok: true, changed: false, note: 'no change', file: relPath });
          const negativeActionProof = requireNegativeProofForRemovedBytes({
            action: 'atomic_edit:replace_literal',
            target: relPath,
            targetUnit: 'literal',
            before,
            after: r.newText,
            proofOfIncorrectness: a.proofOfIncorrectness,
            preview: a.preview ?? false,
          });
          if (!a.preview) writeWithTrace(relPath, absPath, before, r.newText, 'atomic_edit:replace_literal', r.validation, negativeActionProof);
          return ok({ ok: true, changed: !a.preview, file: relPath, matched: r.matched, ...(negativeActionProof ? { negativeActionProof } : {}) });
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
          const negativeActionProof = a.preview
            ? undefined
            : requireNegativeActionProof({
                action: 'atomic_edit:delete_range',
                target: relPath,
                targetUnit: 'range',
                removedByteCount: removedByteCountBetween(before, r.newText),
                proofOfIncorrectness: a.proofOfIncorrectness,
              });
          return commit(relPath, absPath, before, r, { op: 'atomic_edit:delete_range', negativeActionProof }, a.preview ?? false);
        }
        case 'edit_symbol': {
          if (!a.selector || !a.symbolOp) throw new Error('edit_symbol requires selector+symbolOp');
          const r = await editSymbol(relPath, before, a.selector, a.symbolOp as SymbolOp, a.code);
          if (!r.validation.ok) return fail('rejected: ' + a.symbolOp + ' on ' + r.selector + ' would introduce a syntax error. ' + (r.validation.introduced ?? ''));
          if (r.newText === before) return ok({ ok: true, changed: false, note: 'no change', file: relPath });
          const negativeActionProof = a.symbolOp === 'remove' && !(a.preview ?? false)
            ? requireNegativeActionProof({
                action: 'atomic_edit:edit_symbol:remove',
                target: `${relPath}:${r.selector}`,
                targetUnit: 'symbol',
                removedByteCount: removedByteCountBetween(before, r.newText),
                proofOfIncorrectness: a.proofOfIncorrectness,
              })
            : undefined;
          if (!a.preview) writeWithTrace(relPath, absPath, before, r.newText, 'atomic_edit:edit_symbol', r.validation, negativeActionProof);
          return ok({ ok: true, changed: !a.preview, preview: a.preview ?? false, file: relPath, selector: r.selector, op: r.op, ...(negativeActionProof ? { negativeActionProof } : {}) });
        }
        case 'add_import': {
          if (!a.name || !a.module) throw new Error('add_import requires name+module');
          const r = await addNamedImport(relPath, before, a.module, a.name, a.alias, a.typeOnly);
          return commitSemantic(relPath, absPath, before, r, a.preview ?? false);
        }
        case 'remove_import': {
          if (!a.name || !a.module) throw new Error('remove_import requires name+module');
          const r = await removeNamedImport(relPath, before, a.module, a.name);
          const negativeActionProof = a.preview
            ? undefined
            : requireNegativeActionProof({
                action: 'atomic_edit:remove_import',
                target: `${relPath}:${a.module}:${a.name}`,
                targetUnit: 'import',
                removedByteCount: removedByteCountBetween(before, r.newText),
                proofOfIncorrectness: a.proofOfIncorrectness,
              });
          return commitSemantic(relPath, absPath, before, r, a.preview ?? false, undefined, { negativeActionProof });
        }
        case 'replace_property_value': {
          if (!a.property || a.value === undefined) throw new Error('replace_property_value requires property+value');
          const r = await replacePropertyValue(relPath, before, a.property, a.value, a.selector);
          const negativeActionProof = requireNegativeProofForRemovedBytes({
            action: 'atomic_edit:replace_property_value',
            target: `${relPath}:${a.property}`,
            targetUnit: 'property-value',
            before,
            after: r.newText,
            proofOfIncorrectness: a.proofOfIncorrectness,
            preview: a.preview ?? false,
          });
          return commitSemantic(
            relPath,
            absPath,
            before,
            r,
            a.preview ?? false,
            undefined,
            negativeActionProof ? { negativeActionProof } : {},
          );
        }
        case 'rename_property_key': {
          if (!a.property || !a.newKey) throw new Error('rename_property_key requires property+newKey');
          const r = await renamePropertyKey(relPath, before, a.property, a.newKey, a.selector);
          const negativeActionProof = requireNegativeProofForRemovedBytes({
            action: 'atomic_edit:rename_property_key',
            target: `${relPath}:${a.property}->${a.newKey}`,
            targetUnit: 'property-key',
            before,
            after: r.newText,
            proofOfIncorrectness: a.proofOfIncorrectness,
            preview: a.preview ?? false,
          });
          return commitSemantic(
            relPath,
            absPath,
            before,
            r,
            a.preview ?? false,
            undefined,
            negativeActionProof ? { negativeActionProof } : {},
          );
        }
        case 'rename_symbol': {
          if (!a.startLine || !a.startColumn || !a.newText) throw new Error('rename_symbol requires position+newText');
          const r = await renameSymbol(relPath, before, { line: a.startLine, column: a.startColumn }, a.newText);
          if (!r.validation.ok) return fail('Rename rejected: ' + (r.validation.introduced ?? ''));
          const negativeActionProof = requireNegativeProofForRemovedBytes({
            action: 'atomic_edit:rename_symbol',
            target: `${relPath}:${r.symbol}->${a.newText}`,
            targetUnit: 'symbol',
            before,
            after: r.newText,
            proofOfIncorrectness: a.proofOfIncorrectness,
            preview: a.preview ?? false,
          });
          if (!a.preview) writeWithTrace(relPath, absPath, before, r.newText, 'atomic_edit:rename_symbol', r.validation, negativeActionProof);
          return ok({ ok: true, changed: !a.preview, file: relPath, symbol: r.symbol, occurrences: r.occurrences, ...(negativeActionProof ? { negativeActionProof } : {}) });
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
      'PREFER atomic_replace_at (content/anchor-addressed — you never type line/column, which is the #1 ' +
      'edit-error source). This coordinate tool remains the internal compilation target and back-compat path. ' +
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
      proofOfIncorrectness: z
        .string()
        .optional()
        .describe('required when replacement removes bytes: proof that removed bytes are non-correct/negative'),
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
      const negativeActionProof = requireNegativeProofForRemovedBytes({
        action: 'atomic_replace_range',
        target: relPath,
        targetUnit: 'range',
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
        { op: 'atomic_replace_range', ...(negativeActionProof ? { negativeActionProof } : {}) },
        a.preview ?? false,
        a.verify,
        a.lock,
      );
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
      proofOfIncorrectness: z
        .string()
        .optional()
        .describe('required when replacement removes bytes: proof that removed bytes are non-correct/negative'),
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
      const negativeActionProof = requireNegativeProofForRemovedBytes({
        action: 'atomic_replace_text',
        target: relPath,
        targetUnit: 'file',
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
        { op: 'atomic_replace_text', ...(negativeActionProof ? { negativeActionProof } : {}) },
        a.preview ?? false,
        a.verify,
        a.lock,
      );
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

  registerToolsA3(server);

  registerToolsA2(server);
}
