/**
 * server-tools-native-io.ts — the read/search half of "nothing lives outside
 * atomic". Native-engine-backed perception tools that BEAT a shell Bash on
 * speed + structure, so the agent CHOOSES them (not by mandate):
 *
 *   atomic_grep    — native ripgrep (structured {path,lineNumber,line})
 *   atomic_glob    — native glob, gitignore-aware
 *   atomic_outline — tree-sitter code outline for any supported language
 *
 * These are READ-ONLY: the firewall degrades correctly — no write, no sha,
 * rollback is a no-op; the value is structured results + (future) provenance in
 * the trace ledger. Degrade honestly when the engine is unavailable (web-tree-
 * sitter or a grammar wasm failed to load): each tool fails with a clear message
 * and the agent falls back to Bash. The engine is pure WASM (runs everywhere).
 */
import * as path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { REPO_ROOT } from './guard.js';
import { readUtf8 } from './server-helpers-io.js';
import { ok, fail, type ToolOk } from './server-helpers-result.js';
import {
  ensureReady,
  nativeAvailable,
  nativeGrep,
  nativeGlob,
  summarize,
} from './native-bridge.js';

async function nativeReadyOrFail(alt: string): Promise<ToolOk | null> {
  const ready = await ensureReady();
  if (!ready || !nativeAvailable()) {
    return fail(
      `universal engine (web-tree-sitter) unavailable — ${alt}`,
    );
  }
  return null;
}

/** Resolve a repo-relative or absolute path and refuse escapes. Read-only, so no protected-file guard. */
function containedAbs(p: string): string | null {
  const abs = path.resolve(REPO_ROOT, p);
  if (abs !== REPO_ROOT && !abs.startsWith(REPO_ROOT + path.sep)) return null;
  return abs;
}

export function registerToolsNativeIo(server: McpServer): void {
  server.registerTool(
    'atomic_grep',
    {
      title: 'Native ripgrep search (structured, fast)',
      description:
        'Search file contents with a regex across the repo via the native ripgrep engine. Returns structured ' +
        'matches {path, lineNumber, line} — faster and more structured than a shell grep, gitignore-aware. ' +
        '`path` (file or dir) defaults to the repo root.',
      inputSchema: {
        pattern: z.string(),
        path: z.string().optional(),
        glob: z.string().optional(),
        type: z.string().optional(),
        ignoreCase: z.boolean().optional(),
        maxCount: z.number().int().min(1).max(2000).optional(),
        contextBefore: z.number().int().min(0).max(20).optional(),
        contextAfter: z.number().int().min(0).max(20).optional(),
      },
    },
    async (a) => {
      try {
        const gate = await nativeReadyOrFail('use a shell `grep`/`rg` instead.');
        if (gate) return gate;
        const abs = containedAbs(a.path ?? '.');
        if (!abs) return fail(`path escapes repository root: ${a.path}`);
        const res = await nativeGrep({
          pattern: a.pattern,
          path: abs,
          glob: a.glob,
          type: a.type,
          ignoreCase: a.ignoreCase,
          maxCount: a.maxCount ?? 200,
          contextBefore: a.contextBefore,
          contextAfter: a.contextAfter,
        });
        return ok({
          totalMatches: res.totalMatches,
          filesWithMatches: res.filesWithMatches,
          filesSearched: res.filesSearched,
          limitReached: res.limitReached,
          matches: res.matches,
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    'atomic_glob',
    {
      title: 'Native glob file discovery (gitignore-aware)',
      description:
        'Find files/dirs by glob pattern via the native engine, gitignore-aware. Returns {path, fileType}. ' +
        '`path` defaults to the repo root.',
      inputSchema: {
        pattern: z.string(),
        path: z.string().optional(),
        fileType: z.enum(['file', 'dir', 'symlink']).optional(),
        hidden: z.boolean().optional(),
        maxResults: z.number().int().min(1).max(5000).optional(),
      },
    },
    async (a) => {
      try {
        const gate = await nativeReadyOrFail('use a shell `find`/`ls` instead.');
        if (gate) return gate;
        const abs = containedAbs(a.path ?? '.');
        if (!abs) return fail(`path escapes repository root: ${a.path}`);
        const res = await nativeGlob({
          pattern: a.pattern,
          path: abs,
          fileType: a.fileType,
          hidden: a.hidden,
          maxResults: a.maxResults ?? 500,
        });
        return ok({ totalMatches: res.totalMatches, matches: res.matches });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    'atomic_outline',
    {
      title: 'Tree-sitter code outline (all supported languages)',
      description:
        'Structural outline of a source file via tree-sitter — for ANY supported language, not just TS. ' +
        'Returns {parsed, totalLines, language, segments:[{kind,startLine,endLine,text?}]}. Note: elided ' +
        'segments have NO text field (branch on kind). Prefer over reading the whole file when you only need ' +
        'the shape.',
      inputSchema: {
        file: z.string(),
        lang: z.string().optional(),
      },
    },
    async (a) => {
      try {
        const gate = await nativeReadyOrFail('read the file directly instead.');
        if (gate) return gate;
        const abs = containedAbs(a.file);
        if (!abs) return fail(`path escapes repository root: ${a.file}`);
        const code = readUtf8(abs);
        const rel = path.relative(REPO_ROOT, abs) || a.file;
        const res = await summarize({ code, path: rel, lang: a.lang });
        return ok({
          parsed: res.parsed,
          totalLines: res.totalLines,
          language: res.language,
          elided: res.elided,
          segments: res.segments,
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );
}
