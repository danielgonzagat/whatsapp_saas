import { describe, it, expect } from 'vitest';
import { describe, it, expect } from 'vitest';
import { NON_ACTIONABLE_PATTERNS, classifyCodacyIssues } from '../codacy-false-positive-classifier';
import type { PulseCodacyIssue, PulseCodacySummary } from '../types.truth';

const RAC_PATTERN = 'Semgrep_codacy.generic.sql.rac-table-access';

function makeIssue(overrides: Partial<PulseCodacyIssue> = {}): PulseCodacyIssue {
  return {
    issueId: overrides.issueId ?? 'issue-1',
    filePath: overrides.filePath ?? 'backend/src/example.ts',
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

describe('classifyCodacyIssues', () => {
  it('lists Semgrep RAC table access as a non-actionable pattern', () => {
    expect(NON_ACTIONABLE_PATTERNS).toContain(RAC_PATTERN);
  });

  it('returns zeros for an empty state', () => {
    const summary = makeSummary();
    const result = classifyCodacyIssues(summary);

    expect(result.totalHigh).toBe(0);
    expect(result.actionableHigh).toBe(0);
    expect(result.nonActionableHigh).toBe(0);
    expect(result.nonActionableByPattern).toEqual({});
    expect(result.humanRequiredAction).toBeUndefined();
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
    expect(result.humanRequiredAction).toBeUndefined();
  });

  it('treats only-non-actionable RAC patterns as fully non-actionable', () => {
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

    const result = classifyCodacyIssues(summary);

    expect(result.totalHigh).toBe(37);
    expect(result.actionableHigh).toBe(0);
    expect(result.nonActionableHigh).toBe(37);
    expect(result.nonActionableByPattern[RAC_PATTERN]).toBe(37);
    expect(result.humanRequiredAction).toBeDefined();
    expect(result.humanRequiredAction).toContain(RAC_PATTERN);
    expect(result.humanRequiredAction).toContain('codacy-enforce-max-rigor');
  });

  it('splits mixed actionable and non-actionable HIGH issues', () => {
    const issues: PulseCodacyIssue[] = [
      ...Array.from({ length: 5 }, (_, index) =>
        makeIssue({ issueId: `act-${index}`, patternId: 'Semgrep_real.actionable-1' }),
      ),
      ...Array.from({ length: 3 }, (_, index) =>
        makeIssue({ issueId: `rac-${index}`, patternId: RAC_PATTERN }),
      ),
    ];
    const summary = makeSummary({
      totalIssues: 8,
      severityCounts: { HIGH: 8, MEDIUM: 0, LOW: 0, UNKNOWN: 0 },
      highPriorityBatch: issues,
    });

    const result = classifyCodacyIssues(summary);

    expect(result.totalHigh).toBe(8);
    expect(result.nonActionableHigh).toBe(3);
    expect(result.actionableHigh).toBe(5);
    expect(result.nonActionableByPattern).toEqual({ [RAC_PATTERN]: 3 });
    expect(result.humanRequiredAction).toContain(RAC_PATTERN);
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

    const result = classifyCodacyIssues(summary);

    expect(result.totalHigh).toBe(0);
    expect(result.nonActionableHigh).toBe(0);
    expect(result.actionableHigh).toBe(0);
    expect(result.nonActionableByPattern).toEqual({});
    expect(result.humanRequiredAction).toBeUndefined();
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

    const result = classifyCodacyIssues(summary);

    expect(result.totalHigh).toBe(2);
    expect(result.nonActionableHigh).toBe(2);
    expect(result.actionableHigh).toBe(0);
  });
});
