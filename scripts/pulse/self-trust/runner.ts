import type { Break } from '../../types.manifest';
import type { PulseExecutionTrace } from '../../types.evidence';
import {
  deriveUnitValue,
  deriveZeroValue,
} from '../../dynamic-reality-kernel/catalog-arithmetic';
import {
  type SelfTrustCheckpoint,
  type SelfTrustReport,
  isCriticalSeverity,
  isHighConfidenceLabel,
  isMediumConfidenceLabel,
  checkManifestIntegrity,
  checkParserRegistry,
} from './checks-core';
import {
  checkEvidenceFreshness,
  checkIdempotence,
  checkBreakConsistency,
  checkParserHardcodedFindingAudit,
  checkCrossArtifactConsistency,
  checkExecutionTraceAuditTrail,
} from './checks-additional';

function deriveConfidenceLabel(
  criticalFailures: number,
  otherFailures: number,
): 'high' | 'medium' | 'low' {
  if (criticalFailures > deriveZeroValue()) return 'low';
  if (otherFailures > deriveZeroValue()) return 'medium';
  return 'high';
}

export function runSelfTrustChecks(config: {
  manifestPath: string;
  parsersDir: string;
  evidenceFile: string;
  repoRoot?: string;
  lastOutput?: unknown;
  currentOutput?: unknown;
  breaks?: Break[];
  artifactsOverride?: Record<string, Record<string, unknown>>;
  executionTrace?: PulseExecutionTrace;
}): SelfTrustReport {
  let checks: SelfTrustCheckpoint[] = [
    checkManifestIntegrity(config.manifestPath),
    checkParserRegistry(config.parsersDir),
    checkParserHardcodedFindingAudit(config.parsersDir),
    checkEvidenceFreshness(config.evidenceFile),
    checkCrossArtifactConsistency(config.repoRoot, config.artifactsOverride),
    checkExecutionTraceAuditTrail({
      repoRoot: config.repoRoot,
      executionTrace: config.executionTrace,
    }),
  ];

  if (config.lastOutput && config.currentOutput) {
    checks.push(checkIdempotence(config.lastOutput, config.currentOutput));
  }

  if (config.breaks) {
    checks.push(checkBreakConsistency(config.breaks));
  }

  let failedChecks = checks.filter((c) => !c.pass);
  let avgScore =
    checks.length > deriveZeroValue()
      ? checks.reduce((sum, c) => sum + c.score, deriveZeroValue()) / checks.length
      : deriveZeroValue();

  let criticalFailures = failedChecks.filter((c) => isCriticalSeverity(c.severity));

  return {
    timestamp: new Date().toISOString(),
    overallPass: criticalFailures.length === deriveZeroValue(),
    score: Math.round(avgScore),
    checks,
    failedChecks,
    confidence: deriveConfidenceLabel(
      criticalFailures.length,
      failedChecks.length - criticalFailures.length,
    ),
    recommendations: failedChecks.map(
      (c) => `[${c.severity.toUpperCase()}] ${c.name}: ${c.reason}`,
    ),
  };
}

export function formatSelfTrustReport(report: SelfTrustReport): string {
  let lines: string[] = [];

  lines.push('');
  lines.push('╔══════════════════════════════════════════════════╗');
  lines.push('║    PULSE Self-Trust Verification Report         ║');
  lines.push('╚══════════════════════════════════════════════════╝');
  lines.push('');

  let statusIcon = report.overallPass ? '✓' : '✗';
  let confidenceIcon = isHighConfidenceLabel(report.confidence)
    ? '🟢'
    : isMediumConfidenceLabel(report.confidence)
      ? '🟡'
      : '🔴';

  lines.push(`${statusIcon} Overall Status: ${report.overallPass ? 'PASS' : 'FAIL'}`);
  lines.push(`${confidenceIcon} Confidence: ${report.confidence.toUpperCase()}`);
  lines.push(`📊 Score: ${report.score}/100`);
  lines.push('');

  lines.push('Checks:');
  for (const check of report.checks) {
    let icon = check.pass ? '✓' : '✗';
    lines.push(`  ${icon} ${check.name} (${check.score}%)`);
    if (!check.pass && check.reason) {
      lines.push(`     Reason: ${check.reason}`);
    }
  }

  if (report.recommendations.length > deriveZeroValue()) {
    lines.push('');
    lines.push('Recommendations:');
    for (const rec of report.recommendations) {
      lines.push(`  → ${rec}`);
    }
  }

  lines.push('');

  return lines.join('\n');
}
