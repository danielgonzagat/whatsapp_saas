// PULSE — Wave 7 Module C: False Positive Adjudication Engine
//
// Manages the full lifecycle of findings from Codacy, PULSE scans, Sentry,
// tests, and lint. Tracks adjudication verdicts, expires suppressions when
// the underlying file changes, and computes precision (true positives /
// (true positives + false positives)).

import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { ensureDir, pathExists, readJsonFile, readTextFile, writeTextFile } from './safe-fs';
import type { PulseScopeState } from './types';
import type { PulseCodacyIssue } from './types';
import type {
  AdjudicatedFinding,
  FalsePositiveAdjudicationState,
  FindingStatus,
} from './types.false-positive-adjudicator';

const ARTIFACT_FILE = 'PULSE_FP_ADJUDICATION.json';

function getArtifactPath(rootDir: string): string {
  return path.join(rootDir, '.pulse', 'current', ARTIFACT_FILE);
}

/** Load existing adjudication state, or null if not yet generated. */
function loadExisting(rootDir: string): FalsePositiveAdjudicationState | null {
  const filePath = getArtifactPath(rootDir);
  if (!pathExists(filePath)) return null;
  try {
    return readJsonFile<FalsePositiveAdjudicationState>(filePath);
  } catch {
    return null;
  }
}

/** Load scope state for Codacy findings. */
function loadScopeState(rootDir: string): PulseScopeState | null {
  const filePath = path.join(rootDir, '.pulse', 'current', 'PULSE_SCOPE_STATE.json');
  if (!pathExists(filePath)) return null;
  try {
    return readJsonFile<PulseScopeState>(filePath);
  } catch {
    return null;
  }
}

/** Compute sha256 hash of file contents for change detection. */
function hashFile(filePath: string): string | null {
  if (!pathExists(filePath)) return null;
  const content = readTextFile(filePath);
  return createHash('sha256').update(content).digest('hex');
}

function hashFindingFile(filePath: string, rootDir?: string): string | null {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : rootDir
      ? path.join(rootDir, filePath)
      : filePath;
  return hashFile(absolutePath);
}

function codacySeverityToSeverity(severityLevel: string): AdjudicatedFinding['severity'] {
  switch (severityLevel) {
    case 'CRITICAL':
      return 'critical';
    case 'HIGH':
      return 'high';
    case 'MEDIUM':
      return 'medium';
    case 'LOW':
      return 'low';
    default:
      return 'low';
  }
}

function makeFindingId(
  source: string,
  filePath: string,
  title: string,
  line: number | null,
): string {
  const raw = `${source}:${filePath}:${title}:${line ?? 'no-line'}`;
  return createHash('sha256').update(raw).digest('hex').substring(0, 16);
}

/**
 * Load new findings from Codacy scope state. Converts Codacy issues into
 * the adjudicated finding format, ready for matching against prior state.
 *
 * @param rootDir - Repository root directory
 */
export function loadNewFindings(rootDir: string): AdjudicatedFinding[] {
  const scopeState = loadScopeState(rootDir);
  if (!scopeState?.codacy?.highPriorityBatch) return [];

  const now = new Date().toISOString();
  const findings: AdjudicatedFinding[] = [];

  for (const issue of scopeState.codacy.highPriorityBatch) {
    const findingId = makeFindingId(
      'codacy',
      issue.filePath,
      issue.patternId || issue.category,
      issue.lineNumber,
    );

    findings.push({
      findingId,
      title: issue.patternId || issue.category,
      source: 'codacy',
      status: 'open',
      severity: codacySeverityToSeverity(issue.severityLevel),
      filePath: issue.filePath,
      line: issue.lineNumber ?? null,
      capabilityId: null,
      proof: null,
      expiresOnFileChange: false,
      fileHashAtSuppression: null,
      evidenceFingerprintAtSuppression: null,
      suppressedAt: null,
      lastChecked: now,
    });
  }

  return findings;
}

function buildEvidenceFingerprint(
  finding: AdjudicatedFinding,
  rootDir: string | undefined,
): string | null {
  const fileHash = hashFindingFile(finding.filePath, rootDir);
  if (!fileHash || !finding.proof) {
    return null;
  }

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

/**
 * Assign an adjudication verdict to a finding. Supports false_positive,
 * accepted_risk, confirmed, and fixed statuses. Records suppression
 * metadata (file hash, timestamp) for expiry tracking.
 *
 * @param finding - The finding to adjudicate
 * @param verdict - The adjudication verdict
 * @param proof - Supporting evidence or justification
 */
export function adjudicateFinding(
  finding: AdjudicatedFinding,
  verdict: FindingStatus,
  proof?: string,
  rootDir?: string,
): AdjudicatedFinding {
  const now = new Date().toISOString();
  const isSuppression = verdict === 'false_positive' || verdict === 'accepted_risk';
  const nextFinding = {
    ...finding,
    status: verdict,
    proof: proof ?? finding.proof,
    expiresOnFileChange: isSuppression,
    fileHashAtSuppression: isSuppression
      ? (hashFindingFile(finding.filePath, rootDir) ?? finding.fileHashAtSuppression)
      : finding.fileHashAtSuppression,
    suppressedAt: isSuppression ? now : finding.suppressedAt,
    lastChecked: now,
  };

  return {
    ...nextFinding,
    evidenceFingerprintAtSuppression: isSuppression
      ? (buildEvidenceFingerprint(nextFinding, rootDir) ??
        finding.evidenceFingerprintAtSuppression ??
        null)
      : finding.evidenceFingerprintAtSuppression,
  };
}

/**
 * Check all suppressed findings for expiry. A suppression expires when
 * the file at its path has changed since the suppression was recorded
 * (current hash differs from the hash at suppression time).
 *
 * @param findings - The full list of adjudicated findings
 * @param rootDir - Repository root directory
 */
export function checkExpiredSuppressions(
  findings: AdjudicatedFinding[],
  rootDir: string,
): AdjudicatedFinding[] {
  const now = new Date().toISOString();

  return findings.map((finding) => {
    if (finding.status !== 'false_positive' && finding.status !== 'accepted_risk') {
      return finding;
    }

    if (!finding.expiresOnFileChange || !finding.fileHashAtSuppression) {
      return finding;
    }

    const currentHash = hashFindingFile(finding.filePath, rootDir);

    if (!currentHash) {
      // File removed — suppression is stale
      return { ...finding, status: 'stale', lastChecked: now };
    }

    const currentEvidenceFingerprint = buildEvidenceFingerprint(finding, rootDir);

    if (
      currentHash !== finding.fileHashAtSuppression ||
      !currentEvidenceFingerprint ||
      !finding.evidenceFingerprintAtSuppression ||
      currentEvidenceFingerprint !== finding.evidenceFingerprintAtSuppression
    ) {
      // File/proof evidence changed — suppression expired.
      return {
        ...finding,
        status: 'stale',
        expiresOnFileChange: false,
        fileHashAtSuppression: null,
        evidenceFingerprintAtSuppression: null,
        suppressedAt: null,
        lastChecked: now,
      };
    }

    return { ...finding, lastChecked: now };
  });
}

/**
 * Compute precision: confirmed / (confirmed + false_positives).
 * Returns 1 when there are no classified findings (optimistic default).
 *
 * @param findings - The full list of adjudicated findings
 */
export function computePrecision(findings: AdjudicatedFinding[]): number {
  const confirmed = findings.filter((f) => f.status === 'confirmed').length;
  const falsePositives = findings.filter((f) => f.status === 'false_positive').length;

  const denominator = confirmed + falsePositives;
  if (denominator === 0) return 1;

  return confirmed / denominator;
}

function computeSummary(findings: AdjudicatedFinding[]): FalsePositiveAdjudicationState['summary'] {
  const expiredSuppressions = findings.filter((f) => f.status === 'stale').length;

  return {
    totalFindings: findings.length,
    open: findings.filter((f) => f.status === 'open').length,
    confirmed: findings.filter((f) => f.status === 'confirmed').length,
    fixed: findings.filter((f) => f.status === 'fixed').length,
    falsePositives: findings.filter((f) => f.status === 'false_positive').length,
    acceptedRisks: findings.filter((f) => f.status === 'accepted_risk').length,
    expiredSuppressions,
    precision: Math.round(computePrecision(findings) * 1000) / 1000,
  };
}

/**
 * Build the full false positive adjudication state.
 *
 * Workflow:
 * 1. Load existing adjudication state from PULSE_FP_ADJUDICATION.json
 * 2. Load new findings from Codacy scope state
 * 3. Match new findings against existing ones (by findingId)
 * 4. Add new unmatched findings as 'open'
 * 5. Check for expired suppressions (file changed since suppression)
 * 6. Compute precision and summary
 * 7. Store at .pulse/current/PULSE_FP_ADJUDICATION.json
 *
 * @param rootDir - Repository root directory
 */
export function buildFPAdjudicationState(rootDir: string): FalsePositiveAdjudicationState {
  const priorState = loadExisting(rootDir);
  const newFindings = loadNewFindings(rootDir);
  const now = new Date().toISOString();

  // Index prior findings by findingId
  const priorMap = new Map<string, AdjudicatedFinding>();
  if (priorState?.findings) {
    for (const prior of priorState.findings) {
      priorMap.set(prior.findingId, prior);
    }
  }

  // Merge: existing records preserved, new ones added as 'open'
  for (const newFinding of newFindings) {
    if (!priorMap.has(newFinding.findingId)) {
      priorMap.set(newFinding.findingId, {
        ...newFinding,
        status: 'open',
        lastChecked: now,
      });
    } else {
      // Update last checked timestamp for matched findings
      const existing = priorMap.get(newFinding.findingId)!;
      priorMap.set(newFinding.findingId, {
        ...existing,
        lastChecked: now,
      });
    }
  }

  let findings = [...priorMap.values()];

  // Check for expired suppressions
  findings = checkExpiredSuppressions(findings, rootDir);

  const state: FalsePositiveAdjudicationState = {
    generatedAt: now,
    summary: computeSummary(findings),
    findings,
  };

  const artifactPath = getArtifactPath(rootDir);
  ensureDir(path.dirname(artifactPath), { recursive: true });
  writeTextFile(artifactPath, JSON.stringify(state, null, 2));

  return state;
}
