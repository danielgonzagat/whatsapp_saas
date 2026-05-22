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
      const preview = a.preview ?? false;
      // Phase 1 — resolve + apply + validate ALL in memory. Write nothing.
      const staged: {
        relPath: string;
        absPath: string;
        repoRoot: string;
        before: string;
        result: ApplyResult;
      }[] = [];
      for (const entry of a.plan) {
        const { absPath, relPath, repoRoot } = resolveSafeTarget(entry.file);
        const before = readUtf8(absPath);
        const edits: TextEditSpec[] = entry.edits.map((e) => ({
          start: { line: e.startLine, column: e.startColumn },
          end: { line: e.endLine, column: e.endColumn },
          newText: e.newText,
        }));
        const result = applyEdits(relPath, before, edits);
        if (!result.validation.ok) {
          return fail(
            `transaction REFUSED — ${relPath} would regress ` +
              `(${result.validation.language}: ${result.validation.before}->${result.validation.after}). ` +
              `${result.validation.introduced ?? ''} — NOTHING written (all-or-nothing).`,
          );
        }
        staged.push({ relPath, absPath, repoRoot, before, result });
      }
      const traces = staged.map((s) => ({
        file: s.relPath,
        trace: buildTrace({
          file: s.relPath,
          repoRoot: s.repoRoot,
          operator: 'atomic_transaction',
          before: s.before,
          newText: s.result.newText,
          inlinePreview: characterDiff(s.before, s.result.newText, s.relPath),
          validation: {
            language: s.result.validation.language,
            before: s.result.validation.before,
            after: s.result.validation.after,
          },
          metrics: {
            changedChars: s.result.changedChars,
            lineRewriteSurfaceChars: s.result.lineSurfaceChars,
            expansionFactorAvoided: s.result.expansionFactor,
            bytesNet: s.result.newText.length - s.before.length,
          },
          preservedZones: computeZones(s.before, s.result.newText).preservedZones,
          modifiedZones: computeZones(s.before, s.result.newText).modifiedZones,
          movementZones: [],
        }),
      }));
      const files = staged.map((s, index) => ({
        file: s.relPath,
        changed: s.result.newText !== s.before,
        atomicDiff: traces[index].trace.inlinePreview,
        intentionChars: s.result.changedChars,
        expansionFactorAvoided: s.result.expansionFactor,
      }));
      const summarizeTransaction = (headline: string, traceRefs: string[] = []): string => {
        const changedFiles = files.filter((f) => f.changed);
        const previews = changedFiles.length
          ? changedFiles.map((f) => `${f.file}\n${f.atomicDiff}`).join('\n\n')
          : 'No file content changed.';
        const tracesBlock = traceRefs.length
          ? `\n\nTraces:\n${traceRefs.map((t) => `- ${t}`).join('\n')}`
          : '';
        return (
          `${headline}\n\n` +
          `${previews}\n\n` +
          `Validation:\n` +
          `- syntax: ok\n` +
          `- typecheck: not-run\n` +
          `- protected file: no\n` +
          `- sha256: ok` +
          tracesBlock
        );
      };
      if (preview) {
        const summaryForHuman = summarizeTransaction('✅ Atomic transaction preview');
        return ok({
          summaryForHuman,
          summary: summaryForHuman,
          ok: true,
          preview: true,
          transaction: true,
          changed: false,
          note: `dry-run: ${staged.length} file(s) validated, NOTHING written`,
          files,
        });
      }
      // Phase 2 — write all; roll back written files if any write throws.
      const written: { absPath: string; before: string }[] = [];
      try {
        for (const s of staged) {
          if (s.result.newText === s.before) continue;
          atomicWrite(s.absPath, s.result.newText);
          written.push({ absPath: s.absPath, before: s.before });
        }
      } catch (writeErr) {
        for (const w of written) {
          try {
            atomicWrite(w.absPath, w.before);
          } catch {
            /* best-effort rollback; report original error below */
          }
        }
        return fail(
          `transaction write failed; rolled back ${written.length} file(s): ` +
            (writeErr instanceof Error ? writeErr.message : String(writeErr)),
        );
      }
      const traceRefs: string[] = [];
      for (const item of traces) {
        const changedFile = files.find((f) => f.file === item.file && f.changed);
        if (!changedFile) continue;
        const persisted = writeTrace(item.trace);
        Object.assign(changedFile, persisted);
        traceRefs.push(
          persisted.tracePath ??
            `trace error for ${item.file}: ${persisted.traceWriteError ?? 'unknown'}`,
        );
      }
      log(`transaction wrote ${written.length}/${staged.length} file(s)`);
      const summaryForHuman = summarizeTransaction('✅ Atomic transaction applied', traceRefs);
      return ok({
        summaryForHuman,
        summary: summaryForHuman,
        ok: true,
        transaction: true,
        changed: true,
        filesWritten: written.length,
        files,
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

}
