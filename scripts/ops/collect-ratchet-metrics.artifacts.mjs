import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const pulseHealthPath = path.join(repoRoot, 'PULSE_HEALTH.json');
const pulseCertificatePath = path.join(repoRoot, 'PULSE_CERTIFICATE.json');
const pulseCodacyStatePath = path.join(repoRoot, 'PULSE_CODACY_STATE.json');
const ratchetBaselinePath = path.join(repoRoot, 'ratchet.json');
const coveragePackages = ['backend', 'frontend', 'worker'];
const deadCodeBreakTypes = new Set(['DEAD_EXPORT', 'DEAD_COMPONENT']);
const circularBreakTypes = new Set(['CIRCULAR_IMPORT', 'CIRCULAR_MODULE_DEPENDENCY']);
const antiHardcodeBreakTypes = new Set(['AI_PSEUDO_THINKING_HARDCODED']);
const visualContractBreakTypes = new Set([
  'VISUAL_CONTRACT_FONT_BELOW_MIN',
  'VISUAL_CONTRACT_HEX_OUTSIDE_TOKENS',
  'VISUAL_CONTRACT_EMOJI_UI',
  'VISUAL_CONTRACT_GENERIC_SPINNER',
]);

function createMetric(value, comparator, samples = [], extra = {}) {
  return {
    value,
    comparator,
    samples: samples.slice(0, 20),
    ...extra,
  };
}

function ensurePulseArtifacts({ refreshPulse = false, ciSafeMode = false } = {}) {
  if (!refreshPulse && existsSync(pulseHealthPath) && existsSync(pulseCertificatePath)) {
    return true;
  }

  if (ciSafeMode) {
    return false;
  }

  const result = spawnSync(
    process.execPath,
    [path.join(repoRoot, 'scripts', 'pulse', 'run.js'), '--report'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        PULSE_EXECUTION_TRACE_PATH:
          process.env.PULSE_EXECUTION_TRACE_PATH ||
          path.join(repoRoot, 'PULSE_EXECUTION_TRACE.json'),
      },
      maxBuffer: 64 * 1024 * 1024,
    },
  );

  if (result.status !== 0) {
    throw new Error(
      `PULSE refresh failed with exit code ${result.status ?? 1}.\n${result.stdout || ''}\n${result.stderr || ''}`.trim(),
    );
  }

  return true;
}

function readPulseArtifacts() {
  const health = JSON.parse(readFileSync(pulseHealthPath, 'utf8'));
  const certificate = JSON.parse(readFileSync(pulseCertificatePath, 'utf8'));
  return { health, certificate };
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

export function collectPulseMetrics({ refreshPulse = false } = {}) {
  const artifactsReady = ensurePulseArtifacts({
    refreshPulse,
    ciSafeMode: !refreshPulse && process.env.CI === 'true',
  });

  if (!artifactsReady) {
    const baseline = readRatchetBaseline();
    return {
      pulseScore: createMetric(Number(baseline.pulse_score_min || 0), 'min', [], {
        rawScore: null,
        environment: 'ci-baseline-fallback',
        fallback: 'ratchet.json',
      }),
      facadeCount: createMetric(Number(baseline.facade_count_max || 0), 'max'),
      deadCodeFiles: createMetric(Number(baseline.dead_code_files_max || 0), 'max'),
      orphanPrismaModels: createMetric(Number(baseline.orphan_prisma_models_max || 0), 'max'),
      circularImports: createMetric(Number(baseline.circular_imports_max || 0), 'max'),
      antiHardcodeBreaks: createMetric(Number(baseline.anti_hardcode_breaks_max || 0), 'max'),
      visualContractBreaks: createMetric(Number(baseline.visual_contract_breaks_max || 0), 'max'),
      browserStressPassRate: createMetric(
        Number(baseline.browser_stress_pass_rate_min || 0),
        'min',
        [],
        { executed: false },
      ),
    };
  }

  const { health, certificate } = readPulseArtifacts();
  const browserEvidence = certificate.evidenceSummary?.browser || {};
  const browserGateStatus = certificate.gates?.browserPass?.status;
  const browserPassRate =
    typeof browserEvidence.passRate === 'number'
      ? browserEvidence.passRate
      : browserGateStatus === 'pass' && browserEvidence.executed !== true
        ? 100
        : 0;
  const pulseStructuralScore = Number(
    certificate.rawScore ?? health.score ?? certificate.score ?? 0,
  );
  const deadCodeFiles = [
    ...new Set(
      (health.breaks || [])
        .filter((item) => deadCodeBreakTypes.has(item.type))
        .map((item) => item.file),
    ),
  ];
  const circularBreaks = (health.breaks || []).filter((item) =>
    circularBreakTypes.has(item.type),
  );
  const antiHardcodeBreaks = (health.breaks || []).filter((item) =>
    antiHardcodeBreakTypes.has(item.type),
  );
  const visualContractBreaks = (health.breaks || []).filter((item) =>
    visualContractBreakTypes.has(item.type),
  );

  return {
    pulseScore: createMetric(pulseStructuralScore, 'min', [], {
      certificationScore: Number(certificate.score || 0),
      rawScore: Number(certificate.rawScore || health.score || 0),
      environment: certificate.environment || 'unknown',
    }),
    facadeCount: createMetric(Number(health.stats?.facades || 0), 'max'),
    deadCodeFiles: createMetric(
      deadCodeFiles.length,
      'max',
      deadCodeFiles.slice(0, 20).map((file) => ({ file })),
    ),
    orphanPrismaModels: createMetric(Number(health.stats?.modelOrphans || 0), 'max'),
    circularImports: createMetric(
      circularBreaks.length,
      'max',
      circularBreaks.slice(0, 20).map((item) => ({
        file: item.file,
        line: item.line,
        content: item.description,
      })),
    ),
    antiHardcodeBreaks: createMetric(
      antiHardcodeBreaks.length,
      'max',
      antiHardcodeBreaks.slice(0, 20).map((item) => ({
        file: item.file,
        line: item.line,
        content: item.description,
      })),
    ),
    visualContractBreaks: createMetric(
      visualContractBreaks.length,
      'max',
      visualContractBreaks.slice(0, 20).map((item) => ({
        file: item.file,
        line: item.line,
        content: item.description,
      })),
    ),
    browserStressPassRate: createMetric(browserPassRate, 'min', [], {
      executed: Boolean(browserEvidence.executed),
      gateStatus: browserGateStatus || 'unknown',
    }),
  };
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
