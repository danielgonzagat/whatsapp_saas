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

describe('classifyCodacyIssues', () => {
  it('returns zeros for an empty state', () => {
    const summary = makeSummary();
    const result = classifyCodacyIssues(summary);

    expect(result.totalHigh).toBe(0);
    expect(result.actionableHigh).toBe(0);
    expect(result.nonActionableHigh).toBe(0);
    expect(result.nonActionableByPattern).toEqual({});
    expect(governedValidationAction(result)).toBeUndefined();
  });

  it('treats only-actionable patterns as fully actionable', () => {
    const issues: PulseCodacyIssue[] = [
      makeIssue({ issueId: 'a', patternId: 'Semgrep_real.actionable-1' }),
      makeIssue({ issueId: 'b', patternId: 'Semgrep_real.actionable-2' }),
      makeIssue({ issueId: 'c', patternId: 'Semgrep_real.actionable-1' }),
    ];
    const summary = makeSummary({
      totalIssues: 3,
      severityCounts: { HIGH: 3, MEDIUM: 0, LOW: 0, UNKNOWN: 0 },
      highPriorityBatch: issues,
    });

    const result = classifyCodacyIssues(summary);

    expect(result.totalHigh).toBe(3);
    expect(result.actionableHigh).toBe(3);
    expect(result.nonActionableHigh).toBe(0);
    expect(result.nonActionableByPattern).toEqual({});
    expect(governedValidationAction(result)).toBeUndefined();
  });

  it('does not treat a legacy patternId as non-actionable without evidence', () => {
    const issues: PulseCodacyIssue[] = Array.from({ length: 37 }, (_, index) =>
      makeIssue({
        issueId: `rac-${index}`,
        filePath: 'backend/prisma/migrations/init/migration.sql',
        patternId: RAC_PATTERN,
        category: 'Security',
      }),
    );
    const summary = makeSummary({
      totalIssues: 37,
      severityCounts: { HIGH: 37, MEDIUM: 0, LOW: 0, UNKNOWN: 0 },
      highPriorityBatch: issues,
    });

    const result = classifyCodacyIssues(summary, { adjudicationState: null });

    expect(result.totalHigh).toBe(37);
    expect(result.actionableHigh).toBe(37);
    expect(result.nonActionableHigh).toBe(0);
    expect(result.nonActionableByPattern).toEqual({});
    expect(governedValidationAction(result)).toBeUndefined();
  });

  it('classifies non-actionable only with path, metadata, repeated human decision, and expiry evidence', () => {
    const rootDir = makeTempRoot();
    const issue = makeIssue({
      issueId: 'rac-1',
      filePath: 'backend/prisma/migrations/init/migration.sql',
      patternId: RAC_PATTERN,
      category: 'Security',
      message: 'generic.sql RAC_ demo rule requires table names to use a sample prefix',
    });
    const fileHash = writeFile(rootDir, issue.filePath, 'create table users (id text);\n');
    const repeatedDecision = makeAdjudicatedFinding(
      makeIssue({ issueId: 'rac-2', patternId: RAC_PATTERN }),
      {
        findingId: 'different-human-decision',
        filePath: 'backend/prisma/migrations/next/migration.sql',
        line: 10,
        fileHashAtSuppression: fileHash,
      },
    );
    const summary = makeSummary({
      totalIssues: 1,
      severityCounts: { HIGH: 1, MEDIUM: 0, LOW: 0, UNKNOWN: 0 },
      highPriorityBatch: [issue],
    });

    const result = classifyCodacyIssues(summary, {
      rootDir,
      adjudicationState: makeAdjudicationState([
        makeAdjudicatedFinding(issue, { fileHashAtSuppression: fileHash }),
        repeatedDecision,
      ]),
    });

    expect(result.totalHigh).toBe(1);
    expect(result.actionableHigh).toBe(0);
    expect(result.nonActionableHigh).toBe(1);
    expect(result.nonActionableByPattern[RAC_PATTERN]).toBe(1);
    expect(governedValidationAction(result)).toContain(
      'repeated human false-positive adjudication',
    );
  });

  it('does not depend on a fixed pattern allowlist when evidence fingerprints match', () => {
    const rootDir = makeTempRoot();
    const genericIssue = makeIssue({
      issueId: 'generic-1',
      filePath: 'backend/prisma/migrations/init/migration.sql',
      patternId: 'Semgrep_codacy.generic.sql.generated-template-name',
      category: 'Security',
      message: 'generic.sql template rule matched generated migration structure',
    });
    const fileHash = writeFile(rootDir, genericIssue.filePath, 'create table orders (id text);\n');
    const summary = makeSummary({
      totalIssues: 1,
      severityCounts: { HIGH: 1, MEDIUM: 0, LOW: 0, UNKNOWN: 0 },
      highPriorityBatch: [genericIssue],
    });

    const result = classifyCodacyIssues(summary, {
      rootDir,
      adjudicationState: makeAdjudicationState([
        makeAdjudicatedFinding(genericIssue, { fileHashAtSuppression: fileHash }),
        makeAdjudicatedFinding(
          makeIssue({
            issueId: 'generic-2',
            patternId: genericIssue.patternId,
            message: genericIssue.message,
          }),
          { findingId: 'repeat-generic', fileHashAtSuppression: fileHash },
        ),
      ]),
    });

    expect(result.nonActionableHigh).toBe(1);
    expect(result.nonActionableByPattern[genericIssue.patternId]).toBe(1);
  });

  it('splits mixed actionable and non-actionable HIGH issues', () => {
    const rootDir = makeTempRoot();
    const racIssue = makeIssue({
      issueId: 'rac-0',
      patternId: RAC_PATTERN,
      message: 'generic.sql RAC_ demo rule requires table names to use a sample prefix',
    });
    const fileHash = writeFile(rootDir, racIssue.filePath, 'create table users (id text);\n');
    const issues: PulseCodacyIssue[] = [
      ...Array.from({ length: 5 }, (_, index) =>
        makeIssue({ issueId: `act-${index}`, patternId: 'Semgrep_real.actionable-1' }),
      ),
      racIssue,
    ];
    const summary = makeSummary({
      totalIssues: 6,
      severityCounts: { HIGH: 6, MEDIUM: 0, LOW: 0, UNKNOWN: 0 },
      highPriorityBatch: issues,
    });

    const result = classifyCodacyIssues(summary, {
      rootDir,
      adjudicationState: makeAdjudicationState([
        makeAdjudicatedFinding(racIssue, { fileHashAtSuppression: fileHash }),
        makeAdjudicatedFinding(makeIssue({ issueId: 'rac-repeat', patternId: RAC_PATTERN }), {
          findingId: 'repeat',
          fileHashAtSuppression: fileHash,
        }),
      ]),
    });

    expect(result.totalHigh).toBe(6);
    expect(result.nonActionableHigh).toBe(1);
    expect(result.actionableHigh).toBe(5);
    expect(result.nonActionableByPattern).toEqual({ [RAC_PATTERN]: 1 });
    expect(governedValidationAction(result)).toContain(RAC_PATTERN);
  });

  it('ignores non-HIGH severity rows even when patternId is non-actionable', () => {
    const issues: PulseCodacyIssue[] = [
      makeIssue({ issueId: 'low', patternId: RAC_PATTERN, severityLevel: 'LOW' }),
      makeIssue({ issueId: 'med', patternId: RAC_PATTERN, severityLevel: 'MEDIUM' }),
    ];
    const summary = makeSummary({
      totalIssues: 2,
      severityCounts: { HIGH: 0, MEDIUM: 1, LOW: 1, UNKNOWN: 0 },
      highPriorityBatch: issues,
    });

    const result = classifyCodacyIssues(summary, { adjudicationState: null });

    expect(result.totalHigh).toBe(0);
    expect(result.nonActionableHigh).toBe(0);
    expect(result.actionableHigh).toBe(0);
    expect(result.nonActionableByPattern).toEqual({});
    expect(governedValidationAction(result)).toBeUndefined();
  });

  it('clamps actionableHigh at zero if non-actionable count exceeds totalHigh', () => {
    // Defensive: highPriorityBatch may sometimes include rows whose totalHigh
    // count was reset elsewhere; the classifier must never report a negative
    // actionableHigh.
    const issues: PulseCodacyIssue[] = Array.from({ length: 5 }, (_, index) =>
      makeIssue({ issueId: `rac-${index}`, patternId: RAC_PATTERN }),
    );
    const summary = makeSummary({
      totalIssues: 2,
      severityCounts: { HIGH: 2, MEDIUM: 0, LOW: 0, UNKNOWN: 0 },
      highPriorityBatch: issues,
    });

    const result = classifyCodacyIssues(summary, { adjudicationState: null });

    expect(result.totalHigh).toBe(2);
    expect(result.nonActionableHigh).toBe(0);
    expect(result.actionableHigh).toBe(2);
  });

  it('keeps a previously suppressed issue actionable after the file changes', () => {
    const rootDir = makeTempRoot();
    const issue = makeIssue({
      patternId: RAC_PATTERN,
      message: 'generic.sql RAC_ demo rule requires table names to use a sample prefix',
    });
    const oldHash = writeFile(rootDir, issue.filePath, 'create table users (id text);\n');
    writeFile(rootDir, issue.filePath, 'create table users (id text primary key);\n');
    const summary = makeSummary({
      totalIssues: 1,
      severityCounts: { HIGH: 1, MEDIUM: 0, LOW: 0, UNKNOWN: 0 },
      highPriorityBatch: [issue],
    });

    const result = classifyCodacyIssues(summary, {
      rootDir,
      adjudicationState: makeAdjudicationState([
        makeAdjudicatedFinding(issue, { fileHashAtSuppression: oldHash }),
        makeAdjudicatedFinding(makeIssue({ issueId: 'rac-repeat', patternId: RAC_PATTERN }), {
          findingId: 'repeat',
          fileHashAtSuppression: oldHash,
        }),
      ]),
    });

    expect(result.nonActionableHigh).toBe(0);
    expect(result.actionableHigh).toBe(1);
  });

  it('builds Codacy evidence from scope root instead of process cwd', () => {
    const rootDir = makeTempRoot();
    const otherCwd = makeTempRoot();
    const issue = makeIssue({
      patternId: RAC_PATTERN,
      message: 'generic.sql RAC_ demo rule requires table names to use a sample prefix',
    });
    const fileHash = writeFile(rootDir, issue.filePath, 'create table users (id text);\n');
    const adjudicationState = makeAdjudicationState([
      makeAdjudicatedFinding(issue, { fileHashAtSuppression: fileHash }),
      makeAdjudicatedFinding(makeIssue({ issueId: 'rac-repeat', patternId: RAC_PATTERN }), {
        findingId: 'repeat',
        fileHashAtSuppression: fileHash,
      }),
    ]);
    fs.mkdirSync(path.join(rootDir, '.pulse', 'current'), { recursive: true });
    fs.writeFileSync(
      path.join(rootDir, '.pulse', 'current', 'PULSE_FP_ADJUDICATION.json'),
      JSON.stringify(adjudicationState),
      'utf8',
    );
    const summary = makeSummary({
      sourcePath: path.join(rootDir, 'PULSE_CODACY_STATE.json'),
      totalIssues: 1,
      severityCounts: { HIGH: 1, MEDIUM: 0, LOW: 0, UNKNOWN: 0 },
      highPriorityBatch: [issue],
      observedFiles: [issue.filePath],
    });

    const originalCwd = process.cwd();
    try {
      process.chdir(otherCwd);
      const evidence = buildCodacyEvidence(makeScopeState(rootDir, summary));

      expect(evidence.nonActionableHigh).toBe(1);
      expect(evidence.actionableHigh).toBe(0);
      expect(evidence.classification.nonActionableByPattern).toEqual({ [RAC_PATTERN]: 1 });
    } finally {
      process.chdir(originalCwd);
    }
  });
});
