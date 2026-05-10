#!/usr/bin/env ts-node

/**
 * unified-readiness-report.ts — SINGLE SOURCE pipeline for KLOEL production readiness.
 *
 * Reads the canonical PULSE_CERTIFICATE.json as the authority source,
 * supplements with PULSE_HEALTH / PULSE_WORLD_STATE / PULSE_CODACY_STATE,
 * and generates ALL 4 artifacts with a single, consistent verdict:
 *
 *   1. production-readiness-audit.json
 *   2. final-production-checklist.json
 *   3. PULSE_REPORT.md
 *   4. BLOCKER_RANK.json
 *
 * All 4 artifacts carry the same unified verdict field.
 * A self-consistency gate runs after generation and fails the pipeline on divergence.
 */

import { writeFileSync, readFileSync } from 'node:fs';

import {
  safeRepoPath,
  readJsonOptional,
  readJson,
  runAllRuntimeChecks,
  type RuntimeChecks,
} from './readiness-runtime-checks';

import {
  buildChecklistCategories,
  computeChecklistSummary,
  buildCriticalGaps,
  type PulseHealth,
  type PulseWorldState,
  type PulseCodacyState,
  type FinalProductionChecklist,
  type ProductionReadinessAudit,
  type CriticalGap,
  type ChecklistCategory,
} from './readiness-builders';

import { buildMarkdownReport } from './readiness-markdown';

// ---------------------------------------------------------------------------
// PULSE Certificate types (canonical source)
// ---------------------------------------------------------------------------

interface PulseCertificateGate {
  status: string;
  reason: string;
  failureClass?: string;
  affectedCapabilityIds?: string[];
  affectedFlowIds?: string[];
  evidenceMode?: string;
  confidence?: string;
}

interface PulseCertificateNoHardcodedReality {
  artifact: string;
  version: number;
  generatedAt: string;
  operationalIdentity: string;
  scannedFiles: number;
  totalEvents: number;
  summary: {
    totalFindings: number;
    byKind: Record<string, number>;
    topFiles: Array<{ filePath: string; findings: number }>;
    totalPredicates: number;
    byPredicateKind: Record<string, number>;
  };
  hardcodeEvents: unknown[];
}

interface PulseCertificate {
  projectId: string;
  projectName: string;
  commitSha: string;
  environment: string;
  timestamp: string;
  status: string;
  humanReplacementStatus: string;
  profile: unknown;
  certificationScope: unknown;
  score: number;
  rawScore: number;
  certificationTarget: {
    tier: unknown;
    final: boolean;
    profile: unknown;
    certificationScope: unknown;
  };
  blockingTier: number;
  gates: Record<string, PulseCertificateGate>;
  criticalFailures: string[];
  dynamicBlockingReasons: string[];
  noHardcodedRealityState: PulseCertificateNoHardcodedReality | null;
}

// ---------------------------------------------------------------------------
// Blocker Rank types (artifact 4)
// ---------------------------------------------------------------------------

interface BlockerEntry {
  rank: number;
  gate: string;
  severity: string;
  reason: string;
  failureClass: string;
}

interface BlockerRank {
  schema: string;
  computedAt: string;
  pipeline: string;
  unifiedVerdict: string;
  totalBlockers: number;
  gateSummary: {
    total: number;
    pass: number;
    fail: number;
  };
  blockers: BlockerEntry[];
}

// ---------------------------------------------------------------------------
// Unified Verdict type
// ---------------------------------------------------------------------------

type UnifiedVerdict = 'READY_FOR_PRODUCTION' | 'NOT_READY_FOR_PRODUCTION';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeUnifiedVerdict(
  cert: PulseCertificate,
): UnifiedVerdict {
  const gates = cert.gates;
  const gateNames = Object.keys(gates);
  const failedGates = gateNames.filter((g) => gates[g].status === 'fail');

  if (
    cert.status === 'CERTIFIED' &&
    failedGates.length === 0 &&
    cert.criticalFailures.length === 0
  ) {
    return 'READY_FOR_PRODUCTION';
  }
  return 'NOT_READY_FOR_PRODUCTION';
}

function buildBlockerRank(
  cert: PulseCertificate,
  generatedAt: string,
  verdict: UnifiedVerdict,
): BlockerRank {
  const gates = cert.gates;
  const gateNames = Object.keys(gates);
  const failedGates = gateNames.filter((g) => gates[g].status === 'fail');
  const passedGates = gateNames.filter((g) => gates[g].status === 'pass');

  const blockers: BlockerEntry[] = [];
  let rank = 0;

  for (const gateName of gateNames) {
    const gate = gates[gateName];
    if (gate.status === 'fail') {
      rank++;
      blockers.push({
        rank,
        gate: gateName,
        severity: gate.failureClass ?? 'unknown',
        reason: gate.reason,
        failureClass: gate.failureClass ?? 'unknown',
      });
    }
  }

  return {
    schema: 'kloel.blocker-rank.v2',
    computedAt: generatedAt,
    pipeline: 'scripts/pulse/unified-readiness-report.ts',
    unifiedVerdict: verdict,
    totalBlockers: blockers.length,
    gateSummary: {
      total: gateNames.length,
      pass: passedGates.length,
      fail: failedGates.length,
    },
    blockers,
  };
}

function writeJsonArtifact(filePath: string, data: unknown): void {
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// Consistency validation
// ---------------------------------------------------------------------------

interface ArtifactVerdict {
  path: string;
  verdict: string;
  source: string;
}

function extractVerdictFromArtifacts(
  auditPath: string,
  checklistPath: string,
  reportPath: string,
  blockerPath: string,
): ArtifactVerdict[] {
  const results: ArtifactVerdict[] = [];

  // production-readiness-audit.json
  try {
    const audit = JSON.parse(readFileSync(auditPath, 'utf8')) as Record<string, unknown>;
    results.push({
      path: auditPath,
      verdict: String(audit.unifiedVerdict ?? 'MISSING'),
      source: 'production-readiness-audit.json',
    });
  } catch {
    results.push({ path: auditPath, verdict: 'ERROR', source: 'production-readiness-audit.json' });
  }

  // final-production-checklist.json
  try {
    const checklist = JSON.parse(readFileSync(checklistPath, 'utf8')) as Record<string, unknown>;
    results.push({
      path: checklistPath,
      verdict: String(checklist.unifiedVerdict ?? 'MISSING'),
      source: 'final-production-checklist.json',
    });
  } catch {
    results.push({ path: checklistPath, verdict: 'ERROR', source: 'final-production-checklist.json' });
  }

  // PULSE_REPORT.md
  try {
    const reportContent = readFileSync(reportPath, 'utf8');
    const verdictMatch = reportContent.match(/UNIFIED\s+VERDICT:\s+(READY_FOR_PRODUCTION|NOT_READY_FOR_PRODUCTION)/);
    results.push({
      path: reportPath,
      verdict: verdictMatch ? verdictMatch[1] : 'MISSING',
      source: 'PULSE_REPORT.md',
    });
  } catch {
    results.push({ path: reportPath, verdict: 'ERROR', source: 'PULSE_REPORT.md' });
  }

  // BLOCKER_RANK.json
  try {
    const blocker = JSON.parse(readFileSync(blockerPath, 'utf8')) as Record<string, unknown>;
    results.push({
      path: blockerPath,
      verdict: String(blocker.unifiedVerdict ?? 'MISSING'),
      source: 'BLOCKER_RANK.json',
    });
  } catch {
    results.push({ path: blockerPath, verdict: 'ERROR', source: 'BLOCKER_RANK.json' });
  }

  return results;
}

function validateArtifactConsistency(verdicts: ArtifactVerdict[]): boolean {
  const uniqueVerdicts = new Set(verdicts.map((v) => v.verdict));
  const allSame = uniqueVerdicts.size === 1;
  const firstVerdict = verdicts[0]?.verdict ?? 'UNKNOWN';

  console.log('\nArtifact consistency check:');
  for (const v of verdicts) {
    const icon = v.verdict === firstVerdict ? 'PASS' : 'DIVERGE';
    console.log(`  [${icon}] ${v.source}: ${v.verdict}`);
  }

  if (!allSame) {
    console.error(
      `\nDIVERGENCE DETECTED: Not all artifacts agree on verdict. Found: ${[...uniqueVerdicts].join(', ')}`,
    );
  }

  return allSame;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const generatedAt = new Date().toISOString();

  // --------------- canonical source ---------------
  const certPath = safeRepoPath('PULSE_CERTIFICATE.json');
  const healthPath = safeRepoPath('PULSE_HEALTH.json');
  const worldStatePath = safeRepoPath('PULSE_WORLD_STATE.json');
  const codacyStatePath = safeRepoPath('PULSE_CODACY_STATE.json');

  const cert = readJsonOptional<PulseCertificate>(certPath);
  const health = readJsonOptional<PulseHealth>(healthPath);
  const worldState = readJsonOptional<PulseWorldState>(worldStatePath);
  const codacyState = readJsonOptional<PulseCodacyState>(codacyStatePath);

  if (!cert) {
    console.error(`FATAL: Canonical source ${certPath} not found. Cannot generate readiness report.`);
    process.exit(1);
  }

  const runtime: RuntimeChecks = runAllRuntimeChecks();

  // --------------- unified verdict ---------------
  const verdict = computeUnifiedVerdict(cert);

  console.log(`\nUnified pipeline: scripts/pulse/unified-readiness-report.ts`);
  console.log(`Canonical source: PULSE_CERTIFICATE.json (${cert.timestamp})`);
  console.log(`Unified verdict:  ${verdict}`);
  console.log(`Cert status:      ${cert.status}`);
  console.log(`Score:            ${cert.score}/100`);
  console.log(`Gates:            ${Object.keys(cert.gates).filter((g) => cert.gates[g].status === 'pass').length}/${Object.keys(cert.gates).length} passing`);

  // --------------- resolve supplemental data ---------------
  const resolvedHealth: PulseHealth = health ?? {
    generatedAt,
    overall: { score: cert.score, status: cert.status, summary: {} },
    observability: { score: 0, status: 'UNKNOWN', summary: {} },
    certification: { status: cert.status, gaps: cert.criticalFailures },
  };

  const resolvedWorldState: PulseWorldState = worldState ?? {
    generatedAt,
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

  // --------------- artifact 2: final-production-checklist.json ---------------
  const categories: ChecklistCategory[] = buildChecklistCategories(
    resolvedHealth,
    resolvedWorldState,
    resolvedCodacyState,
    runtime,
  );
  const checklistSummary = computeChecklistSummary(categories);

  const checklist: FinalProductionChecklist & { unifiedVerdict: string } = {
    generatedAt,
    unifiedVerdict: verdict,
    sourceArtifacts: {
      pulseHealth: health ? healthPath : '(missing)',
      pulseWorldState: worldState ? worldStatePath : '(missing)',
      pulseCodacyState: codacyState ? codacyStatePath : '(missing)',
    },
    summary: checklistSummary,
    categories,
  };

  // --------------- artifact 1: production-readiness-audit.json ---------------
  const runtimeFailures: string[] = [];
  if (!runtime.build.pass) runtimeFailures.push(`Build: ${runtime.build.detail}`);
  if (!runtime.testCoverage.pass)
    runtimeFailures.push(`Test coverage: ${runtime.testCoverage.detail}`);
  if (!runtime.envFiles.pass) runtimeFailures.push(`Env files: ${runtime.envFiles.detail}`);
  if (!runtime.hooksIntegrity.pass)
    runtimeFailures.push(`Hooks: ${runtime.hooksIntegrity.detail}`);

  const readinessStatus =
    checklistSummary.fail === 0
      ? `pass (${checklistSummary.pass} passes, ${checklistSummary.warn} warnings)`
      : `fail (${checklistSummary.pass} passes, ${checklistSummary.fail} failures, ${checklistSummary.warn} warnings)`;

  const criticalGaps: CriticalGap[] = buildCriticalGaps(
    resolvedHealth,
    resolvedWorldState,
    resolvedCodacyState,
    runtime,
  );

  const audit: ProductionReadinessAudit & { unifiedVerdict: string; certificateStatus: string } = {
    generatedAt,
    pipeline: 'scripts/pulse/unified-readiness-report.ts',
    unifiedVerdict: verdict,
    certificateStatus: cert.status,
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

  // --------------- artifact 3: PULSE_REPORT.md ---------------
  const markdown = buildMarkdownReport(
    resolvedHealth,
    resolvedWorldState,
    resolvedCodacyState,
    runtime,
    checklist as FinalProductionChecklist,
    audit as ProductionReadinessAudit,
  );

  // Prepend unified verdict banner to markdown
  const markdownWithVerdict =
    `<!-- UNIFIED VERDICT: ${verdict} -->\n` +
    `# UNIFIED VERDICT: ${verdict}\n\n` +
    markdown;

  // --------------- artifact 4: BLOCKER_RANK.json ---------------
  const blockerRank = buildBlockerRank(cert, generatedAt, verdict);

  // --------------- write all 4 artifacts ---------------
  const auditPath = safeRepoPath('production-readiness-audit.json');
  const checklistPath = safeRepoPath('final-production-checklist.json');
  const reportPath = safeRepoPath('PULSE_REPORT.md');
  const blockerPath = safeRepoPath('BLOCKER_RANK.json');

  writeJsonArtifact(auditPath, audit);
  writeJsonArtifact(checklistPath, checklist);
  writeFileSync(reportPath, markdownWithVerdict + '\n');
  writeJsonArtifact(blockerPath, blockerRank);

  const totalItems = checklistSummary.pass + checklistSummary.fail + checklistSummary.warn;

  console.log('\nGenerated 4 artifacts from single pipeline:');
  console.log(`  [1] production-readiness-audit.json  (verdict: ${verdict}, ${criticalGaps.length} gaps)`);
  console.log(`  [2] final-production-checklist.json  (verdict: ${verdict}, ${totalItems} items)`);
  console.log(`  [3] PULSE_REPORT.md                   (verdict: ${verdict})`);
  console.log(`  [4] BLOCKER_RANK.json                 (verdict: ${verdict}, ${blockerRank.totalBlockers} blockers)`);

  // --------------- self-consistency validation ---------------
  const verdicts = extractVerdictFromArtifacts(auditPath, checklistPath, reportPath, blockerPath);
  const consistent = validateArtifactConsistency(verdicts);

  if (!consistent) {
    console.error('\nArtifact divergence detected. Pipeline FAILED.');
    process.exit(1);
  }

  console.log('\nAll 4 artifacts agree on unified verdict. Pipeline PASSED.');
}

main();
