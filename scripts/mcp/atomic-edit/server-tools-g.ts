import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { validate, type ValidationResult, computeZones } from './engine.js';
import { resolveSafeTarget } from './guard.js';
import { buildTrace, writeTrace } from './trace.js';
import { characterDiff } from './advanced.js';
import { atomicWrite, readUtf8, normalizeAllowedPath, relPathAllowed, changedSpanMetrics, normalizeEslintDryRunArgs, requireEslintDryRunArgs, parseEslintJson, type EslintDryRunResult } from './server-helpers-io.js';
import { packageVerificationPlan } from './server-helpers-verify.js';
import { buildLintResidueActionCandidates, applyKnownLintResidueFixes, type KnownLintResidueFix } from './server-helpers-lint-fix.js';
import { ok, fail } from './server-helpers-result.js';

export function registerToolsG(server: McpServer): void {
server.registerTool(
  'atomic_apply_eslint_dry_run_fixes',
  {
    title: 'Apply ESLint --fix-dry-run output as an atomic transaction',
    description:
      'Runs ESLint in non-mutating --fix-dry-run --format json mode, then applies the proposed fixed file outputs through the atomic transaction path. Direct apply is already all-or-nothing; use preview only when the human asks or the allowed path is ambiguous. ESLint never writes directly; every file is governance-guarded, syntax-validated, traced with preservation topology, and written all-or-nothing.',
    inputSchema: {
      cwd: z
        .string()
        .default('.')
        .describe('repo-relative or absolute directory where npx eslint should run'),
      args: z
        .array(z.string())
        .min(1)
        .describe('eslint args; must include --fix-dry-run and --format json; --fix is refused'),
      allowedPaths: z
        .array(z.string())
        .min(1)
        .describe(
          'repo-relative paths or absolute paths inside the selected repo/worktree that the analyzer is allowed to change, e.g. ["worker"]',
        ),
      preview: z
        .boolean()
        .optional()
        .describe(
          'dry-run only: use when a human asked for preview or scope is ambiguous; direct apply is already validated and all-or-nothing',
        ),
      applyKnownResidueFixes: z
        .boolean()
        .optional()
        .describe(
          'default true: also apply safe preservation-topology fixes for known remaining no-unused-vars anchors such as envBackup/mailEnvBackup/emptyDemographics',
        ),
    },
  },
  async (a) => {
    try {
      const preview = a.preview ?? false;
      const applyKnownResidueFixesEnabled = a.applyKnownResidueFixes ?? true;
      const eslintArgs = normalizeEslintDryRunArgs(a.args);
      requireEslintDryRunArgs(eslintArgs);
      const cwdTarget = resolveSafeTarget(a.cwd ?? '.');
      if (!fs.existsSync(cwdTarget.absPath) || !fs.statSync(cwdTarget.absPath).isDirectory()) {
        return fail(`cwd is not a directory: ${a.cwd ?? '.'}`);
      }
      const allowedPaths = a.allowedPaths.map((allowedPath) =>
        normalizeAllowedPath(allowedPath, cwdTarget.repoRoot),
      );
      const verificationPlan = packageVerificationPlan(
        cwdTarget.repoRoot,
        cwdTarget.relPath || '.',
        allowedPaths,
      );
      const recommendedVerification = verificationPlan.commands;
      const run = childProcess.spawnSync('npx', ['eslint', ...eslintArgs], {
        cwd: cwdTarget.absPath,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 64 * 1024 * 1024,
      });
      const stdout = run.stdout ?? '';
      const stderr = run.stderr ?? '';
      if (run.error) {
        return fail(`eslint dry-run failed to start: ${run.error.message}`);
      }
      if (run.status !== 0 && run.status !== 1) {
        return fail(
          `eslint dry-run failed with status ${String(run.status)}: ${stderr.slice(0, 2000)}`,
        );
      }
      const results = parseEslintJson(stdout);
      const staged: {
        relPath: string;
        absPath: string;
        repoRoot: string;
        before: string;
        newText: string;
        metrics: ReturnType<typeof changedSpanMetrics>;
        validation: ValidationResult;
        messages: EslintDryRunResult['messages'];
        knownResidueFixes: KnownLintResidueFix[];
      }[] = [];
      for (const result of results) {
        const fileInput = path.isAbsolute(result.filePath)
          ? result.filePath
          : path.join(cwdTarget.absPath, result.filePath);
        const target = resolveSafeTarget(fileInput);
        if (target.repoRoot !== cwdTarget.repoRoot) {
          return fail(`eslint proposed a file outside the selected repo root: ${result.filePath}`);
        }
        if (!relPathAllowed(target.relPath, allowedPaths)) {
          return fail(
            `eslint proposed ${target.relPath}, outside allowedPaths=${JSON.stringify(allowedPaths)}`,
          );
        }
        const before = readUtf8(target.absPath);
        const analyzerText = typeof result.output === 'string' ? result.output : before;
        const residueFix = applyKnownResidueFixesEnabled
          ? applyKnownLintResidueFixes(target.relPath, analyzerText, result.messages)
          : { text: analyzerText, applied: [] as KnownLintResidueFix[] };
        if (before === residueFix.text) continue;
        const validation = validate(target.relPath, before, residueFix.text);
        if (!validation.ok) {
          return fail(
            `eslint dry-run output refused for ${target.relPath}: syntax regression ` +
              `${validation.before}->${validation.after}. ${validation.introduced ?? ''}`,
          );
        }
        staged.push({
          relPath: target.relPath,
          absPath: target.absPath,
          repoRoot: target.repoRoot,
          before,
          newText: residueFix.text,
          metrics: changedSpanMetrics(before, residueFix.text),
          validation,
          messages: result.messages,
          knownResidueFixes: residueFix.applied,
        });
      }
      const remainingMessages = results.reduce(
        (sum, result) => sum + (result.messages?.length ?? 0),
        0,
      );
      const filePreviewLimit = 1;
      const filesAll = staged.map((item) => ({
        file: item.relPath,
        changed: true,
        intentionChars: item.metrics.changedChars,
        lineRewriteSurfaceChars: item.metrics.lineSurfaceChars,
        expansionFactorAvoided: item.metrics.expansionFactor,
        remainingMessages: item.messages?.length ?? 0,
        knownResidueFixes: item.knownResidueFixes,
        knownResidueFixesCount: item.knownResidueFixes.length,
      }));
      const files = filesAll.slice(0, filePreviewLimit);
      const filesTotal = filesAll.length;
      const filesOmitted = Math.max(0, filesTotal - files.length);
      const aggregateMetrics = filesAll.reduce(
        (acc, item) => ({
          intentionChars: acc.intentionChars + item.intentionChars,
          lineRewriteSurfaceChars: acc.lineRewriteSurfaceChars + item.lineRewriteSurfaceChars,
          remainingMessages: acc.remainingMessages + item.remainingMessages,
        }),
        { intentionChars: 0, lineRewriteSurfaceChars: 0, remainingMessages: 0 },
      );
      const knownResidueFixesApplied = staged.flatMap((item) => item.knownResidueFixes);
      const unresolvedResidueMessages = Math.max(
        0,
        remainingMessages - knownResidueFixesApplied.length,
      );
      const residueActionCandidatesAll =
        unresolvedResidueMessages > 0
          ? buildLintResidueActionCandidates(results, cwdTarget.absPath)
          : [];
      const residueActionCandidates = residueActionCandidatesAll.slice(0, 10);
      const residueActionCandidatesTotal = residueActionCandidatesAll.length;
      const residueActionCandidatesOmitted = Math.max(
        0,
        residueActionCandidatesTotal - residueActionCandidates.length,
      );
      const summarize = (headline: string, traceRefs: string[] = []): string => {
        const tracePreviewLimit = unresolvedResidueMessages > 0 ? 3 : 0;
        const tracePreview = traceRefs
          .slice(0, tracePreviewLimit)
          .map((ref) => `- ${ref}`)
          .join('\n');
        const omittedTraceCount = Math.max(0, traceRefs.length - tracePreviewLimit);
        const traceBlock =
          traceRefs.length > 0
            ? `\nTrace proof: ${traceRefs.length} trace(s) written${tracePreview ? `\n${tracePreview}` : ''}${
                omittedTraceCount > 0
                  ? `\n- ${omittedTraceCount} trace(s) available under .atomic/traces`
                  : ''
              }`
            : '';
        const residuePreview = residueActionCandidates
          .slice(0, 3)
          .map(
            (candidate) =>
              `- ${String(candidate.file)}:${String(candidate.line ?? '?')} ${String(candidate.preferredAtomicAction)} (${String(candidate.topology)})`,
          )
          .join('\n');
        const residueGuidance =
          unresolvedResidueMessages > 0
            ? `\nResidual lint guidance:\n- For unused variables named envBackup/mailEnvBackup/*fixture*, first check whether they encode test isolation; prefer using them over deletion when that preserves intent.${
                residuePreview ? `\nCandidate atomic actions:\n${residuePreview}` : ''
              }`
            : '';
        if (unresolvedResidueMessages === 0 && traceRefs.length > 0) {
          return `✅ Known residue fixes applied: ${knownResidueFixesApplied.length}; Unresolved residue after known fixes: 0; files=${staged.length}; traces=${traceRefs.length}; no-diff.`;
        }
        return (
          `${headline}\n\n` +
          `Intention: apply ESLint dry-run fixes as one verified atomic transaction.\n` +
          `Command: npx eslint ${eslintArgs.map((arg) => JSON.stringify(arg)).join(' ')}\n` +
          `Cwd: ${cwdTarget.relPath || '.'}\n` +
          `Verification package: ${verificationPlan.packageRelPath}\n` +
          `Files changed: ${staged.length}\n` +
          `Remaining analyzer messages before known residue fixes: ${remainingMessages}\n` +
          `Known residue fixes applied: ${knownResidueFixesApplied.length}\n` +
          `Unresolved residue after known fixes: ${unresolvedResidueMessages}\n` +
          `Validation:\n` +
          `- analyzer mode: --fix-dry-run JSON only\n` +
          `- direct analyzer writes: none\n` +
          `- syntax: ok\n` +
          `- protected file: no\n` +
          `- transaction: all-or-nothing\n` +
          `Required package proof before declaring done:\n` +
          `${recommendedVerification.map((cmd) => `- ${cmd}`).join('\n')}` +
          residueGuidance +
          traceBlock
        );
      };
      if (preview || staged.length === 0) {
        const summaryForHuman = summarize(
          preview
            ? '✅ ESLint atomic analyzer transaction preview'
            : '✅ ESLint atomic analyzer transaction: no changes',
        );
        return ok({
          ok: true,
          preview,
          transaction: true,
          changed: false,
          summaryForHuman,
          summary: summaryForHuman,
          files,
          filesTotal,
          filesOmitted,
          aggregateMetrics,
          knownResidueFixesApplied,
          knownResidueFixesAppliedTotal: knownResidueFixesApplied.length,
          remainingMessages,
          residueActionCandidates,
          residueActionCandidatesTotal,
          residueActionCandidatesOmitted,
          analyzerExitStatus: run.status,
          verificationPackage: verificationPlan.packageRelPath,
          recommendedVerification,
          lintResidueGuidance:
            unresolvedResidueMessages > 0
              ? 'Prefer using existing envBackup/mailEnvBackup/*fixture* declarations when they encode test isolation instead of deleting them.'
              : undefined,
        });
      }
      const written: { absPath: string; before: string }[] = [];
      try {
        for (const item of staged) {
          atomicWrite(item.absPath, item.newText);
          written.push({ absPath: item.absPath, before: item.before });
        }
      } catch (writeErr) {
        for (const item of written) {
          try {
            atomicWrite(item.absPath, item.before);
          } catch {
            /* best-effort rollback; report original error below */
          }
        }
        return fail(
          `eslint atomic transaction write failed; rolled back ${written.length} file(s): ` +
            (writeErr instanceof Error ? writeErr.message : String(writeErr)),
        );
      }
      const traceRefs: string[] = [];
      for (const item of staged) {
        const itemZones = computeZones(item.before, item.newText);
        const trace = buildTrace({
          file: item.relPath,
          repoRoot: item.repoRoot,
          operator: 'atomic_apply_eslint_dry_run_fixes',
          before: item.before,
          newText: item.newText,
          inlinePreview: characterDiff(item.before, item.newText, item.relPath),
          validation: {
            language: item.validation.language,
            before: item.validation.before,
            after: item.validation.after,
          },
          preservedZones: itemZones.preservedZones,
          modifiedZones: itemZones.modifiedZones,
          movementZones: itemZones.movementZones,
          metrics: {
            changedChars: item.metrics.changedChars,
            lineRewriteSurfaceChars: item.metrics.lineSurfaceChars,
            expansionFactorAvoided: item.metrics.expansionFactor,
            bytesNet: item.newText.length - item.before.length,
          },
          targetUnit: 'eslint_dry_run_file_output',
          intention:
            'apply analyzer-proposed lint fixes without letting the analyzer write directly',
          semanticImpact: 'lint_fix_auto_applied',
        });
        const persisted = writeTrace(trace);
        traceRefs.push(
          persisted.tracePath ??
            `trace error for ${item.relPath}: ${persisted.traceWriteError ?? 'unknown'}`,
        );
      }
      const summaryForHuman = summarize('✅ ESLint atomic analyzer transaction applied', traceRefs);
      return ok(
        {
          ok: true,
          transaction: true,
          changed: true,
          summaryForHuman,
          summary: summaryForHuman,
          filesWritten: written.length,
          files,
          filesTotal,
          filesOmitted,
          aggregateMetrics,
          knownResidueFixesApplied,
          knownResidueFixesAppliedTotal: knownResidueFixesApplied.length,
          remainingMessages,
          residueActionCandidates,
          residueActionCandidatesTotal,
          residueActionCandidatesOmitted,
          analyzerExitStatus: run.status,
          verificationPackage: verificationPlan.packageRelPath,
          recommendedVerification,
          lintResidueGuidance:
            unresolvedResidueMessages > 0
              ? 'Prefer using existing envBackup/mailEnvBackup/*fixture* declarations when they encode test isolation instead of deleting them.'
              : undefined,
          traceRefs: traceRefs.slice(0, 5),
          traceRefsTotal: traceRefs.length,
          traceRefsOmitted: Math.max(0, traceRefs.length - 5),
        },
        { includeMachineJson: unresolvedResidueMessages > 0 },
      );
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

}
