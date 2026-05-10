#!/usr/bin/env ts-node

import { writeFileSync } from 'node:fs';

import {
  safeRepoPath,
  readJsonOptional,
  runAllRuntimeChecks,
} from './readiness-runtime-checks';

import {
  buildChecklistCategories,
  computeChecklistSummary,
  buildCriticalGaps,
} from './readiness-builders';

import type {
  PulseHealth,
  PulseWorldState,
  PulseCodacyState,
  FinalProductionChecklist,
  ProductionReadinessAudit,
} from './readiness-builders';

import { buildMarkdownReport } from './readiness-markdown';

function main(): void {
  const generatedAt = new Date().toISOString();

  const healthPath = safeRepoPath('PULSE_HEALTH.json');
  const worldStatePath = safeRepoPath('PULSE_WORLD_STATE.json');
  const codacyStatePath = safeRepoPath('PULSE_CODACY_STATE.json');

  const health = readJsonOptional<PulseHealth>(healthPath);
  const worldState = readJsonOptional<PulseWorldState>(worldStatePath);
  const codacyState = readJsonOptional<PulseCodacyState>(codacyStatePath);

  const runtime = runAllRuntimeChecks();

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
