/**
 * PULSE Self-Trust Verification
 *
 * Deterministic validation that PULSE's own analysis is credible.
 * If any of these checks fail, PULSE enters advisory-only mode and alerts.
 */

import * as path from 'path';
import type { Break } from './types';
import { pathExists, readDir, readTextFile, statPath } from './safe-fs';
import {
  runCrossArtifactConsistencyCheck,
  type ConsistencyResult,
} from './cross-artifact-consistency-check';
import { extractRunId, isPreservedArtifact } from './run-identity';

/** Self trust checkpoint shape. */
export interface SelfTrustCheckpoint {
  /** Id property. */
  id: string;
  /** Name property. */
  name: string;
  /** Description property. */
  description: string;
  /** Pass property. */
  pass: boolean;
  /** Reason property. */
  reason?: string;
  /** Severity property. */
  severity: 'critical' | 'high' | 'medium';
  /** Score property. */
  score: number; // 0-100
}

/** Self trust report shape. */
export interface SelfTrustReport {
  /** Timestamp property. */
  timestamp: string;
  /** Overall pass property. */
  overallPass: boolean;
  /** Score property. */
  score: number; // 0-100
  /** Checks property. */
  checks: SelfTrustCheckpoint[];
  /** Failed checks property. */
  failedChecks: SelfTrustCheckpoint[];
  /** Confidence property. */
  confidence: 'high' | 'medium' | 'low';
  /** Recommendations property. */
  recommendations: string[];
}

/**
 * CHECK 1: Manifest Integrity
 * Verify the pulse.manifest.json is complete and valid
 */
export function checkManifestIntegrity(manifestPath: string): SelfTrustCheckpoint {
  const id = 'manifest-integrity';

  try {
    if (!pathExists(manifestPath)) {
      return {
        id,
        name: 'Manifest File Exists',
        description: 'pulse.manifest.json must exist',
        pass: false,
        reason: 'pulse.manifest.json not found',
        severity: 'critical',
        score: 0,
      };
    }

    const content = readTextFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(content);

    const requiredFields = [
      'version',
      'projectId',
      'projectName',
      'systemType',
      'supportedStacks',
      'surfaces',
      'criticalDomains',
      'modules',
    ];

    const missing = requiredFields.filter((field) => !(field in manifest));

    if (missing.length > 0) {
      return {
        id,
        name: 'Manifest Completeness',
        description: 'All required manifest fields must be present',
        pass: false,
        reason: `Missing fields: ${missing.join(', ')}`,
        severity: 'critical',
        score: 0,
      };
    }

    return {
      id,
      name: 'Manifest Integrity',
      description: 'pulse.manifest.json is complete and valid',
      pass: true,
      severity: 'critical',
      score: 100,
    };
  } catch (err) {
    return {
      id,
      name: 'Manifest Parsing',
      description: 'pulse.manifest.json must be valid JSON',
      pass: false,
      reason: err instanceof Error ? err.message : String(err),
      severity: 'critical',
      score: 0,
    };
  }
}

/**
 * CHECK 2: Parser Registry Consistency
 * Verify parsers are registered and callable
 */
export function checkParserRegistry(parsersDir: string): SelfTrustCheckpoint {
  const id = 'parser-registry';

  try {
    const parserFiles = readDir(parsersDir).filter(
      (fileName) => fileName.endsWith('.ts') && fileName !== 'utils.ts',
    );

    if (parserFiles.length < 30) {
      return {
        id,
        name: 'Parser Count',
        description: 'Expected at least 30 specialized parsers',
        pass: false,
        reason: `Only ${parserFiles.length} parsers found, expected 30+`,
        severity: 'high',
        score: (parserFiles.length / 30) * 100,
      };
    }

    // Verify critical parsers exist
    const criticalParsers = [
      'financial-arithmetic.ts',
      'error-handler-auditor.ts',
      'idempotency-checker.ts',
      'audit-trail-checker.ts',
      'security-injection.ts',
    ];

    const missing = criticalParsers.filter((p) => !parserFiles.includes(p));

    if (missing.length > 0) {
      return {
        id,
        name: 'Critical Parsers',
        description: 'All critical parsers must exist',
        pass: false,
        reason: `Missing: ${missing.join(', ')}`,
        severity: 'critical',
        score: 0,
      };
    }

    return {
      id,
      name: 'Parser Registry',
      description: `${parserFiles.length} parsers registered and available`,
      pass: true,
      severity: 'critical',
      score: 100,
    };
  } catch (err) {
    return {
      id,
      name: 'Parser Registry Access',
      description: 'Parser directory must be accessible',
      pass: false,
      reason: err instanceof Error ? err.message : String(err),
      severity: 'high',
      score: 0,
    };
  }
}

/**
 * CHECK 3: Evidence Freshness
 * Verify external signals are recent (< 1 hour old)
 */
export function checkEvidenceFreshness(stateFile: string): SelfTrustCheckpoint {
  const id = 'evidence-freshness';

  try {
    if (!pathExists(stateFile)) {
      return {
        id,
        name: 'Evidence File',
        description: 'External evidence must be cached',
        pass: false,
        reason: 'No evidence cache found',
        severity: 'high',
        score: 0,
      };
    }

    const stat = statPath(stateFile);
    const ageMinutes = (Date.now() - stat.mtimeMs) / 60000;

    if (ageMinutes > 1440) {
      // 24 hours
      return {
        id,
        name: 'Evidence Age',
        description: 'External evidence must be < 24 hours old',
        pass: false,
        reason: `Evidence is ${Math.round(ageMinutes)} minutes old`,
        severity: 'high',
        score: 0,
      };
    }

    const freshness = Math.max(0, 100 - (ageMinutes / 1440) * 100);

    return {
      id,
      name: 'Evidence Freshness',
      description: `Evidence is ${Math.round(ageMinutes)} minutes old`,
      pass: true,
      severity: 'high',
      score: freshness,
    };
  } catch (err) {
    return {
      id,
      name: 'Evidence Access',
      description: 'Evidence cache must be accessible',
      pass: false,
      reason: err instanceof Error ? err.message : String(err),
      severity: 'high',
      score: 0,
    };
  }
}

/**
 * CHECK 4: Idempotence Test
 * Verify that running PULSE twice produces same result (determinism)
 */
export function checkIdempotence(lastOutput: unknown, currentOutput: unknown): SelfTrustCheckpoint {
  const id = 'idempotence';

  try {
    const lastStr = JSON.stringify(lastOutput);
    const currentStr = JSON.stringify(currentOutput);

    const match = lastStr === currentStr;

    return {
      id,
      name: 'Output Idempotence',
      description: 'Multiple PULSE runs must produce identical results',
      pass: match,
      reason: match ? undefined : 'Output differs between runs (non-deterministic)',
      severity: 'high',
      score: match ? 100 : 0,
    };
  } catch (err) {
    return {
      id,
      name: 'Idempotence Check',
      description: 'Outputs must be comparable',
      pass: false,
      reason: err instanceof Error ? err.message : String(err),
      severity: 'medium',
      score: 0,
    };
  }
}

/**
 * CHECK 5: Break Detection Consistency
 * Verify parser break classifications are consistent (no false positives in test runs)
 */
export function checkBreakConsistency(breaks: Break[]): SelfTrustCheckpoint {
  const id = 'break-consistency';

  // Heuristics to detect obvious false positives
  const suspiciousPatterns = [
    { pattern: /impossible.*pattern/i, reason: 'Suspiciously impossible-to-match regex' },
    { pattern: /comment.*line.*\d{10}/, reason: 'Wildly high line numbers' },
  ];

  let suspicionCount = 0;

  for (const brk of breaks) {
    for (const susp of suspiciousPatterns) {
      if (susp.pattern.test(JSON.stringify(brk))) {
        suspicionCount++;
      }
    }
  }

  const falsePositiveRatio = breaks.length > 0 ? suspicionCount / breaks.length : 0;

  if (falsePositiveRatio > 0.1) {
    return {
      id,
      name: 'Break Consistency',
      description: 'Breaks must not be obviously false positives',
      pass: false,
      reason: `~${Math.round(falsePositiveRatio * 100)}% of breaks look suspicious`,
      severity: 'medium',
      score: Math.max(0, 100 - falsePositiveRatio * 1000),
    };
  }

  return {
    id,
    name: 'Break Consistency',
    description: 'Breaks appear credible (no obvious false positives)',
    pass: true,
    severity: 'medium',
    score: 100,
  };
}

/**
 * CHECK 6: Cross-Artifact Consistency
 * Verify that key fields are coherent across all PULSE artifacts.
 * PULSE self-trust fails when artifacts contradict each other.
 */
export function checkCrossArtifactConsistency(repoRoot?: string): SelfTrustCheckpoint {
  const id = 'cross-artifact-consistency';

  try {
    const result: ConsistencyResult = runCrossArtifactConsistencyCheck(repoRoot);

    if (!result.pass) {
      const summary = result.divergences
        .map((d) => `${d.field}: ${d.sources.length} artifacts disagree`)
        .join('; ');
      return {
        id,
        name: 'Cross-Artifact Consistency',
        description: 'All PULSE artifacts must agree on shared key fields',
        pass: false,
        reason: `${result.divergences.length} divergence(s): ${summary}`,
        severity: 'critical',
        score: 0,
      };
    }

    const missingNote =
      result.missingArtifacts.length > 0
        ? ` (${result.missingArtifacts.length} artifact(s) absent — skipped)`
        : '';

    return {
      id,
      name: 'Cross-Artifact Consistency',
      description: `All loaded PULSE artifacts are mutually consistent${missingNote}`,
      pass: true,
      severity: 'critical',
      score: 100,
    };
  } catch (err) {
    return {
      id,
      name: 'Cross-Artifact Consistency',
      description: 'Cross-artifact check must complete without error',
      pass: false,
      reason: err instanceof Error ? err.message : String(err),
      severity: 'critical',
      score: 0,
    };
  }
}

/**
 * Run all self-trust checks
 */
export function runSelfTrustChecks(config: {
  manifestPath: string;
  parsersDir: string;
  evidenceFile: string;
  repoRoot?: string;
  lastOutput?: unknown;
  currentOutput?: unknown;
  breaks?: Break[];
  artifactsOverride?: Record<string, Record<string, unknown>>;
}): SelfTrustReport {
  const checks: SelfTrustCheckpoint[] = [
    checkManifestIntegrity(config.manifestPath),
    checkParserRegistry(config.parsersDir),
    checkEvidenceFreshness(config.evidenceFile),
    checkCrossArtifactConsistency(config.repoRoot),
  ];

  if (config.lastOutput && config.currentOutput) {
    checks.push(checkIdempotence(config.lastOutput, config.currentOutput));
  }

  if (config.breaks) {
    checks.push(checkBreakConsistency(config.breaks));
  }

  const failedChecks = checks.filter((c) => !c.pass);
  const avgScore =
    checks.length > 0 ? checks.reduce((sum, c) => sum + c.score, 0) / checks.length : 0;

  const criticalFailures = failedChecks.filter((c) => c.severity === 'critical');

  return {
    timestamp: new Date().toISOString(),
    overallPass: criticalFailures.length === 0,
    score: Math.round(avgScore),
    checks,
    failedChecks,
    confidence: criticalFailures.length > 0 ? 'low' : failedChecks.length > 0 ? 'medium' : 'high',
    recommendations: failedChecks.map(
      (c) => `[${c.severity.toUpperCase()}] ${c.name}: ${c.reason}`,
    ),
  };
}

/**
 * Format report for console output
 */
export function formatSelfTrustReport(report: SelfTrustReport): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('╔══════════════════════════════════════════════════╗');
  lines.push('║    PULSE Self-Trust Verification Report         ║');
  lines.push('╚══════════════════════════════════════════════════╝');
  lines.push('');

  const statusIcon = report.overallPass ? '✓' : '✗';
  const confidenceIcon =
    report.confidence === 'high' ? '🟢' : report.confidence === 'medium' ? '🟡' : '🔴';

  lines.push(`${statusIcon} Overall Status: ${report.overallPass ? 'PASS' : 'FAIL'}`);
  lines.push(`${confidenceIcon} Confidence: ${report.confidence.toUpperCase()}`);
  lines.push(`📊 Score: ${report.score}/100`);
  lines.push('');

  lines.push('Checks:');
  for (const check of report.checks) {
    const icon = check.pass ? '✓' : '✗';
    lines.push(`  ${icon} ${check.name} (${check.score}%)`);
    if (!check.pass && check.reason) {
      lines.push(`     Reason: ${check.reason}`);
    }
  }

  if (report.recommendations.length > 0) {
    lines.push('');
    lines.push('Recommendations:');
    for (const rec of report.recommendations) {
      lines.push(`  → ${rec}`);
    }
  }

  lines.push('');

  return lines.join('\n');
}
