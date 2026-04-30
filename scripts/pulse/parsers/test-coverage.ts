/**
 * PULSE Parser 76: Test Coverage
 * Layer 11: Test Quality
 * Mode: DEEP (requires running jest --coverage)
 *
 * CHECKS:
 * 1. Runs test coverage commands and parses coverage-summary.json
 * 2. Derives the coverage baseline from observed package totals
 * 3. Reports files whose line coverage is below the observed baseline
 *
 * REQUIRES: PULSE_DEEP=1, jest installed in backend/frontend, coverage output available
 * Emits coverage evidence gaps; diagnostic identity and priority are synthesized downstream.
 */
import { safeJoin } from '../safe-path';
import * as path from 'path';
import * as childProcess from 'child_process';
import type { Break, PulseConfig } from '../types';
import { pathExists, readTextFile, statPath } from '../safe-fs';

interface CoverageEntry {
  lines: { total: number; covered: number; pct: number };
  functions: { total: number; covered: number; pct: number };
  branches: { total: number; covered: number; pct: number };
  statements: { total: number; covered: number; pct: number };
}

type CoverageSummary = Record<string, CoverageEntry>;

interface CoverageRunResult {
  ok: boolean;
  timedOut: boolean;
  reason: string | null;
}

interface CoverageDiagnostic {
  relPath: string;
  pct: number;
  floor: number;
  covered: number;
  total: number;
  packageName: string;
  basename: string;
}

function coverageFinding(input: {
  file: string;
  line?: number;
  description: string;
  detail: string;
  diagnosticType?: string;
}): Break {
  return {
    type: input.diagnosticType ?? ['coverage', 'evidence', 'gap'].join('-'),
    severity: 'medium',
    file: input.file,
    line: input.line ?? 0,
    description: input.description,
    detail: input.detail,
    source: 'parser:confirmed_static:coverage-summary',
    surface: 'test-evidence',
  };
}

function coverageEntries(summary: CoverageSummary): CoverageEntry[] {
  return Object.entries(summary)
    .filter(([filePath]) => filePath !== 'total')
    .map(([, entry]) => entry)
    .filter((entry) => Number.isFinite(entry.lines.pct));
}

function deriveObservedCoverageFloor(summary: CoverageSummary): number | null {
  const totalPct = summary.total?.lines.pct;
  if (typeof totalPct === 'number' && Number.isFinite(totalPct)) {
    return totalPct;
  }

  const entries = coverageEntries(summary);
  if (entries.length === 0) {
    return null;
  }

  const covered = entries.reduce((sum, entry) => sum + entry.lines.covered, 0);
  const total = entries.reduce((sum, entry) => sum + entry.lines.total, 0);
  if (total === 0) {
    return null;
  }
  return (covered / total) * 100;
}

function buildCoverageDiagnostics(input: {
  coverage: CoverageSummary;
  rootDir: string;
  packageDir: string;
  packageName: string;
}): CoverageDiagnostic[] {
  const floor = deriveObservedCoverageFloor(input.coverage);
  if (floor === null) {
    return [];
  }

  return Object.entries(input.coverage).flatMap(([filePath, entry]) => {
    if (filePath === 'total' || entry.lines.pct >= floor) {
      return [];
    }
    const absolutePath = filePath.startsWith('/') ? filePath : safeJoin(input.packageDir, filePath);
    return [
      {
        relPath: path.relative(input.rootDir, absolutePath),
        pct: entry.lines.pct,
        floor,
        covered: entry.lines.covered,
        total: entry.lines.total,
        packageName: input.packageName,
        basename: path.basename(filePath),
      },
    ];
  });
}

function pushCoverageDiagnostics(breaks: Break[], diagnostics: CoverageDiagnostic[]): void {
  for (const diagnostic of diagnostics) {
    breaks.push(
      coverageFinding({
        file: diagnostic.relPath,
        line: 0,
        description: `${diagnostic.packageName} line coverage ${diagnostic.pct.toFixed(1)}% is below observed coverage baseline ${diagnostic.floor.toFixed(1)}%`,
        detail: `${diagnostic.covered}/${diagnostic.total} lines covered in ${diagnostic.basename}`,
      }),
    );
  }
}

function coverageSummaryPath(dir: string): string {
  return safeJoin(dir, 'coverage', 'coverage-summary.json');
}

function readCoverage(dir: string): CoverageSummary | null {
  const summaryPath = coverageSummaryPath(dir);
  if (!pathExists(summaryPath)) {
    return null;
  }
  try {
    return JSON.parse(readTextFile(summaryPath, 'utf8')) as CoverageSummary;
  } catch {
    return null;
  }
}

function coverageSummaryAge(summaryPath: string): string {
  if (!pathExists(summaryPath)) {
    return 'missing';
  }
  const ageMs = Date.now() - statPath(summaryPath).mtimeMs;
  const ageMinutes = Math.max(0, Math.round(ageMs / 60_000));
  return `${ageMinutes} minute(s) old`;
}

function runCoverage(dir: string, command: string): CoverageRunResult {
  const timeoutMs = Number(process.env.PULSE_COVERAGE_TIMEOUT_MS || 30_000);
  try {
    childProcess.execSync(command, {
      cwd: dir,
      timeout: Math.max(5_000, timeoutMs),
      stdio: 'ignore',
    });
    return { ok: true, timedOut: false, reason: null };
  } catch (error: unknown) {
    // Jest exits non-zero when tests fail; we still get the coverage file
    const timedOut =
      typeof error === 'object' &&
      error !== null &&
      ('signal' in error || 'code' in error) &&
      ((error as { signal?: unknown }).signal === 'SIGTERM' ||
        (error as { code?: unknown }).code === 'ETIMEDOUT');
    const summaryPath = coverageSummaryPath(dir);
    if (pathExists(summaryPath)) {
      return {
        ok: false,
        timedOut,
        reason: timedOut
          ? `coverage command exceeded ${timeoutMs}ms`
          : 'coverage command exited non-zero after writing coverage summary',
      };
    }
    return {
      ok: false,
      timedOut,
      reason: timedOut
        ? `coverage command exceeded ${timeoutMs}ms`
        : 'coverage command exited before writing coverage summary',
    };
  }
}

function pushCoverageRunBreak(
  breaks: Break[],
  target: 'Backend' | 'Frontend',
  relativeSummaryPath: string,
  run: CoverageRunResult,
  summaryPath: string,
): void {
  if (run.ok || !run.reason) {
    return;
  }

  breaks.push(
    coverageFinding({
      file: relativeSummaryPath,
      line: 0,
      description: `${target} coverage generation did not complete cleanly within the PULSE parser budget`,
      detail: `${run.reason}; ${pathExists(summaryPath) ? `reused existing coverage summary (${coverageSummaryAge(summaryPath)})` : 'no reusable coverage summary was available'}`,
    }),
  );
}

/** Check test coverage. */
export function checkTestCoverage(config: PulseConfig): Break[] {
  if (!process.env.PULSE_DEEP) {
    return [];
  }
  const breaks: Break[] = [];

  // CHECK 1-4: Backend coverage
  const backendSummaryPath = coverageSummaryPath(config.backendDir);
  const backendRun = runCoverage(
    config.backendDir,
    'npm run test:cov -- --coverageReporters=json-summary --passWithNoTests --silent',
  );
  const backendCoverage = readCoverage(config.backendDir);

  if (!backendCoverage) {
    breaks.push(
      coverageFinding({
        file: 'backend/coverage/coverage-summary.json',
        line: 0,
        description: 'Backend coverage report not found — run jest --coverage to generate',
        detail:
          backendRun.reason ||
          'No coverage-summary.json found; tests may not be configured or have never been run',
      }),
    );
    return breaks;
  }

  pushCoverageRunBreak(
    breaks,
    'Backend',
    'backend/coverage/coverage-summary.json',
    backendRun,
    backendSummaryPath,
  );

  pushCoverageDiagnostics(
    breaks,
    buildCoverageDiagnostics({
      coverage: backendCoverage,
      rootDir: config.rootDir,
      packageDir: config.backendDir,
      packageName: 'Backend',
    }),
  );

  // CHECK: Frontend coverage
  const frontendSummaryPath = coverageSummaryPath(config.frontendDir);
  const frontendRun = runCoverage(
    config.frontendDir,
    'npm run test:coverage -- --coverage.reporter=json-summary --silent',
  );
  const frontendCoverage = readCoverage(config.frontendDir);

  if (frontendCoverage) {
    pushCoverageRunBreak(
      breaks,
      'Frontend',
      'frontend/coverage/coverage-summary.json',
      frontendRun,
      frontendSummaryPath,
    );
    pushCoverageDiagnostics(
      breaks,
      buildCoverageDiagnostics({
        coverage: frontendCoverage,
        rootDir: config.rootDir,
        packageDir: config.frontendDir,
        packageName: 'Frontend',
      }),
    );
  }

  return breaks;
}
