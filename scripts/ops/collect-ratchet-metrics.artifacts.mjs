import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const pulseCodacyStatePath = path.join(repoRoot, 'PULSE_CODACY_STATE.json');
const ratchetBaselinePath = path.join(repoRoot, 'ratchet.json');
const coveragePackages = ['backend', 'frontend', 'worker'];

function createMetric(value, comparator, samples = [], extra = {}) {
  return {
    value,
    comparator,
    samples: samples.slice(0, 20),
    ...extra,
  };
}

function readRatchetBaseline() {
  if (!existsSync(ratchetBaselinePath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(ratchetBaselinePath, 'utf8'));
    return parsed?.ratchet || {};
  } catch {
    return {};
  }
}

export function collectCoverageMetrics() {
  const pcts = { lines: [], branches: [] };
  const packageDetails = {};

  for (const pkg of coveragePackages) {
    const summaryPath = path.join(repoRoot, pkg, 'coverage', 'coverage-summary.json');
    if (!existsSync(summaryPath)) {
      packageDetails[pkg] = {
        lines: 'missing',
        branches: 'missing',
        reason: 'coverage-summary.json not found',
      };
      continue;
    }

    try {
      const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
      const total = summary.total || {};
      const linesPct = typeof total.lines?.pct === 'number' ? total.lines.pct : null;
      const branchesPct = typeof total.branches?.pct === 'number' ? total.branches.pct : null;

      packageDetails[pkg] = {
        lines: linesPct,
        branches: branchesPct,
        linesTotal: total.lines?.total ?? 0,
        linesCovered: total.lines?.covered ?? 0,
        branchesTotal: total.branches?.total ?? 0,
        branchesCovered: total.branches?.covered ?? 0,
      };

      if (linesPct !== null) {
        pcts.lines.push(linesPct);
      }
      if (branchesPct !== null) {
        pcts.branches.push(branchesPct);
      }
    } catch (error) {
      packageDetails[pkg] = {
        lines: 'error',
        branches: 'error',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const linesMin = pcts.lines.length > 0 ? Math.min(...pcts.lines) : 0;
  const branchesMin = pcts.branches.length > 0 ? Math.min(...pcts.branches) : 0;

  return {
    linesMin: createMetric(linesMin, 'min', [], { packageDetails }),
    branchesMin: createMetric(branchesMin, 'min', [], { packageDetails }),
  };
}

export function collectCodacyMetrics() {
  if (!existsSync(pulseCodacyStatePath)) {
    const fallback = readRatchetBaseline();
    return {
      total: createMetric(Number(fallback.codacy_total_issues_max || 0), 'max', [], {
        fallback: 'ratchet.json',
        reason: 'Codacy state artifact missing',
      }),
      high: createMetric(Number(fallback.codacy_high_severity_issues_max || 0), 'max'),
      medium: createMetric(Number(fallback.codacy_medium_severity_issues_max || 0), 'max'),
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(pulseCodacyStatePath, 'utf8'));
    const total = Number(parsed.totalIssues || 0);
    const bySeverity = parsed.bySeverity || {};
    const topFiles = Array.isArray(parsed.topFiles) ? parsed.topFiles : [];
    const topFileSamples = topFiles.slice(0, 20).map((entry) => ({
      file: entry.file,
      lines: entry.count,
    }));
    return {
      total: createMetric(total, 'max', topFileSamples, {
        syncedAt: parsed.syncedAt || null,
        apiTotal: parsed.totalIssuesFromApi ?? null,
      }),
      high: createMetric(Number(bySeverity.HIGH || 0), 'max'),
      medium: createMetric(Number(bySeverity.MEDIUM || 0), 'max'),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fallback = readRatchetBaseline();
    return {
      total: createMetric(Number(fallback.codacy_total_issues_max || 0), 'max', [], {
        fallback: 'ratchet.json',
        reason: `Codacy state artifact invalid: ${message}`,
      }),
      high: createMetric(Number(fallback.codacy_high_severity_issues_max || 0), 'max'),
      medium: createMetric(Number(fallback.codacy_medium_severity_issues_max || 0), 'max'),
    };
  }
}
