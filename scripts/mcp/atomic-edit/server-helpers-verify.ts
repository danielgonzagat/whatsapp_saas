import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveAllowedRootForAbsolutePath, REPO_ROOT } from './guard.js';
import {
  EslintDryRunResult,
  hasArg,
  normalizeEslintDryRunArgs,
  normalizeRepoRelPath,
  parseEslintJson,
  requireEslintDryRunArgs,
  shellPath,
  nearestPackageRelPath,
} from './server-helpers-io.js';

export function runPostEditVerify(
  relPath: string,
  absPath: string,
  repoRoot: string,
  verify: string,
): { kind: string; command: string; passed: boolean; summary: string } | null {
  const pkg = nearestPackageRelPath(repoRoot, relPath);
  if (!pkg) return null;
  const pkgDir = path.join(repoRoot, pkg);

  if (verify === 'typecheck') {
    try {
      childProcess.execSync(`npx tsc --noEmit`, {
        cwd: pkgDir,
        timeout: 30000,
        encoding: 'utf8',
        stdio: 'pipe',
      });
      return {
        kind: 'typecheck',
        command: `tsc --noEmit (${pkg})`,
        passed: true,
        summary: 'TypeScript typecheck passed',
      };
    } catch (e: unknown) {
      const err = e as { stderr?: Buffer | string; stdout?: Buffer | string };
      const stderr = (err.stderr || err.stdout || '').toString();
      return {
        kind: 'typecheck',
        command: `tsc --noEmit (${pkg})`,
        passed: false,
        summary: stderr.slice(0, 500),
      };
    }
  }

  if (verify === 'lint') {
    try {
      const result = childProcess.execSync(`npx eslint "${absPath}" --format json`, {
        timeout: 30000,
        encoding: 'utf8',
        stdio: 'pipe',
      });
      type EslintFileResult = { errorCount: number; warningCount: number };
      const issues = JSON.parse(result) as EslintFileResult[];
      const errorCount = issues.reduce((sum: number, f: EslintFileResult) => sum + f.errorCount, 0);
      const warningCount = issues.reduce(
        (sum: number, f: EslintFileResult) => sum + f.warningCount,
        0,
      );
      const passed = errorCount === 0;
      return {
        kind: 'lint',
        command: `eslint ${relPath}`,
        passed,
        summary: `${errorCount} errors, ${warningCount} warnings`,
      };
    } catch {
      return {
        kind: 'lint',
        command: `eslint ${relPath}`,
        passed: false,
        summary: 'ESLint execution failed',
      };
    }
  }

  return null;
}

export function packageVerificationPlan(
  repoRoot: string,
  cwdRelPath: string,
  allowedPaths: string[],
): { packageRelPath: string; commands: string[] } {
  const candidates = [...allowedPaths, cwdRelPath].filter(Boolean);
  const packageRelPath =
    candidates
      .map((candidate) => nearestPackageRelPath(repoRoot, candidate))
      .find((candidate): candidate is string => Boolean(candidate)) ?? '.';
  const prefix = packageRelPath !== '.' ? `npm --prefix ${shellPath(packageRelPath)}` : 'npm';
  return {
    packageRelPath,
    commands: [
      `${prefix} run lint:check`,
      `${prefix} run typecheck`,
      `${prefix} test`,
      `${prefix} run build`,
    ],
  };
}

export function unusedSymbolFromLintMessage(message?: string): string | undefined {
  return message?.match(
    /'([^']+)' is (?:assigned a value but never used|defined but never used)/,
  )?.[1];
}

