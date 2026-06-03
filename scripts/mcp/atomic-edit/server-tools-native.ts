/**
 * server-tools-native.ts — universal (multi-language) structural tools backed by
 * the in-process web-tree-sitter (WASM) engine (native-bridge.ts). No PI, no
 * native binary, no fork.
 *
 *   atomic_ast_search  — ast-grep structural search across any supported
 *                        language. Read-only.
 *   atomic_ast_edit    — ast-grep structural rewrite of ONE file. The native
 *                        engine COMPUTES the spans (dry-run only); this handler
 *                        applies them through the Mutation Firewall
 *                        (resolveSafeTarget -> guardSha -> applyEdits/validate
 *                        -> commit). The native engine never writes.
 *
 * Correctness: the bridge reports byte (UTF-8) offsets + a verbatim `before`
 * slice (web-tree-sitter works in UTF-16 internally; the bridge converts to
 * bytes). This handler converts byte offsets -> UTF-16 char offsets via Buffer
 * and span-guards every change (sliced source must equal the reported `before`)
 * before applying. Multibyte/astral-plane files are handled correctly.
 *
 * Degradation: if web-tree-sitter or a grammar wasm fails to load, both tools
 * fail cleanly with an honest message — callers use the explicit TS/range tools
 * instead. The universal engine is pure WASM (runs on every platform); the core
 * firewall edit tools never depend on it.
 */
import * as path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { applyEdits, type TextEditSpec } from './engine.js';
import { resolveSafeTarget, REPO_ROOT } from './guard.js';
import { readUtf8, guardSha } from './server-helpers-io.js';
import { ok, fail, commit, type ToolOk } from './server-helpers-result.js';
import {
  ensureReady,
  nativeAvailable,
  nativeLanguages,
  astGrep,
  astEditDry,
  type AstReplaceChange,
} from './native-bridge.js';
import { applyMultiFilePlan, type MultiFileEntry } from './server-helpers-multifile.js';

const STRICTNESS = ['cst', 'smart', 'ast', 'relaxed', 'signature', 'template'] as const;

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

async function nativeReadyOrFail(): Promise<ToolOk | null> {
  const ready = await ensureReady();
  if (!ready || !nativeAvailable()) {
    return fail(
      'universal engine (web-tree-sitter) unavailable — its WASM runtime or grammar failed to load; ' +
        'use the explicit atomic_edit range/literal/symbol tools (the engine is pure WASM and runs on every platform).',
    );
  }
  return null;
}

export function registerToolsNative(server: McpServer): void {
  server.registerTool(
    'atomic_ast_search',
    {
      title: 'Universal structural search (ast-grep, all supported languages)',
      description:
        'Search code structurally with an ast-grep pattern (e.g. "greet($A)", "function $F($$$) { $$$ }") ' +
        'across every tree-sitter-supported language. Read-only. Returns matches with file, line/column span, ' +
        'and (optionally) meta-variable bindings. `path` may be a file or directory inside the repo.',
      inputSchema: {
        path: z.string(),
        pattern: z.string(),
        lang: z.string().optional(),
        glob: z.string().optional(),
        strictness: z.enum(STRICTNESS).optional(),
        limit: z.number().int().min(1).max(1000).optional(),
        includeMeta: z.boolean().optional(),
      },
    },
    async (a) => {
      try {
        const gate = await nativeReadyOrFail();
        if (gate) return gate;
        const abs = path.resolve(REPO_ROOT, a.path);
        if (abs !== REPO_ROOT && !abs.startsWith(REPO_ROOT + path.sep)) {
          return fail(`path escapes repository root: ${a.path}`);
        }
        const limit = a.limit ?? 100;
        const res = await astGrep({
          path: abs,
          patterns: [a.pattern],
          lang: a.lang,
          glob: a.glob,
          strictness: a.strictness ?? 'smart',
          limit,
          includeMeta: a.includeMeta,
        });
        return ok({
          totalMatches: res.totalMatches,
          filesWithMatches: res.filesWithMatches,
          filesSearched: res.filesSearched,
          limitReached: res.limitReached,
          parseErrors: res.parseErrors ?? [],
          matches: res.matches.slice(0, limit),
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    'atomic_ast_edit',
    {
      title: 'Universal structural edit (ast-grep rewrite) through the firewall',
      description:
        'Rewrite ONE file structurally with an ast-grep pattern -> template (e.g. pattern "greet($A)", ' +
        'rewrite "salute($A)"), across every supported language. The native engine computes the change spans ' +
        '(dry-run, never writes); this tool applies them through the atomic Mutation Firewall: span-guarded, ' +
        'syntax-validated (no-regression), atomic write, char-level trace, rollback-safe. Use the explicit ' +
        'TS symbol tools (atomic_rename_symbol, atomic_change_signature) for type-aware refactors — ast-grep ' +
        'is syntactic and cannot resolve scopes/types.',
      inputSchema: {
        file: z.string(),
        pattern: z.string(),
        rewrite: z.string(),
        lang: z.string().optional(),
        strictness: z.enum(STRICTNESS).optional(),
        expectedSha256: z.string().optional(),
        preview: z.boolean().optional(),
        verify: z.enum(['typecheck', 'lint']).optional(),
        lock: z.boolean().optional(),
      },
    },
    async (a) => {
      try {
        const gate = await nativeReadyOrFail();
        if (gate) return gate;
        const { absPath, relPath } = resolveSafeTarget(a.file);
        const before = readUtf8(absPath);
        guardSha(before, a.expectedSha256);

        const res = await astEditDry({
          path: absPath,
          rewrites: { [a.pattern]: a.rewrite },
          lang: a.lang,
          strictness: a.strictness ?? 'smart',
          failOnParseError: true,
        });
        if (res.parseErrors && res.parseErrors.length > 0) {
          return fail(`source has parse errors, refusing to edit: ${res.parseErrors.join('; ')}`);
        }
        const changes: AstReplaceChange[] = (res.changes ?? []).filter((c) => path.resolve(REPO_ROOT, c.path) === absPath || c.path === absPath || c.path === relPath);
        if (changes.length === 0) {
          return ok({ changed: false, totalReplacements: 0, message: 'pattern matched nothing in this file' });
        }

        // byte (UTF-8) offsets -> UTF-16 char offsets; span-guard each change.
        const buf = Buffer.from(before, 'utf8');
        const specs: TextEditSpec[] = [];
        for (const c of changes) {
          const charStart = buf.subarray(0, c.byteStart).toString('utf8').length;
          const charEnd = buf.subarray(0, c.byteEnd).toString('utf8').length;
          const span = before.slice(charStart, charEnd);
          if (span !== c.before) {
            return fail(
              `span guard failed (stale/inconsistent native offsets) at byte ${c.byteStart}: ` +
                `expected ${JSON.stringify(c.before)} but source span is ${JSON.stringify(span)}`,
            );
          }
          specs.push({ start: offsetToPos(before, charStart), end: offsetToPos(before, charEnd), newText: c.after });
        }

        const result = applyEdits(absPath, before, specs);
        return commit(
          relPath,
          absPath,
          before,
          result,
          {
            operator: 'atomic_ast_edit',
            engine: 'web-tree-sitter ast-grep',
            pattern: a.pattern,
            rewrite: a.rewrite,
            lang: a.lang ?? '(inferred)',
            replacements: specs.length,
            validationLanguage: result.validation.language,
          },
          a.preview ?? false,
          a.verify,
          a.lock,
        );
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );

  // Surface the universal-engine capability for discovery.
  server.registerTool(
    'atomic_native_status',
    {
      title: 'Universal engine status — availability + supported languages',
      description:
        'Reports whether the universal (web-tree-sitter WASM) engine is loaded and the list of ' +
        'languages it can parse/edit structurally. Use to decide between atomic_ast_* (universal) and the ' +
        'TS-specific symbol tools.',
      inputSchema: {},
    },
    async () => {
      try {
        const ready = await ensureReady();
        return ok({
          available: ready && nativeAvailable(),
          languageCount: nativeLanguages().length,
          languages: nativeLanguages(),
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    'atomic_ast_rewrite',
    {
      title: 'Universal structural rewrite across MANY files (ast-grep, atomic transaction)',
      description:
        'Rewrite code structurally with an ast-grep pattern -> template across every matching file under ' +
        '`path` (file or directory), in every supported language. The native engine computes all change spans ' +
        '(dry-run, never writes); this tool applies them as ONE all-or-nothing firewall transaction: every ' +
        'file resolved through the protected-file guard, validated in memory, and only written if ALL pass ' +
        '(mid-write failure rolls back). Use atomic_ast_search first to preview the match set.',
      inputSchema: {
        path: z.string(),
        pattern: z.string(),
        rewrite: z.string(),
        lang: z.string().optional(),
        glob: z.string().optional(),
        strictness: z.enum(STRICTNESS).optional(),
        maxFiles: z.number().int().min(1).max(500).optional(),
        preview: z.boolean().optional(),
        proofOfIncorrectness: z
          .string()
          .optional()
          .describe('required when the structural rewrite removes/replaces bytes: proof that removed bytes are non-correct/negative'),
      },
    },
    async (a) => {
      try {
        const gate = await nativeReadyOrFail();
        if (gate) return gate;
        const searchAbs = path.resolve(REPO_ROOT, a.path);
        if (searchAbs !== REPO_ROOT && !searchAbs.startsWith(REPO_ROOT + path.sep)) {
          return fail(`path escapes repository root: ${a.path}`);
        }
        const res = await astEditDry({
          path: searchAbs,
          rewrites: { [a.pattern]: a.rewrite },
          lang: a.lang,
          glob: a.glob,
          strictness: a.strictness ?? 'smart',
          maxFiles: a.maxFiles ?? 200,
          failOnParseError: true,
        });
        if (res.parseErrors && res.parseErrors.length > 0) {
          return fail(`parse errors, refusing to edit: ${res.parseErrors.join('; ')}`);
        }
        if (!res.changes || res.changes.length === 0) {
          return ok({ changed: false, totalReplacements: 0, message: 'pattern matched nothing' });
        }
        const byFile = new Map<string, AstReplaceChange[]>();
        for (const c of res.changes) {
          const abs = path.isAbsolute(c.path) ? c.path : path.resolve(searchAbs, c.path);
          const list = byFile.get(abs) ?? [];
          list.push(c);
          byFile.set(abs, list);
        }
        const plan: MultiFileEntry[] = [];
        for (const [abs, changes] of byFile) {
          const before = readUtf8(abs);
          const buf = Buffer.from(before, 'utf8');
          const edits = [];
          for (const c of changes) {
            const cs = buf.subarray(0, c.byteStart).toString('utf8').length;
            const ce = buf.subarray(0, c.byteEnd).toString('utf8').length;
            const span = before.slice(cs, ce);
            if (span !== c.before) {
              return fail(
                `span guard failed in ${abs} at byte ${c.byteStart}: ` +
                  `expected ${JSON.stringify(c.before)} got ${JSON.stringify(span)}`,
              );
            }
            edits.push({ start: offsetToPos(before, cs), end: offsetToPos(before, ce), newText: c.after });
          }
          plan.push({ file: abs, edits });
        }
        return applyMultiFilePlan(plan, 'atomic_ast_edit', a.preview ?? false, a.proofOfIncorrectness);
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    'atomic_apply_workspace_edit',
    {
      title: 'Apply an LSP WorkspaceEdit through the firewall (semantic edits, all languages)',
      description:
        'Apply a Language-Server-Protocol WorkspaceEdit (e.g. the result of lsp_rename or a code action from ' +
        'the lsp-mesh MCP) atomically through the Mutation Firewall. This makes atomic-edit the single ' +
        'firewall-safe WRITER for type-aware semantic refactors computed by all of the 14 language servers: ' +
        'multi-file, validated, traced, rollback-safe. Division of labor: lsp-mesh COMPUTES the edit ' +
        '(scope/type-aware), atomic APPLIES it (sha256 + validate + protected-guard + rollback). Accepts ' +
        'either the `changes` map or `documentChanges` form. LSP positions are 0-based UTF-16.',
      inputSchema: {
        changes: z
          .record(
            z.string(),
            z.array(
              z.object({
                range: z.object({
                  start: z.object({ line: z.number().int().min(0), character: z.number().int().min(0) }),
                  end: z.object({ line: z.number().int().min(0), character: z.number().int().min(0) }),
                }),
                newText: z.string(),
              }),
            ),
          )
          .optional(),
        documentChanges: z
          .array(
            z.object({
              textDocument: z.object({ uri: z.string() }),
              edits: z.array(
                z.object({
                  range: z.object({
                    start: z.object({ line: z.number().int().min(0), character: z.number().int().min(0) }),
                    end: z.object({ line: z.number().int().min(0), character: z.number().int().min(0) }),
                  }),
                  newText: z.string(),
                }),
              ),
            }),
          )
          .optional(),
        preview: z.boolean().optional(),
        proofOfIncorrectness: z
          .string()
          .optional()
          .describe('required when the workspace edit removes/replaces bytes: proof that removed bytes are non-correct/negative'),
      },
    },
    async (a) => {
      try {
        const uriToFile = (uri: string): string =>
          uri.startsWith('file://') ? decodeURIComponent(uri.slice('file://'.length)) : uri;
        type LspEdit = {
          range: { start: { line: number; character: number }; end: { line: number; character: number } };
          newText: string;
        };
        const toSpecs = (edits: LspEdit[]) =>
          edits.map((e) => ({
            start: { line: e.range.start.line + 1, column: e.range.start.character + 1 },
            end: { line: e.range.end.line + 1, column: e.range.end.character + 1 },
            newText: e.newText,
          }));
        const plan: MultiFileEntry[] = [];
        if (a.changes) {
          for (const [uri, edits] of Object.entries(a.changes)) {
            plan.push({ file: uriToFile(uri), edits: toSpecs(edits as LspEdit[]) });
          }
        }
        if (a.documentChanges) {
          for (const dc of a.documentChanges) {
            plan.push({ file: uriToFile(dc.textDocument.uri), edits: toSpecs(dc.edits as LspEdit[]) });
          }
        }
        if (plan.length === 0) return fail('workspace edit has no changes/documentChanges');
        return applyMultiFilePlan(plan, 'atomic_apply_workspace_edit', a.preview ?? false, a.proofOfIncorrectness);
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );
}
