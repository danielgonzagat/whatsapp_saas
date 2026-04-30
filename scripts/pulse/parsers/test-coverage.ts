/**
 * PULSE Parser 76: Test Coverage
 * Layer 11: Test Quality
 * Mode: DEEP (requires running jest --coverage)
 *
 * CHECKS:
 * 1. Runs jest --coverage --json in backend and parses coverage-summary.json
 * 2. Financial modules (checkout, wallet, billing, payment) must have ≥80% line coverage
 * 3. Core modules (auth, workspace, products, kyc) must have ≥60% line coverage
 * 4. Overall backend coverage must be ≥50% line coverage
 * 5. Frontend critical flows (checkout, auth) must have ≥60% coverage
 * 6. Reports which specific files are dragging coverage below threshold
 *
 * REQUIRES: PULSE_DEEP=1, jest installed in backend/frontend, coverage output available
 * Emits coverage evidence gaps; diagnostic identity and priority are synthesized downstream.
 */
import { safeJoin, safeResolve } from '../safe-path';
import * as path from 'path';
import { execSync } from 'child_process';
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

const FINANCIAL_PATH_SIGNAL = /checkout|wallet|billing|payment|kloel/i;
const CORE_PATH_SIGNAL = /auth|workspace|products|kyc/i;

function coverageFinding(input: {
  file: string;
  line?: number;
  description: string;
  detail: string;
}): Break {
  return {
    type: 'coverage-evidence-gap',
    severity: 'medium',
    file: input.file,
    line: input.line ?? 0,
    description: input.description,
    detail: input.detail,
    source: 'parser:confirmed_static:coverage-summary',
    surface: 'test-evidence',
  };
}

function deriveCoverageFloor(filePath: string, observedTotalPct: number | null): number {
  if (FINANCIAL_PATH_SIGNAL.test(filePath)) {
    return Math.max(80, observedTotalPct ?? 0);
  }
  if (CORE_PATH_SIGNAL.test(filePath)) {
    return Math.max(60, observedTotalPct ?? 0);
  }
  return Math.max(50, observedTotalPct ?? 0);
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
    execSync(command, {
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

  for (const [filePath, entry] of Object.entries(backendCoverage)) {
    if (filePath === 'total') {
      continue;
    }
    const relPath = path.relative(
      config.rootDir,
      filePath.startsWith('/') ? filePath : safeJoin(config.backendDir, filePath),
    );
    const pct = entry.lines.pct;

    const totalCoveragePct = backendCoverage.total?.lines.pct ?? null;
    const floor = deriveCoverageFloor(filePath, totalCoveragePct);
    if (FINANCIAL_PATH_SIGNAL.test(filePath)) {
      if (pct < floor) {
        breaks.push(
          coverageFinding({
            file: relPath,
            line: 0,
            description: `Financial module line coverage ${pct.toFixed(1)}% is below observed evidence floor ${floor.toFixed(1)}%`,
            detail: `${entry.lines.covered}/${entry.lines.total} lines covered in ${path.basename(filePath)}`,
          }),
        );
      }
    } else if (CORE_PATH_SIGNAL.test(filePath)) {
      if (pct < floor) {
        breaks.push(
          coverageFinding({
            file: relPath,
            line: 0,
            description: `Core module line coverage ${pct.toFixed(1)}% is below observed evidence floor ${floor.toFixed(1)}%`,
            detail: `${entry.lines.covered}/${entry.lines.total} lines covered in ${path.basename(filePath)}`,
          }),
        );
      }
    }
  }

  // CHECK: Overall backend total coverage
  const total = backendCoverage['total'];
  if (total && total.lines.pct < 50) {
    breaks.push(
      coverageFinding({
        file: 'backend/',
        line: 0,
        description: `Overall backend line coverage ${total.lines.pct.toFixed(1)}% — minimum required is 50%`,
        detail: `${total.lines.covered}/${total.lines.total} lines covered across entire backend`,
      }),
    );
  }

  // CHECK 5: Frontend coverage for critical flows
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
    const FRONTEND_CRITICAL_RE = /checkout|auth|login|signup/i;
    for (const [filePath, entry] of Object.entries(frontendCoverage)) {
      if (filePath === 'total') {
        continue;
      }
      if (!FRONTEND_CRITICAL_RE.test(filePath)) {
        continue;
      }
      const relPath = path.relative(
        config.rootDir,
        filePath.startsWith('/') ? filePath : safeJoin(config.frontendDir, filePath),
      );
      const pct = entry.lines.pct;
      const frontendFloor = Math.max(60, frontendCoverage.total?.lines.pct ?? 0);
      if (pct < frontendFloor) {
        breaks.push(
          coverageFinding({
            file: relPath,
            line: 0,
            description: `Frontend critical flow coverage ${pct.toFixed(1)}% is below observed evidence floor ${frontendFloor.toFixed(1)}%`,
            detail: `${entry.lines.covered}/${entry.lines.total} lines covered in ${path.basename(filePath)}`,
          }),
        );
      }
    }
  }

  // TODO: Implement when infrastructure available
  // - Branch coverage thresholds
  // - Function coverage thresholds
  // - Trend comparison with previous run

  return breaks;
}
