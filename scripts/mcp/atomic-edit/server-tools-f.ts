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
import { shaArg } from './server-helpers-schema.js';
import { matchesGlob, matchesGlobPart, globFindFiles } from './server-helpers-glob.js';
import { commitSemantic } from './server-helpers-commit-semantic.js';
import { applyMultiFilePlan, type MultiFileEntry } from './server-helpers-multifile.js';

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

}
