/**
 * server-tools-locate.ts — MOVE A (content/anchor-addressed editing) + the
 * shared doReplaceAt() that the atomic_edit router (MOVE B) also dispatches, so
 * the standalone tool and the router share ONE implementation (no drift).
 *
 * The #1 and #2 frictions vs the factory editor (coordinate math + line drift)
 * come from coordinate-addressed tools. This locates the span by CONTENT or
 * ANCHOR and compiles to the same validated applyEdits + commit firewall.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { applyEdits, type TextEditSpec } from './engine.js';
import { resolveSafeTarget } from './guard.js';
import { readUtf8, guardSha, log } from './server-helpers-io.js';
import { ok, fail, commit, writeWithTrace, type ToolOk } from './server-helpers-result.js';
import { requireNegativeProofForRemovedBytes } from './server-helpers-negative-proof.js';

/** UTF-16 string offset -> 1-based {line,column} (inverse of engine.posToOffset). */
function offsetToPos(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset; i++) {
    if (text.charCodeAt(i) === 10 /* \n */) {
      line += 1;
      lineStart = i + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
}

/** All 0-based offsets where `needle` occurs in `text`. */
function findAll(text: string, needle: string): number[] {
  const out: number[] = [];
  if (needle === '') return out;
  let i = text.indexOf(needle);
  while (i !== -1) {
    out.push(i);
    i = text.indexOf(needle, i + 1);
  }
  return out;
}

/** Pick the Nth (1-based) occurrence; refuse ambiguity when occurrence is omitted. */
function pickOne(offsets: number[], occurrence: number | undefined, label: string, text: string): number {
  if (offsets.length === 0) throw new Error(`${label} not found in file`);
  if (occurrence !== undefined) {
    if (occurrence < 1 || occurrence > offsets.length) {
      throw new Error(`${label}: occurrence ${occurrence} out of range (found ${offsets.length})`);
    }
    return offsets[occurrence - 1];
  }
  if (offsets.length > 1) {
    const lines = offsets.map((o) => offsetToPos(text, o).line).join(', ');
    throw new Error(`${label} appears ${offsets.length} times (lines ${lines}); pass occurrence to disambiguate`);
  }
  return offsets[0];
}

export interface ReplaceAtArgs {
  file: string;
  mode: 'content' | 'after_anchor' | 'before_anchor';
  anchor: string;
  newText: string;
  occurrence?: number;
  expectedSha256?: string;
  preview?: boolean;
  proofOfIncorrectness?: string;
  verify?: 'typecheck' | 'lint';
  lock?: boolean;
}

/**
 * Content/anchor-addressed edit through the firewall. Shared by the standalone
 * atomic_replace_at tool and the atomic_edit router's `replace_at` op.
 */
export function doReplaceAt(a: ReplaceAtArgs): ToolOk {
  try {
    const { absPath, relPath } = resolveSafeTarget(a.file);
    const before = readUtf8(absPath);
    guardSha(before, a.expectedSha256);

    const offsets = findAll(before, a.anchor);
    const at = pickOne(offsets, a.occurrence, JSON.stringify(a.anchor), before);

    let spec: TextEditSpec;
    if (a.mode === 'content') {
      spec = {
        start: offsetToPos(before, at),
        end: offsetToPos(before, at + a.anchor.length),
        newText: a.newText,
      };
    } else if (a.mode === 'after_anchor') {
      const pos = offsetToPos(before, at + a.anchor.length);
      spec = { start: pos, end: pos, newText: a.newText };
    } else {
      const pos = offsetToPos(before, at);
      spec = { start: pos, end: pos, newText: a.newText };
    }

    const result = applyEdits(absPath, before, [spec]);
    const negativeActionProof = requireNegativeProofForRemovedBytes({
      action: 'atomic_replace_at',
      target: relPath,
      targetUnit: a.mode === 'content' ? 'content' : 'anchor-insertion',
      before,
      after: result.newText,
      proofOfIncorrectness: a.proofOfIncorrectness,
      preview: a.preview ?? false,
    });
    return commit(
      relPath,
      absPath,
      before,
      result,
      { operator: 'atomic_replace_at', mode: a.mode, ...(negativeActionProof ? { negativeActionProof } : {}) },
      a.preview ?? false,
      a.verify,
      a.lock,
    );
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

export function registerToolsLocate(server: McpServer): void {
  server.registerTool(
    'atomic_replace_at',
    {
      title: 'Content/anchor-addressed edit — you never type line/column',
      description:
        'The default general editor: say WHAT to find (verbatim content, or text before/after an anchor) and ' +
        'WHAT to write — never WHERE (no coordinates). Compiles to the same validated applyEdits + commit ' +
        'firewall (sha256, syntax-validate, trace, protected-guard, rollback). Modes: ' +
        '`content` (replace a verbatim block), `after_anchor` (insert after an anchor), `before_anchor` ' +
        '(insert before an anchor). Refuses ambiguous matches unless `occurrence` is given. Also reachable ' +
        'as atomic_edit{op:"replace_at"}. For structural/symbol edits use atomic_edit_symbol / atomic_ast_edit.',
      inputSchema: {
        file: z.string(),
        mode: z.enum(['content', 'after_anchor', 'before_anchor']),
        anchor: z.string().describe('the verbatim content to replace, or the anchor text to insert around'),
        newText: z.string(),
        occurrence: z.number().int().min(1).optional(),
        expectedSha256: z.string().optional(),
        preview: z.boolean().optional(),
        proofOfIncorrectness: z
          .string()
          .optional()
          .describe('required when content replacement removes bytes: proof that removed bytes are non-correct/negative'),
        verify: z.enum(['typecheck', 'lint']).optional(),
        lock: z.boolean().optional(),
      },
    },
    async (a) => doReplaceAt(a),
  );

  server.registerTool(
    'atomic_locate',
    {
      title: 'Resolve a content/anchor query to a span (read-only)',
      description:
        'Read-only: resolve a verbatim content or anchor query to its {startLine,startColumn,endLine,endColumn} ' +
        'span + the matched text, so you can see exactly what an edit would target before writing. Refuses ' +
        'ambiguity unless occurrence is given.',
      inputSchema: {
        file: z.string(),
        anchor: z.string(),
        occurrence: z.number().int().min(1).optional(),
      },
    },
    async (a) => {
      try {
        const { absPath, relPath } = resolveSafeTarget(a.file);
        const before = readUtf8(absPath);
        const offsets = findAll(before, a.anchor);
        const at = pickOne(offsets, a.occurrence, JSON.stringify(a.anchor), before);
        const start = offsetToPos(before, at);
        const end = offsetToPos(before, at + a.anchor.length);
        return ok({
          file: relPath,
          occurrences: offsets.length,
          startLine: start.line,
          startColumn: start.column,
          endLine: end.line,
          endColumn: end.column,
          matched: a.anchor,
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );

  // Recovered capability (was defined in the never-wired server-semantic-tools.ts):
  // scope-correct rename across ANY language. The genuinely-absent tool the
  // codebase intended to ship but never connected.
  server.registerTool(
    'atomic_rename_symbol_universal',
    {
      title: 'Scope-correct rename across ANY language (TS via ts-morph, others via tree-sitter/identifier)',
      description:
        'Rename the symbol at (line,column) across the file. TS/JS: ts-morph (scope-correct, respects ' +
        'binding/shadowing). All other languages: identifier word-boundary matching + tree-sitter scope ' +
        'analysis when available, syntax-validated. The universal rename_symbol that works on every source file.',
      inputSchema: {
        file: z.string(),
        line: z.number().int().min(1),
        column: z.number().int().min(1),
        newName: z.string().min(1),
        preview: z.boolean().optional(),
      },
    },
    async (a) => {
      try {
        const { absPath, relPath } = resolveSafeTarget(a.file);
        const before = readUtf8(absPath);
        const { universalRename } = await import('./engine-rename.js');
        const r = await universalRename(relPath, before, { line: a.line, column: a.column }, a.newName);
        if (!r.validation.ok) {
          return fail('Rename rejected: ' + (r.validation.introduced ?? 'syntax regression'));
        }
        if (r.newText === before) {
          return ok({ ok: true, changed: false, note: 'no change (names already identical)', file: relPath });
        }
        if (a.preview ?? false) {
          return ok({
            ok: true,
            preview: true,
            changed: false,
            file: relPath,
            oldName: r.oldName,
            newName: r.newName,
            occurrences: r.occurrences,
            method: r.method,
          });
        }
        writeWithTrace(relPath, absPath, before, r.newText, 'atomic_rename_symbol_universal', r.validation);
        log(`universal rename ${r.oldName}->${r.newName}: ${r.occurrences} occurrences via ${r.method}`);
        return ok({
          ok: true,
          changed: true,
          file: relPath,
          oldName: r.oldName,
          newName: r.newName,
          occurrences: r.occurrences,
          method: r.method,
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );
}
