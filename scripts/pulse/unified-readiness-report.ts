#!/usr/bin/env ts-node

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

const ROOT_DIR = path.resolve(__dirname, '..', '..');

function safeRepoPath(...segments: string[]): string {
  const resolved = path.resolve(ROOT_DIR, ...segments);
  const boundary = ROOT_DIR + path.sep;
  if (resolved !== ROOT_DIR && !resolved.startsWith(boundary)) {
    throw new Error(`Path traversal detected: ${resolved} is outside repo root`);
  }
  return resolved;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function readJsonOptional<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  return readJson<T>(filePath);
}

// ── Source artifact schemas ─────────────────────────────────────────────────

interface PulseHealth {
  generatedAt: string;
  overall: { score: number; status: string; summary: Record<string, number> };
  observability: { score: number; status: string; summary: Record<string, number> };
  certification: { status: string; gaps: string[] };
}

interface PulseWorldState {
  generatedAt: string;
  executedScenarios: string[];
  pendingAsyncExpectations: string[];
  asyncExpectationsStatus: Array<{ scenarioId: string; expectation: string; status: string }>;
  sessions: Array<{
    kind: string;
    declaredScenarios: number;
    executedScenarios: number;
    passedScenarios: number;
  }>;
}

interface PulseCodacyState {
  syncedAt: string;
  totalIssues: number;
  bySeverity: Record<string, number>;
  byCategory: Record<string, number>;
  repositorySummary: {
    grade: number;
    gradeLetter: string;
    issuesCount: number;
    issuesPercentage: number;
  };
}

// ── Runtime check schemas ──────────────────────────────────────────────────

interface RuntimeCheckResult {
  pass: boolean;
  label: string;
  detail: string;
}

interface RuntimeChecks {
  build: RuntimeCheckResult;
  ciLastRun: RuntimeCheckResult;
  gitStatus: RuntimeCheckResult;
  testCoverage: RuntimeCheckResult;
  envFiles: RuntimeCheckResult;
  hooksIntegrity: RuntimeCheckResult;
}

// ── Output schemas ──────────────────────────────────────────────────────────

interface ChecklistItem {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'warn';
  detail: string;
  priority: 'P0' | 'P1' | 'P2';
}

interface ChecklistCategory {
  category: string;
  items: ChecklistItem[];
}

interface FinalProductionChecklist {
  generatedAt: string;
  sourceArtifacts: {
    pulseHealth: string;
    pulseWorldState: string;
    pulseCodacyState: string;
  };
  summary: { total: number; pass: number; fail: number; warn: number };
  categories: ChecklistCategory[];
}

interface CriticalGap {
  rank: number;
  issue: string;
  impact: string;
  fix: string;
}

interface ProductionReadinessAudit {
  generatedAt: string;
  pipeline: string;
  failures: string[];
  readinessStatus: string;
  healthScore: number;
  certificationStatus: string;
  codacySummary: {
    grade: string;
    totalIssues: number;
    highIssues: number;
    mediumIssues: number;
  };
  worldState: {
    totalScenarios: number;
    executedScenarios: number;
    pendingExpectations: number;
    missingEvidence: number;
    sessionSummary: Array<{ kind: string; passed: number; total: number }>;
  };
  runtimeChecks: RuntimeChecks;
  criticalGaps: CriticalGap[];
}

// ── Runtime checks ──────────────────────────────────────────────────────────

function checkBuildStatus(): RuntimeCheckResult {
  const backendDist = safeRepoPath('backend', 'dist');
  const frontendNext = safeRepoPath('frontend', '.next');
  const workerDist = safeRepoPath('worker', 'dist');
  const backendOk = existsSync(backendDist);
  const frontendOk = existsSync(frontendNext);
  const workerOk = existsSync(workerDist);
  const allOk = backendOk && frontendOk && workerOk;
  const missing: string[] = [];
  if (!backendOk) missing.push('backend/dist');
  if (!frontendOk) missing.push('frontend/.next');
  if (!workerOk) missing.push('worker/dist');
  return {
    pass: allOk,
    label: 'Build artifacts exist',
    detail: allOk
      ? 'backend/dist, frontend/.next, worker/dist all present'
      : `Missing: ${missing.join(', ')}`,
  };
}

function checkCiLastRun(): RuntimeCheckResult {
  try {
    const log = execSync('git log --oneline -20', {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      timeout: 5000,
    });
    const lines = log.trim().split('\n').filter(Boolean);
    const ciRelated = lines.filter(
      (l) =>
        l.includes('ci') ||
        l.includes('CI') ||
        l.includes('fix(build)') ||
        l.includes('fix(typecheck)'),
    );
    if (ciRelated.length > 0) {
      return {
        pass: false,
        label: 'Recent CI-related commits found',
        detail: `${ciRelated.length} CI-related commit(s) in last 20: ${ciRelated[0].substring(0, 72)}`,
      };
    }
    return {
      pass: true,
      label: 'No recent CI-related fix commits',
      detail: `Last 20 commits show no CI/build breakage patterns`,
    };
  } catch {
    return { pass: false, label: 'CI status unknown', detail: 'Could not read git log' };
  }
}

function checkGitStatus(): RuntimeCheckResult {
  try {
    const status = execSync('git status --porcelain', {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      timeout: 5000,
    });
    const lines = status.trim().split('\n').filter(Boolean);
    const untracked = lines.filter((l) => l.startsWith('??')).length;
    const modified = lines.length - untracked;
    if (lines.length === 0) {
      return { pass: true, label: 'Working tree clean', detail: 'No uncommitted changes' };
    }
    return {
      pass: false,
      label: 'Working tree dirty',
      detail: `${modified} modified/deleted, ${untracked} untracked file(s)`,
    };
  } catch {
    return { pass: false, label: 'Git status unknown', detail: 'Could not read git status' };
  }
}

function checkTestCoverage(): RuntimeCheckResult {
  const coveragePaths = [
    safeRepoPath('backend', 'coverage', 'coverage-summary.json'),
    safeRepoPath('frontend', 'coverage', 'coverage-summary.json'),
    safeRepoPath('worker', 'coverage', 'coverage-summary.json'),
  ];
  const found = coveragePaths.filter((p) => existsSync(p));
  if (found.length === 0) {
    return {
      pass: false,
      label: 'Test coverage unavailable',
      detail: 'No coverage-summary.json found in backend, frontend, or worker',
    };
  }
  try {
    const totals: number[] = [];
    for (const covPath of found) {
      const cov = readJson<{ total?: { lines?: { pct?: number } } }>(covPath);
      if (cov.total?.lines?.pct !== undefined) {
        totals.push(cov.total.lines.pct);
      }
    }
    if (totals.length === 0) {
      return {
        pass: false,
        label: 'Coverage data incomplete',
        detail: 'Found coverage files but no line percentage data',
      };
    }
    const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
    const pass = avg >= 60;
    return {
      pass,
      label: `Coverage ${pass ? 'adequate' : 'below threshold'}`,
      detail: `${totals.length} package(s) with coverage, average ${avg.toFixed(1)}% lines`,
    };
  } catch {
    return {
      pass: false,
      label: 'Coverage parse error',
      detail: 'Could not parse coverage summary files',
    };
  }
}

function checkEnvFiles(): RuntimeCheckResult {
  const envExample = safeRepoPath('.env.example');
  const backendEnv = safeRepoPath('backend', '.env.example');
  const frontendEnv = safeRepoPath('frontend', '.env.example');
  const allOk = existsSync(envExample) && existsSync(backendEnv) && existsSync(frontendEnv);
  const missing: string[] = [];
  if (!existsSync(envExample)) missing.push('.env.example');
  if (!existsSync(backendEnv)) missing.push('backend/.env.example');
  if (!existsSync(frontendEnv)) missing.push('frontend/.env.example');
  return {
    pass: allOk,
    label: 'Environment file templates exist',
    detail: allOk ? 'All .env.example files present' : `Missing: ${missing.join(', ')}`,
  };
}

function checkHooksIntegrity(): RuntimeCheckResult {
  const prePush = safeRepoPath('.husky', 'pre-push');
  const preCommit = safeRepoPath('.husky', 'pre-commit');
  const commitMsg = safeRepoPath('.husky', 'commit-msg');
  const allOk = existsSync(prePush) && existsSync(preCommit) && existsSync(commitMsg);
  const missing: string[] = [];
  if (!existsSync(prePush)) missing.push('.husky/pre-push');
  if (!existsSync(preCommit)) missing.push('.husky/pre-commit');
  if (!existsSync(commitMsg)) missing.push('.husky/commit-msg');
  return {
    pass: allOk,
    label: 'Git hooks integrity',
    detail: allOk ? 'All Husky hooks present' : `Missing: ${missing.join(', ')}`,
  };
}

function runAllRuntimeChecks(): RuntimeChecks {
  return {
    build: checkBuildStatus(),
    ciLastRun: checkCiLastRun(),
    gitStatus: checkGitStatus(),
    testCoverage: checkTestCoverage(),
    envFiles: checkEnvFiles(),
    hooksIntegrity: checkHooksIntegrity(),
  };
}

// ── Checklist builder ───────────────────────────────────────────────────────

function buildChecklistCategories(
  health: PulseHealth,
  worldState: PulseWorldState,
  codacy: PulseCodacyState,
  runtime: RuntimeChecks,
): ChecklistCategory[] {
  const categories: ChecklistCategory[] = [];

  // Build & CI
  const buildItems: ChecklistItem[] = [
    {
      id: 'build-artifacts',
      label: 'Build artifacts present for all packages',
      status: runtime.build.pass ? 'pass' : 'fail',
      detail: runtime.build.detail,
      priority: 'P0',
    },
    {
      id: 'ci-commits',
      label: 'No recent CI breakage commits',
      status: runtime.ciLastRun.pass ? 'pass' : 'warn',
      detail: runtime.ciLastRun.detail,
      priority: 'P1',
    },
    {
      id: 'git-clean',
      label: 'Working tree is clean',
      status: runtime.gitStatus.pass ? 'pass' : 'warn',
      detail: runtime.gitStatus.detail,
      priority: 'P2',
    },
  ];
  categories.push({ category: 'Build & CI', items: buildItems });

  // Testing
  const testItems: ChecklistItem[] = [
    {
      id: 'coverage',
      label: 'Test coverage meets threshold (>=60%)',
      status: runtime.testCoverage.pass ? 'pass' : 'fail',
      detail: runtime.testCoverage.detail,
      priority: 'P0',
    },
  ];
  categories.push({ category: 'Testing', items: testItems });

  // Environment
  const envItems: ChecklistItem[] = [
    {
      id: 'env-files',
      label: 'Environment template files present',
      status: runtime.envFiles.pass ? 'pass' : 'fail',
      detail: runtime.envFiles.detail,
      priority: 'P0',
    },
    {
      id: 'hooks',
      label: 'Git hooks integrity verified',
      status: runtime.hooksIntegrity.pass ? 'pass' : 'fail',
      detail: runtime.hooksIntegrity.detail,
      priority: 'P0',
    },
  ];
  categories.push({ category: 'Environment', items: envItems });

  // PULSE Health
  const healthScore = health.overall.score;
  const healthItems: ChecklistItem[] = [
    {
      id: 'pulse-score',
      label: 'PULSE health score >= 70',
      status: healthScore >= 70 ? 'pass' : 'fail',
      detail: `Current PULSE score: ${healthScore}/100 (${health.overall.status})`,
      priority: 'P0',
    },
    {
      id: 'pulse-certification',
      label: 'PULSE certification status is CERTIFIED',
      status: health.certification.status === 'CERTIFIED' ? 'pass' : 'fail',
      detail: `Status: ${health.certification.status}, gaps: ${health.certification.gaps.join(', ') || 'none'}`,
      priority: 'P0',
    },
    {
      id: 'observability',
      label: 'Observability coverage is adequate',
      status: health.observability.score >= 50 ? 'pass' : 'fail',
      detail: `Observability score: ${health.observability.score}, status: ${health.observability.status}`,
      priority: 'P1',
    },
  ];
  categories.push({ category: 'PULSE Health', items: healthItems });

  // World State
  const totalScenarios = worldState.sessions.reduce((a, s) => a + s.declaredScenarios, 0);
  const executedScenarios = worldState.sessions.reduce((a, s) => a + s.executedScenarios, 0);
  const passedScenarios = worldState.sessions.reduce((a, s) => a + s.passedScenarios, 0);
  const missingEvidence = worldState.asyncExpectationsStatus.filter(
    (e) => e.status === 'missing_evidence',
  ).length;

  const worldItems: ChecklistItem[] = [
    {
      id: 'scenario-execution',
      label: 'All declared scenarios are executed',
      status: executedScenarios >= totalScenarios ? 'pass' : 'fail',
      detail: `${executedScenarios}/${totalScenarios} scenarios executed`,
      priority: 'P1',
    },
    {
      id: 'scenario-passing',
      label: 'All executed scenarios pass',
      status: passedScenarios >= executedScenarios ? 'pass' : 'fail',
      detail: `${passedScenarios}/${executedScenarios} scenarios passing`,
      priority: 'P1',
    },
    {
      id: 'async-evidence',
      label: 'No missing async expectations evidence',
      status: missingEvidence === 0 ? 'pass' : 'fail',
      detail: `${missingEvidence} expectations with missing evidence`,
      priority: 'P1',
    },
  ];
  categories.push({ category: 'World State', items: worldItems });

  // Codacy
  const highIssues = codacy.bySeverity.HIGH ?? 0;
  const codacyItems: ChecklistItem[] = [
    {
      id: 'codacy-high',
      label: 'Zero HIGH-severity Codacy issues',
      status: highIssues === 0 ? 'pass' : 'fail',
      detail: `${highIssues} HIGH issues (${codacy.bySeverity.MEDIUM ?? 0} medium, ${codacy.bySeverity.LOW ?? 0} low)`,
      priority: 'P0',
    },
    {
      id: 'codacy-grade',
      label: 'Codacy grade is A',
      status: codacy.repositorySummary.gradeLetter === 'A' ? 'pass' : 'fail',
      detail: `Grade: ${codacy.repositorySummary.gradeLetter} (${codacy.repositorySummary.grade})`,
      priority: 'P1',
    },
    {
      id: 'codacy-security',
      label: 'Zero Codacy security issues',
      status: (codacy.byCategory.Security ?? 0) === 0 ? 'pass' : 'fail',
      detail: `${codacy.byCategory.Security ?? 0} security issues`,
      priority: 'P0',
    },
  ];
  categories.push({ category: 'Codacy', items: codacyItems });

  return categories;
}

function computeChecklistSummary(categories: ChecklistCategory[]): {
  total: number;
  pass: number;
  fail: number;
  warn: number;
} {
  let total = 0;
  let pass = 0;
  let fail = 0;
  let warn = 0;
  for (const cat of categories) {
    for (const item of cat.items) {
      total++;
      if (item.status === 'pass') pass++;
      else if (item.status === 'fail') fail++;
      else if (item.status === 'warn') warn++;
    }
  }
  return { total, pass, fail, warn };
}

// ── Critical gaps builder ───────────────────────────────────────────────────

function buildCriticalGaps(
  health: PulseHealth,
  worldState: PulseWorldState,
  codacy: PulseCodacyState,
  runtime: RuntimeChecks,
): CriticalGap[] {
  const gaps: CriticalGap[] = [];
  let rank = 0;

  if (!runtime.build.pass) {
    rank++;
    gaps.push({
      rank,
      issue: 'Build artifacts missing',
      impact: 'Cannot deploy without successful builds',
      fix: runtime.build.detail,
    });
  }

  if ((codacy.bySeverity.HIGH ?? 0) > 0) {
    rank++;
    gaps.push({
      rank,
      issue: `${codacy.bySeverity.HIGH} HIGH-severity Codacy issues remain`,
      impact: 'Code quality and potential security risks blocking production readiness',
      fix: 'Address HIGH Codacy issues, starting with Security and ErrorProne categories',
    });
  }

  if (health.certification.status !== 'CERTIFIED') {
    rank++;
    gaps.push({
      rank,
      issue: `PULSE certification is ${health.certification.status}`,
      impact: 'System lacks production certification evidence',
      fix: `Close certification gaps: ${health.certification.gaps.join(', ') || 'run full PULSE certify cycle'}`,
    });
  }

  const missingEvidence = worldState.asyncExpectationsStatus.filter(
    (e) => e.status === 'missing_evidence',
  ).length;
  if (missingEvidence > 0) {
    rank++;
    gaps.push({
      rank,
      issue: `${missingEvidence} async expectations have missing evidence`,
      impact: 'World state cannot be verified for key scenarios',
      fix: 'Run governed scenario evidence collection for pending expectations',
    });
  }

  const executedScenarios = worldState.sessions.reduce((a, s) => a + s.executedScenarios, 0);
  const passedScenarios = worldState.sessions.reduce((a, s) => a + s.passedScenarios, 0);
  if (executedScenarios > 0 && passedScenarios < executedScenarios) {
    rank++;
    gaps.push({
      rank,
      issue: `${executedScenarios - passedScenarios} scenarios executed but not passing`,
      impact: 'Key user flows may be broken',
      fix: 'Investigate and fix failing scenarios',
    });
  }

  if (!runtime.testCoverage.pass) {
    rank++;
    gaps.push({
      rank,
      issue: 'Test coverage below threshold',
      impact: 'Insufficient test coverage for production confidence',
      fix: 'Increase test coverage to >=60% across all packages',
    });
  }

  return gaps;
}

// ── Markdown report builder ─────────────────────────────────────────────────

function buildMarkdownReport(
  health: PulseHealth,
  worldState: PulseWorldState,
  codacy: PulseCodacyState,
  runtime: RuntimeChecks,
  checklist: FinalProductionChecklist,
  audit: ProductionReadinessAudit,
): string {
  const totalScenarios = worldState.sessions.reduce((a, s) => a + s.declaredScenarios, 0);
  const executedScenarios = worldState.sessions.reduce((a, s) => a + s.executedScenarios, 0);
  const passedScenarios = worldState.sessions.reduce((a, s) => a + s.passedScenarios, 0);
  const missingEvidence = worldState.asyncExpectationsStatus.filter(
    (e) => e.status === 'missing_evidence',
  ).length;

  const lines: string[] = [
    `# PULSE REPORT — ${audit.generatedAt}`,
    '',
    '## UNIFIED READINESS VERDICT',
    '',
    `- Pipeline: \`scripts/pulse/unified-readiness-report.ts\``,
    `- Health Score: ${health.overall.score}/100 (${health.overall.status})`,
    `- Certification: ${health.certification.status}`,
    `- Readiness Status: ${audit.readinessStatus}`,
    `- Codacy Grade: ${codacy.repositorySummary.gradeLetter} (${codacy.repositorySummary.grade})`,
    `- Checklist: ${checklist.summary.pass}/${checklist.summary.total} pass, ${checklist.summary.fail} fail, ${checklist.summary.warn} warn`,
    '',
    '## Runtime Checks',
    '',
    `| Check | Status | Detail |`,
    `|-------|--------|--------|`,
    `| Build Artifacts | ${runtime.build.pass ? 'PASS' : 'FAIL'} | ${runtime.build.detail} |`,
    `| CI Last Run | ${runtime.ciLastRun.pass ? 'PASS' : 'WARN'} | ${runtime.ciLastRun.detail} |`,
    `| Git Status | ${runtime.gitStatus.pass ? 'PASS' : 'WARN'} | ${runtime.gitStatus.detail} |`,
    `| Test Coverage | ${runtime.testCoverage.pass ? 'PASS' : 'FAIL'} | ${runtime.testCoverage.detail} |`,
    `| Env Files | ${runtime.envFiles.pass ? 'PASS' : 'FAIL'} | ${runtime.envFiles.detail} |`,
    `| Hooks Integrity | ${runtime.hooksIntegrity.pass ? 'PASS' : 'FAIL'} | ${runtime.hooksIntegrity.detail} |`,
    '',
    '## Codacy State',
    '',
    `- Total Issues: ${codacy.totalIssues}`,
    `- HIGH: ${codacy.bySeverity.HIGH ?? 0}`,
    `- MEDIUM: ${codacy.bySeverity.MEDIUM ?? 0}`,
    `- LOW: ${codacy.bySeverity.LOW ?? 0}`,
    `- Security: ${codacy.byCategory.Security ?? 0}`,
    `- Synced: ${codacy.syncedAt}`,
    '',
    '## World State',
    '',
    `- Scenarios: ${executedScenarios}/${totalScenarios} executed, ${passedScenarios}/${executedScenarios} passing`,
    `- Missing Evidence: ${missingEvidence} expectations`,
    `- Generated: ${worldState.generatedAt}`,
    '',
    '### Session Summary',
    '',
    `| Actor | Declared | Executed | Passed |`,
    `|-------|----------|----------|--------|`,
  ];

  for (const session of worldState.sessions) {
    lines.push(
      `| ${session.kind} | ${session.declaredScenarios} | ${session.executedScenarios} | ${session.passedScenarios} |`,
    );
  }

  lines.push(
    '',
    '## Checklist Summary',
    '',
  );

  for (const cat of checklist.categories) {
    lines.push(`### ${cat.category}`, '');
    for (const item of cat.items) {
      const icon = item.status === 'pass' ? 'PASS' : item.status === 'fail' ? 'FAIL' : 'WARN';
      lines.push(`- [${icon}] **${item.label}** (${item.priority}): ${item.detail}`);
    }
    lines.push('');
  }

  lines.push(
    '## Critical Gaps',
    '',
  );

  if (audit.criticalGaps.length === 0) {
    lines.push('No critical gaps detected.', '');
  } else {
    for (const gap of audit.criticalGaps) {
      lines.push(
        `### ${gap.rank}. ${gap.issue}`,
        '',
        `- **Impact**: ${gap.impact}`,
        `- **Fix**: ${gap.fix}`,
        '',
      );
    }
  }

  lines.push(
    '## Source Artifacts',
    '',
    `- PULSE_HEALTH.json: ${health.generatedAt}`,
    `- PULSE_WORLD_STATE.json: ${worldState.generatedAt}`,
    `- PULSE_CODACY_STATE.json: ${codacy.syncedAt}`,
    '',
    '---',
    '',
    `Generated by \`scripts/pulse/unified-readiness-report.ts\` at ${audit.generatedAt}`,
    '',
  );

  return lines.join('\n');
}

// ── Main pipeline ───────────────────────────────────────────────────────────

function main(): void {
  const generatedAt = new Date().toISOString();

  const healthPath = safeRepoPath('PULSE_HEALTH.json');
  const worldStatePath = safeRepoPath('PULSE_WORLD_STATE.json');
  const codacyStatePath = safeRepoPath('PULSE_CODACY_STATE.json');

  const health = readJsonOptional<PulseHealth>(healthPath);
  const worldState = readJsonOptional<PulseWorldState>(worldStatePath);
  const codacyState = readJsonOptional<PulseCodacyState>(codacyStatePath);

  const runtime = runAllRuntimeChecks();

  // Fallback defaults when artifacts are missing
  const resolvedHealth: PulseHealth = health ?? {
    generatedAt: generatedAt,
    overall: { score: 0, status: 'UNKNOWN', summary: {} },
    observability: { score: 0, status: 'UNKNOWN', summary: {} },
    certification: { status: 'UNKNOWN', gaps: ['pulse-health-missing'] },
  };

  const resolvedWorldState: PulseWorldState = worldState ?? {
    generatedAt: generatedAt,
    executedScenarios: [],
    pendingAsyncExpectations: [],
    asyncExpectationsStatus: [],
    sessions: [],
  };

  const resolvedCodacyState: PulseCodacyState = codacyState ?? {
    syncedAt: generatedAt,
    totalIssues: 0,
    bySeverity: { HIGH: 0, MEDIUM: 0, LOW: 0 },
    byCategory: { Security: 0 },
    repositorySummary: { grade: 0, gradeLetter: '?', issuesCount: 0, issuesPercentage: 0 },
  };

  // Build checklist
  const categories = buildChecklistCategories(
    resolvedHealth,
    resolvedWorldState,
    resolvedCodacyState,
    runtime,
  );
  const checklistSummary = computeChecklistSummary(categories);

  const checklist: FinalProductionChecklist = {
    generatedAt,
    sourceArtifacts: {
      pulseHealth: health ? healthPath : '(missing)',
      pulseWorldState: worldState ? worldStatePath : '(missing)',
      pulseCodacyState: codacyState ? codacyStatePath : '(missing)',
    },
    summary: checklistSummary,
    categories,
  };

  // Build audit
  const runtimeFailures: string[] = [];
  if (!runtime.build.pass) runtimeFailures.push(`Build: ${runtime.build.detail}`);
  if (!runtime.testCoverage.pass)
    runtimeFailures.push(`Test coverage: ${runtime.testCoverage.detail}`);
  if (!runtime.envFiles.pass) runtimeFailures.push(`Env files: ${runtime.envFiles.detail}`);
  if (!runtime.hooksIntegrity.pass)
    runtimeFailures.push(`Hooks: ${runtime.hooksIntegrity.detail}`);

  const readTotalItems = checklist.summary.pass + checklist.summary.fail + checklist.summary.warn;
  const readinessStatus =
    checklist.summary.fail === 0
      ? `pass (${checklist.summary.pass} passes, ${checklist.summary.warn} warnings)`
      : `fail (${checklist.summary.pass} passes, ${checklist.summary.fail} failures, ${checklist.summary.warn} warnings)`;

  const criticalGaps = buildCriticalGaps(
    resolvedHealth,
    resolvedWorldState,
    resolvedCodacyState,
    runtime,
  );

  const audit: ProductionReadinessAudit = {
    generatedAt,
    pipeline: 'scripts/pulse/unified-readiness-report.ts',
    failures: runtimeFailures,
    readinessStatus,
    healthScore: resolvedHealth.overall.score,
    certificationStatus: resolvedHealth.certification.status,
    codacySummary: {
      grade: resolvedCodacyState.repositorySummary.gradeLetter,
      totalIssues: resolvedCodacyState.totalIssues,
      highIssues: resolvedCodacyState.bySeverity.HIGH ?? 0,
      mediumIssues: resolvedCodacyState.bySeverity.MEDIUM ?? 0,
    },
    worldState: {
      totalScenarios: resolvedWorldState.sessions.reduce((a, s) => a + s.declaredScenarios, 0),
      executedScenarios: resolvedWorldState.sessions.reduce((a, s) => a + s.executedScenarios, 0),
      pendingExpectations: resolvedWorldState.pendingAsyncExpectations.length,
      missingEvidence: resolvedWorldState.asyncExpectationsStatus.filter(
        (e) => e.status === 'missing_evidence',
      ).length,
      sessionSummary: resolvedWorldState.sessions.map((s) => ({
        kind: s.kind,
        passed: s.passedScenarios,
        total: s.declaredScenarios,
      })),
    },
    runtimeChecks: runtime,
    criticalGaps,
  };

  const markdown = buildMarkdownReport(
    resolvedHealth,
    resolvedWorldState,
    resolvedCodacyState,
    runtime,
    checklist,
    audit,
  );

  const jsonIndent = 2;

  const checklistPath = safeRepoPath('final-production-checklist.json');
  const auditPath = safeRepoPath('production-readiness-audit.json');
  const reportPath = safeRepoPath('PULSE_REPORT.md');

  writeFileSync(checklistPath, JSON.stringify(checklist, null, jsonIndent) + '\n');
  writeFileSync(auditPath, JSON.stringify(audit, null, jsonIndent) + '\n');
  writeFileSync(reportPath, markdown + '\n');

  console.log('Unified readiness report generated.');
  console.log(`  Checklist: ${checklistPath} (${readTotalItems} items)`);
  console.log(`  Audit:     ${auditPath} (${criticalGaps.length} critical gaps)`);
  console.log(`  Report:    ${reportPath} (markdown)`);
}

main();
