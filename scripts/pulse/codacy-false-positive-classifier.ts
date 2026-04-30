// PULSE — Codacy false-positive classifier.
//
// Classifies HIGH severity Codacy issues into:
//   - ACTIONABLE HIGH    : real findings the team can fix in product code.
//   - NON-ACTIONABLE HIGH: findings backed by repeated human adjudication,
//                         issue/path context, and expiry-on-file-change proof.
//
// The classifier is intentionally CONSERVATIVE: fixed pattern ids are treated
// only as legacy signals. They never adjudicate a false positive by themselves.

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PulseCodacySummary } from './types.truth';
import type { CodacyClassification } from './types.codacy-classification';
import type {
  AdjudicatedFinding,
  FalsePositiveAdjudicationState,
} from './types.false-positive-adjudicator';

export type { CodacyClassification } from './types.codacy-classification';

const MIN_REPEATED_HUMAN_DECISIONS = 2;

interface CodacyIssueLike {
  issueId: string;
  filePath: string;
  lineNumber: number;
  patternId: string;
  category: string;
  severityLevel: string;
  tool: string;
  message: string;
}

interface CodacyClassificationContext {
  rootDir?: string;
  adjudicationState?: FalsePositiveAdjudicationState | null;
}

function isHighIssue(severityLevel: string): boolean {
  return severityLevel === 'HIGH';
}

function buildHumanRequiredAction(byPattern: Record<string, number>): string {
  const entries = Object.entries(byPattern).sort((left, right) => right[1] - left[1]);
  const formatted = entries.map(([pattern, count]) => `${pattern} (${count})`).join('; ');
  return [
    'Codacy reports HIGH severity issues with repeated human false-positive adjudication.',
    'The classifier required issue metadata, file/path context, and expiresOnFileChange evidence.',
    'Suppression via inline comments remains forbidden by REGRA DE CODACY (CLAUDE.md).',
    'Repository owner must review the adjudication artifact before any canonical Codacy action:',
    formatted,
  ].join(' ');
}

function loadAdjudicationState(rootDir: string): FalsePositiveAdjudicationState | null {
  const artifactPath = path.join(rootDir, '.pulse', 'current', 'PULSE_FP_ADJUDICATION.json');
  if (!fs.existsSync(artifactPath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as unknown;
    if (!isFalsePositiveAdjudicationState(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function isFalsePositiveAdjudicationState(value: unknown): value is FalsePositiveAdjudicationState {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as { findings?: unknown };
  return Array.isArray(candidate.findings);
}

function makeFindingId(issue: CodacyIssueLike): string {
  const title = issue.patternId || issue.category;
  const raw = `codacy:${issue.filePath}:${title}:${issue.lineNumber ?? 'no-line'}`;
  return createHash('sha256').update(raw).digest('hex').substring(0, 16);
}

function hashFile(rootDir: string, filePath: string): string | null {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(rootDir, filePath);
  if (!fs.existsSync(absolutePath)) {
    return null;
  }
  return createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex');
}

function isSuppressedHumanDecision(finding: AdjudicatedFinding): boolean {
  return (
    finding.source === 'codacy' &&
    (finding.status === 'false_positive' || finding.status === 'accepted_risk') &&
    finding.expiresOnFileChange &&
    Boolean(finding.fileHashAtSuppression) &&
    Boolean(finding.evidenceFingerprintAtSuppression) &&
    Boolean(finding.proof)
  );
}

function matchesIssue(finding: AdjudicatedFinding, issue: CodacyIssueLike): boolean {
  return (
    finding.findingId === makeFindingId(issue) ||
    (finding.filePath === issue.filePath &&
      finding.line === issue.lineNumber &&
      finding.title === (issue.patternId || issue.category))
  );
}

function hasUnexpiredFileEvidence(
  finding: AdjudicatedFinding,
  issue: CodacyIssueLike,
  rootDir?: string,
): boolean {
  if (!isSuppressedHumanDecision(finding)) {
    return false;
  }
  if (!rootDir) {
    return true;
  }
  const currentHash = hashFile(rootDir, issue.filePath);
  if (currentHash === null || currentHash !== finding.fileHashAtSuppression) {
    return false;
  }
  const currentEvidenceFingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        source: finding.source,
        title: finding.title,
        filePath: finding.filePath,
        line: finding.line,
        capabilityId: finding.capabilityId,
        proof: finding.proof,
        fileHash: currentHash,
      }),
    )
    .digest('hex');

  return currentEvidenceFingerprint === finding.evidenceFingerprintAtSuppression;
}

function countRepeatedHumanDecisions(
  issue: CodacyIssueLike,
  adjudicationState: FalsePositiveAdjudicationState | null,
): number {
  if (!adjudicationState) {
    return 0;
  }
  return adjudicationState.findings.filter(
    (finding) =>
      isSuppressedHumanDecision(finding) && finding.title === (issue.patternId || issue.category),
  ).length;
}

function hasMatchingHumanDecision(
  issue: CodacyIssueLike,
  adjudicationState: FalsePositiveAdjudicationState | null,
  rootDir?: string,
): boolean {
  if (!adjudicationState) {
    return false;
  }
  return adjudicationState.findings.some(
    (finding) => matchesIssue(finding, issue) && hasUnexpiredFileEvidence(finding, issue, rootDir),
  );
}

function hasGovernanceOrPathContext(issue: CodacyIssueLike): boolean {
  const normalizedPath = issue.filePath.replace(/\\/g, '/');
  return (
    normalizedPath === 'AGENTS.md' ||
    normalizedPath === 'CLAUDE.md' ||
    normalizedPath === 'CODEX.md' ||
    normalizedPath === '.codacy.yml' ||
    normalizedPath === 'package.json' ||
    normalizedPath === '.husky/pre-push' ||
    normalizedPath.startsWith('ops/') ||
    normalizedPath.startsWith('scripts/ops/') ||
    normalizedPath.startsWith('.github/workflows/') ||
    normalizedPath.startsWith('docs/codacy/') ||
    normalizedPath.endsWith('/migration.sql') ||
    normalizedPath.includes('/migrations/')
  );
}

function hasIssueMetadataEvidence(issue: CodacyIssueLike): boolean {
  const metadata =
    `${issue.patternId} ${issue.category} ${issue.tool} ${issue.message}`.toLowerCase();
  const namesDemoOrTemplateRule =
    metadata.includes('demo') ||
    metadata.includes('template') ||
    metadata.includes('generic.sql') ||
    metadata.includes('rac_') ||
    metadata.includes('rac-table-access');

  return issue.tool.toLowerCase() === 'semgrep' && namesDemoOrTemplateRule;
}

function hasFalsePositiveEvidence(
  issue: CodacyIssueLike,
  adjudicationState: FalsePositiveAdjudicationState | null,
  rootDir?: string,
): boolean {
  return (
    hasGovernanceOrPathContext(issue) &&
    hasIssueMetadataEvidence(issue) &&
    countRepeatedHumanDecisions(issue, adjudicationState) >= MIN_REPEATED_HUMAN_DECISIONS &&
    hasMatchingHumanDecision(issue, adjudicationState, rootDir)
  );
}

/**
 * Classify Codacy HIGH severity issues into actionable vs non-actionable
 * buckets. The summary parameter accepts a parsed `PULSE_CODACY_STATE.json`
 * shape (`PulseCodacySummary`).
 */
export function classifyCodacyIssues(
  state: PulseCodacySummary,
  context: CodacyClassificationContext = {},
): CodacyClassification {
  const totalHigh = state.severityCounts.HIGH || 0;
  const nonActionableByPattern: Record<string, number> = {};
  const rootDir = context.rootDir || process.cwd();
  const adjudicationState =
    context.adjudicationState === undefined
      ? loadAdjudicationState(rootDir)
      : context.adjudicationState;

  for (const issue of state.highPriorityBatch) {
    if (!isHighIssue(issue.severityLevel)) {
      continue;
    }
    if (!hasFalsePositiveEvidence(issue, adjudicationState, rootDir)) {
      continue;
    }
    nonActionableByPattern[issue.patternId] = (nonActionableByPattern[issue.patternId] || 0) + 1;
  }

  const nonActionableHigh = Object.values(nonActionableByPattern).reduce(
    (sum, count) => sum + count,
    0,
  );

  // Guard against the highPriorityBatch being a sampled subset that
  // under-counts: if the batch counts more non-actionable than the total HIGH
  // (should not happen), clamp so actionableHigh never goes negative.
  const safeNonActionable = Math.min(nonActionableHigh, totalHigh);
  const actionableHigh = Math.max(0, totalHigh - safeNonActionable);

  const result: CodacyClassification = {
    actionableHigh,
    nonActionableHigh: safeNonActionable,
    totalHigh,
    nonActionableByPattern,
  };

  if (safeNonActionable > 0) {
    result.humanRequiredAction = buildHumanRequiredAction(nonActionableByPattern);
  }

  return result;
}
