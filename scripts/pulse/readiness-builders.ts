import type { RuntimeChecks } from './readiness-runtime-checks';

export interface PulseHealth {
  generatedAt: string;
  overall: { score: number; status: string; summary: Record<string, number> };
  observability: { score: number; status: string; summary: Record<string, number> };
  certification: { status: string; gaps: string[] };
}

export interface PulseWorldState {
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

export interface PulseCodacyState {
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

export interface ChecklistItem {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'warn';
  detail: string;
  priority: 'P0' | 'P1' | 'P2';
}

export interface ChecklistCategory {
  category: string;
  items: ChecklistItem[];
}

export interface FinalProductionChecklist {
  generatedAt: string;
  sourceArtifacts: {
    pulseHealth: string;
    pulseWorldState: string;
    pulseCodacyState: string;
  };
  summary: { total: number; pass: number; fail: number; warn: number };
  categories: ChecklistCategory[];
}

export interface CriticalGap {
  rank: number;
  issue: string;
  impact: string;
  fix: string;
}

export interface ProductionReadinessAudit {
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

export function buildChecklistCategories(
  health: PulseHealth,
  worldState: PulseWorldState,
  codacy: PulseCodacyState,
  runtime: RuntimeChecks,
): ChecklistCategory[] {
  const categories: ChecklistCategory[] = [];

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

export function computeChecklistSummary(categories: ChecklistCategory[]): {
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

export function buildCriticalGaps(
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
