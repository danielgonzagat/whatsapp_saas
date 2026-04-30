import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildCodacyEvidence } from '../codacy-evidence';
import { classifyCodacyIssues } from '../codacy-false-positive-classifier';
import type { PulseCodacyIssue, PulseCodacySummary, PulseScopeState } from '../types.truth';
import type { CodacyClassification } from '../types.codacy-classification';
import type {
  AdjudicatedFinding,
  FalsePositiveAdjudicationState,
} from '../types.false-positive-adjudicator';

const RAC_PATTERN = 'Semgrep_codacy.generic.sql.rac-table-access';

function makeIssue(overrides: Partial<PulseCodacyIssue> = {}): PulseCodacyIssue {
  return {
    issueId: overrides.issueId ?? 'issue-1',
    filePath: overrides.filePath ?? 'backend/prisma/migrations/init/migration.sql',
    lineNumber: overrides.lineNumber ?? 1,
    patternId: overrides.patternId ?? 'Semgrep_other.real.actionable-rule',
    category: overrides.category ?? 'CodeStyle',
    severityLevel: overrides.severityLevel ?? 'HIGH',
    tool: overrides.tool ?? 'semgrep',
    message: overrides.message ?? 'msg',
    commitSha: overrides.commitSha ?? null,
    commitTimestamp: overrides.commitTimestamp ?? null,
  };
}

function makeTempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-codacy-classifier-'));
}

function writeFile(rootDir: string, relativePath: string, content: string): string {
  const filePath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return createHash('sha256').update(content).digest('hex');
}

function makeEvidenceFingerprint(
  finding: Omit<AdjudicatedFinding, 'evidenceFingerprintAtSuppression'>,
  fileHash: string,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        source: finding.source,
        title: finding.title,
        filePath: finding.filePath,
        line: finding.line,
        capabilityId: finding.capabilityId,
        proof: finding.proof,
        fileHash,
      }),
    )
    .digest('hex');
}

function makeFindingId(issue: PulseCodacyIssue): string {
  const raw = `codacy:${issue.filePath}:${issue.patternId || issue.category}:${
    issue.lineNumber ?? 'no-line'
  }`;
  return createHash('sha256').update(raw).digest('hex').substring(0, 16);
}

function makeAdjudicatedFinding(
  issue: PulseCodacyIssue,
  overrides: Partial<AdjudicatedFinding> = {},
): AdjudicatedFinding {
  const finding = {
    findingId: overrides.findingId ?? makeFindingId(issue),
    title: overrides.title ?? issue.patternId,
    source: overrides.source ?? 'codacy',
    status: overrides.status ?? 'false_positive',
    severity: overrides.severity ?? 'high',
    filePath: overrides.filePath ?? issue.filePath,
    line: overrides.line ?? issue.lineNumber,
    capabilityId: overrides.capabilityId ?? null,
    proof:
      overrides.proof ??
      'Human adjudication: Codacy generic SQL RAC demo rule does not apply to migration SQL.',
    expiresOnFileChange: overrides.expiresOnFileChange ?? true,
    fileHashAtSuppression: overrides.fileHashAtSuppression ?? 'a'.repeat(64),
    evidenceFingerprintAtSuppression: overrides.evidenceFingerprintAtSuppression ?? 'b'.repeat(64),
    suppressedAt: overrides.suppressedAt ?? '2026-04-29T00:00:00.000Z',
    lastChecked: overrides.lastChecked ?? '2026-04-29T00:00:00.000Z',
  };
  return {
    ...finding,
    evidenceFingerprintAtSuppression:
      overrides.evidenceFingerprintAtSuppression ??
      makeEvidenceFingerprint(finding, finding.fileHashAtSuppression),
  };
}

function makeAdjudicationState(findings: AdjudicatedFinding[]): FalsePositiveAdjudicationState {
  return {
    generatedAt: '2026-04-29T00:00:00.000Z',
    summary: {
      totalFindings: findings.length,
      open: 0,
      confirmed: 0,
      fixed: 0,
      falsePositives: findings.filter((finding) => finding.status === 'false_positive').length,
      acceptedRisks: findings.filter((finding) => finding.status === 'accepted_risk').length,
      expiredSuppressions: 0,
      precision: 1,
    },
    findings,
  };
}

function makeSummary(overrides: Partial<PulseCodacySummary> = {}): PulseCodacySummary {
  return {
    snapshotAvailable: true,
    sourcePath: null,
    syncedAt: null,
    ageMinutes: null,
    stale: false,
    loc: 0,
    totalIssues: overrides.totalIssues ?? 0,
    severityCounts: overrides.severityCounts ?? {
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
      UNKNOWN: 0,
    },
    toolCounts: overrides.toolCounts ?? {},
    topFiles: overrides.topFiles ?? [],
    highPriorityBatch: overrides.highPriorityBatch ?? [],
    observedFiles: overrides.observedFiles ?? [],
  };
}

function makeScopeState(rootDir: string, codacy: PulseCodacySummary): PulseScopeState {
  return {
    generatedAt: '2026-04-29T00:00:00.000Z',
    rootDir,
    summary: {
      totalFiles: 0,
      totalLines: 0,
      runtimeCriticalFiles: 0,
      userFacingFiles: 0,
      humanRequiredFiles: 0,
      surfaceCounts: {
        frontend: 0,
        'frontend-admin': 0,
        backend: 0,
        worker: 0,
        prisma: 0,
        e2e: 0,
        scripts: 0,
        docs: 0,
        infra: 0,
        governance: 0,
        'root-config': 0,
        artifacts: 0,
        misc: 0,
      },
      kindCounts: {
        source: 0,
        spec: 0,
        migration: 0,
        config: 0,
        document: 0,
        artifact: 0,
      },
      unmappedModuleCandidates: [],
      inventoryCoverage: 100,
      classificationCoverage: 100,
      structuralGraphCoverage: 0,
      testCoverage: 0,
      scenarioCoverage: 0,
      runtimeEvidenceCoverage: 0,
      productionProofCoverage: 0,
      orphanFiles: [],
      unknownFiles: [],
    },
    parity: {
      status: 'pass',
      mode: 'repo_inventory_with_codacy_spotcheck',
      confidence: 'high',
      reason: 'test fixture',
      inventoryFiles: 0,
      codacyObservedFiles: codacy.observedFiles.length,
      codacyObservedFilesCovered: codacy.observedFiles.length,
      missingCodacyFiles: [],
    },
    codacy,
    files: [],
    moduleAggregates: [],
    excludedFiles: [],
    scopeSource: 'repo_filesystem',
    manifestBoundary: false,
    manifestRole: 'semantic_overlay',
  };
}

function governedValidationAction(result: CodacyClassification): string | undefined {
  return result.humanRequiredAction;
}
import "../__companions__/codacy-false-positive-classifier.spec.companion";
