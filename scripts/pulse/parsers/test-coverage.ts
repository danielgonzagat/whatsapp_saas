/**
 * PULSE Parser 76: Test Coverage
 * Layer 11: Test Quality
 * Mode: DEEP (reads jest coverage evidence)
 *
 * CHECKS:
 * 1. Parses coverage-summary.json when coverage evidence is available
 * 2. Financial modules (checkout, wallet, billing, payment) must have ≥80% line coverage
 * 3. Core modules (auth, workspace, products, kyc) must have ≥60% line coverage
 * 4. Overall backend coverage must be ≥50% line coverage
 * 5. Frontend critical flows (checkout, auth) must have ≥60% coverage
 * 6. Reports which specific files are dragging coverage below threshold
 *
 * REQUIRES: PULSE_DEEP=1 and coverage output available, or PULSE_RUN_COVERAGE=force to refresh it
 * BREAK TYPES:
 *   COVERAGE_FINANCIAL_LOW(medium) — financial module coverage below 80%
 *   COVERAGE_CORE_LOW(medium)      — core module coverage below 60%
 */
import { safeJoin, safeResolve } from '../safe-path';
import * as path from 'path';
import { execSync } from 'child_process';
import type { Break, PulseConfig } from '../types';
import { pathExists, readTextFile } from '../safe-fs';

interface CoverageEntry {
  lines: { total: number; covered: number; pct: number };
  functions: { total: number; covered: number; pct: number };
  branches: { total: number; covered: number; pct: number };
  statements: { total: number; covered: number; pct: number };
}

type CoverageSummary = Record<string, CoverageEntry>;

const FINANCIAL_PATH_RE = /checkout|wallet|billing|payment|kloel/i;
const CORE_PATH_RE = /auth|workspace|products|kyc/i;

function readCoverage(dir: string): CoverageSummary | null {
  const summaryPath = safeJoin(dir, 'coverage', 'coverage-summary.json');
  if (!pathExists(summaryPath)) {
    return null;
  }
  try {
    return JSON.parse(readTextFile(summaryPath, 'utf8')) as CoverageSummary;
  } catch {
    return null;
  }
}

function runCoverage(dir: string): void {
  if (process.env.PULSE_RUN_COVERAGE !== 'force') {
    return;
  }
  try {
    execSync('npx jest --coverage --coverageReporters=json-summary --passWithNoTests --silent', {
      cwd: dir,
      timeout: 30_000,
      stdio: 'ignore',
    });
  } catch {
    // Jest exits non-zero when tests fail; we still get the coverage file
  }
}

/** Check test coverage. */
export function checkTestCoverage(config: PulseConfig): Break[] {
  if (!process.env.PULSE_DEEP) {
    return [];
  }
  const breaks: Break[] = [];

  // CHECK 1-4: Backend coverage
  runCoverage(config.backendDir);
  const backendCoverage = readCoverage(config.backendDir);

  if (!backendCoverage) {
    breaks.push({
      type: 'COVERAGE_CORE_LOW',
      severity: 'medium',
      file: 'backend/coverage/coverage-summary.json',
      line: 0,
      description: 'Backend coverage report not found — coverage evidence is missing',
      detail:
        'No coverage-summary.json found; run coverage separately or set PULSE_RUN_COVERAGE=force to refresh it during PULSE.',
    });
    return breaks;
  }

  for (const [filePath, entry] of Object.entries(backendCoverage)) {
    if (filePath === 'total') {
      continue;
    }
    const relPath = path.relative(
      config.rootDir,
      filePath.startsWith('/') ? filePath : safeJoin(config.backendDir, filePath),
    );
    const pct = entry.lines.pct;

    if (FINANCIAL_PATH_RE.test(filePath)) {
      if (pct < 80) {
        breaks.push({
          type: 'COVERAGE_FINANCIAL_LOW',
          severity: 'medium',
          file: relPath,
          line: 0,
          description: `Financial module line coverage ${pct.toFixed(1)}% — minimum required is 80%`,
          detail: `${entry.lines.covered}/${entry.lines.total} lines covered in ${path.basename(filePath)}`,
        });
      }
    } else if (CORE_PATH_RE.test(filePath)) {
      if (pct < 60) {
        breaks.push({
          type: 'COVERAGE_CORE_LOW',
          severity: 'medium',
          file: relPath,
          line: 0,
          description: `Core module line coverage ${pct.toFixed(1)}% — minimum required is 60%`,
          detail: `${entry.lines.covered}/${entry.lines.total} lines covered in ${path.basename(filePath)}`,
        });
      }
    }
  }

  // CHECK: Overall backend total coverage
  const total = backendCoverage['total'];
  if (total && total.lines.pct < 50) {
    breaks.push({
      type: 'COVERAGE_CORE_LOW',
      severity: 'medium',
      file: 'backend/',
      line: 0,
      description: `Overall backend line coverage ${total.lines.pct.toFixed(1)}% — minimum required is 50%`,
      detail: `${total.lines.covered}/${total.lines.total} lines covered across entire backend`,
    });
  }

  // CHECK 5: Frontend coverage for critical flows
  runCoverage(config.frontendDir);
  const frontendCoverage = readCoverage(config.frontendDir);

  if (frontendCoverage) {
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
      if (pct < 60) {
        breaks.push({
          type: 'COVERAGE_CORE_LOW',
          severity: 'medium',
          file: relPath,
          line: 0,
          description: `Frontend critical flow coverage ${pct.toFixed(1)}% — minimum required is 60%`,
          detail: `${entry.lines.covered}/${entry.lines.total} lines covered in ${path.basename(filePath)}`,
        });
      }
    }
  }

  // TODO: Implement when infrastructure available
  // - Branch coverage thresholds
  // - Function coverage thresholds
  // - Trend comparison with previous run

  return breaks;
}
