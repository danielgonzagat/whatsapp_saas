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
import { matchesGlob, matchesGlobPart, globFindFiles } from './server-helpers-glob.js';
import { commitSemantic } from './server-helpers-commit-semantic.js';

export function registerToolsD(server: McpServer): void {
server.registerTool(
  'atomic_rename_symbol_cross_file',
  {
    title: 'Scope-correct rename across the whole project',
    description:
      'True semantic rename via the TypeScript language service (nearest tsconfig): renames the symbol ' +
      'at (line,column) and ALL its references across every file, respecting scope/shadowing. ' +
      'All-or-nothing: if even one touched file would break, NOTHING is written. This is the Kiro ' +
      "'use program analysis, not LLM guessing' operator. Supports preview.",
    inputSchema: {
      file: z.string(),
      line: z.number().int().min(1),
      column: z.number().int().min(1),
      newName: z.string().min(1),
      preview: z.boolean().optional().describe('dry-run: list files + refs, do not write'),
      includeStrings: z
        .boolean()
        .optional()
        .describe(
          'after TS rename, also do regex-based string replacement of oldName->newName across all repo text files',
        ),
    },
  },
  async (a) => {
    try {
      const { absPath, repoRoot } = resolveSafeTarget(a.file);
      const r = await renameSymbolCrossFile(absPath, repoRoot, a.line, a.column, a.newName);
      const bad = r.validations.filter((v) => !v.ok);
      if (bad.length > 0) {
        return fail(
          `rejected: rename would break ${bad.length} file(s): ` +
            bad.map((b) => `${b.file} (${b.introduced ?? 'syntax error'})`).join('; ') +
            ' — NOTHING written.',
        );
      }
      // every change target must also pass the governance guard in the same resolved root
      for (const rel of r.changes.keys()) resolveSafeTarget(path.join(repoRoot, rel));
      if (a.preview ?? false) {
        return ok({
          ok: true,
          preview: true,
          changed: false,
          symbol: r.symbol,
          references: r.totalReferences,
          files: [...r.changes.keys()],
        });
      }
      let stringReplacedCount = 0;
      const stringReplacedByKind: Record<string, number> = {};
      if (a.includeStrings) {
        const oldName = r.symbol;
        const regex = new RegExp(`\\b${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
        const excludeDirs = new Set(['node_modules', '.git', 'dist', 'build', '.atomic', '.next', 'coverage']);
        const walkDir = (dir: string): string[] => {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          const results: string[] = [];
          for (const entry of entries) {
            if (excludeDirs.has(entry.name)) continue;
            if (entry.name.startsWith('.') && !['.env', '.eslintrc', '.prettierrc'].includes(entry.name)) continue;
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              results.push(...walkDir(fullPath));
            } else if (entry.isFile()) {
              const ext = path.extname(entry.name).toLowerCase();
              const textExts = new Set([
                '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts',
                '.json', '.md', '.txt', '.html', '.css', '.yml', '.yaml',
                '.env', '.graphql', '.prisma', '.sql', '.sh', '.vue', '.svelte',
              ]);
              if (textExts.has(ext) || ext === '') {
                results.push(fullPath);
              }
            }
          }
          return results;
        };
        const allFiles = walkDir(repoRoot);
        for (const absFile of allFiles) {
          if (r.changes.has(path.relative(repoRoot, absFile))) continue;
          let content: string;
          try {
            content = fs.readFileSync(absFile, 'utf8');
          } catch {
            continue;
          }
          const newContent = content.replace(regex, a.newName);
          if (newContent === content) continue;
          if (content.length > 500 * 1024) continue;
          try {
            resolveSafeTarget(absFile);
          } catch {
            continue;
          }
          const validation = validate(
            path.relative(repoRoot, absFile),
            content,
            newContent,
          );
          if (!validation.ok) continue;
          const rel = path.relative(repoRoot, absFile);
          r.changes.set(rel, newContent);
          stringReplacedCount++;
          const ext = path.extname(rel).toLowerCase() || '(no-ext)';
          stringReplacedByKind[ext] = (stringReplacedByKind[ext] || 0) + 1;
        }
      }
      for (const [rel, content] of r.changes) {
        atomicWrite(path.join(repoRoot, rel), content);
      }
      log(
        `cross-file rename ${r.symbol}: ${r.changes.size} file(s), ${r.totalReferences} refs` +
          (stringReplacedCount > 0 ? `, ${stringReplacedCount} string-replaced` : ''),
      );
      return ok({
        ok: true,
        changed: true,
        symbol: r.symbol,
        references: r.totalReferences,
        files: [...r.changes.keys()],
        ...(stringReplacedCount > 0
          ? { stringReplacedCount, stringReplacedByKind }
          : {}),
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

}
