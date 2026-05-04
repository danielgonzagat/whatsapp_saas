import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildCodacyEvidence } from '../codacy-evidence';
import { classifyCodacyIssues } from '../codacy-false-positive-classifier';
import type { PulseCodacyIssue } from '../types.truth';

import {
  RAC_PATTERN,
  makeIssue,
  makeTempRoot,
  writeFile,
  makeAdjudicatedFinding,
  makeAdjudicationState,
  makeSummary,
  makeScopeState,
  governedValidationAction,
} from './__parts__/codacy-false-positive-classifier.helpers';

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
