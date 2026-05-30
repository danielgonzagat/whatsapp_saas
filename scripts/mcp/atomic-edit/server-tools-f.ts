import * as childProcess from 'node:child_process';
import * as path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapRange, type WrapKind } from './engine.js';
import { resolveSafeTarget, REPO_ROOT } from './guard.js';
import { guardSha, readUtf8 } from './server-helpers-io.js';
import { ok, fail, commit } from './server-helpers-result.js';
import { shaArg } from './server-helpers-schema.js';
import { applyMultiFilePlan, type MultiFileEntry } from './server-helpers-multifile.js';
import { fileURLToPath } from 'node:url';

export function registerToolsF(server: McpServer): void {
server.registerTool(
  'atomic_wrap_range',
  {
    title: 'Wrap an exact range in try-catch / block / if',
    description:
      'Semantic refactor: wrap the code between (startLine,startColumn) and (endLine,endColumn) — ' +
      '1-based, end-exclusive — in a try/catch, a bare block, or an `if (condition)`. Re-indents the ' +
      'body, preserves base indent, syntax-validated + atomic. `if` requires an explicit condition ' +
      '(no behaviour is invented). One intention as one validated op instead of a hand line-rewrite.',
    inputSchema: {
      file: z.string().describe('repo-relative path'),
      startLine: z.number().int().min(1),
      startColumn: z.number().int().min(1),
      endLine: z.number().int().min(1),
      endColumn: z.number().int().min(1),
      kind: z.enum(['try-catch', 'block', 'if']),
      condition: z.string().optional().describe("required when kind='if' (e.g. 'user != null')"),
      ...shaArg,
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      guardSha(before, a.expectedSha256);
      const r = wrapRange(
        relPath,
        before,
        { line: a.startLine, column: a.startColumn },
        { line: a.endLine, column: a.endColumn },
        a.kind as WrapKind,
        a.condition,
      );
      return commit(relPath, absPath, before, r, { op: `wrap:${a.kind}` }, a.preview ?? false);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_transaction',
  {
    title: 'Apply a multi-file edit plan atomically (all-or-nothing)',
    description:
      'Apply ranged edits across MANY files as one transaction. Every file is validated (no-syntax-' +
      'regression) in memory BEFORE the write. If even one file fails validation the whole transaction is ' +
      'refused and nothing is written. If a write throws mid-flight, already-written files are rolled ' +
      'back to their pre-edit content. Use for one intention spanning files (schema+service+UI+test). ' +
      'Supports preview (dry-run, per-file atomicDiff).',
    inputSchema: {
      plan: z
        .array(
          z.object({
            file: z.string().describe('repo-relative path'),
            edits: z
              .array(
                z.object({
                  startLine: z.number().int().min(1),
                  startColumn: z.number().int().min(1),
                  endLine: z.number().int().min(1),
                  endColumn: z.number().int().min(1),
                  newText: z.string(),
                }),
              )
              .min(1),
          }),
        )
        .min(1)
        .describe('one entry per file; each with ≥1 non-overlapping ranged edit'),
      preview: z.boolean().optional().describe('dry-run: validate all, write nothing'),
    },
  },
  async (a) => {
    try {
      const plan: MultiFileEntry[] = a.plan.map((entry) => ({
        file: entry.file,
        edits: entry.edits.map((e) => ({
          start: { line: e.startLine, column: e.startColumn },
          end: { line: e.endLine, column: e.endColumn },
          newText: e.newText,
        })),
      }));
      return applyMultiFilePlan(plan, 'Atomic transaction', a.preview ?? false);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

  server.registerTool(
    'atomic_bypass_report',
    {
      title: 'Bypass-rate report — how often the agent left atomic for Bash/Edit',
      description:
        'Reads .atomic/bypass-ledger.jsonl and returns the bypass-rate: detectable opportunities where a ' +
        'factory/Bash tool was used though an atomic tool existed, split into silentlyAllowedBypasses (the ' +
        'signal to drive to zero) and preventedByDenyHook. The ledger is populated by bypass-observer-hook.mjs, ' +
        'wired into .claude/settings.json PreToolUse (owner-gated). Empty ledger -> 0 opportunities.',
      inputSchema: {
        since: z.number().int().optional().describe('only count records at/after this epoch-ms'),
      },
    },
    async (a) => {
      try {
        const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bypass-report.mjs');
        const flags = a.since ? `--json --since=${a.since}` : '--json';
        const out = childProcess.execSync(`node "${script}" ${flags}`, {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          timeout: 10000,
          stdio: 'pipe',
        });
        return ok(JSON.parse(out));
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );
}
