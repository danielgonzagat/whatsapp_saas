import * as path from 'path';
import type { Break, PulseExecutionTrace } from '../../types';
import { pathExists, readDir, readTextFile } from '../../safe-fs';
import { buildHardcodedFindingAuditArtifact } from '../../hardcoded-finding-audit';
import { auditPulseNoHardcodedReality } from '../../no-hardcoded-reality-audit';
import {
  runCrossArtifactConsistencyCheck,
  type ConsistencyResult,
} from '../../cross-artifact-consistency-check';
import { verifyExecutionTraceAuditTrail } from '../../execution-trace';
import {
  type SelfTrustCheckpoint,
  type SelfTrustReport,
  checkpointScore,
  loadExecutionTraceCandidate,
} from './checkpoint-types';
import {
  checkManifestIntegrity,
  checkParserRegistry,
  checkEvidenceFreshness,
  checkIdempotence,
  checkBreakConsistency,
} from './checks-foundational';

function collectParserAuditSources(
  parsersDir: string,
): Array<{ filePath: string; source: string }> {
  if (!pathExists(parsersDir)) {
    return [];
  }

  return (readDir(parsersDir, { recursive: true }) as string[])
    .filter((entry) => entry.endsWith('.ts') && !entry.includes('__tests__'))
    .sort()
    .map((entry) => {
      let absolutePath = path.join(parsersDir, entry);
      let repoRelative = path
        .relative(repoParserRoot(parsersDir), absolutePath)
        .split(path.sep)
        .join('/');
      return {
        filePath: repoRelative,
        source: readTextFile(absolutePath, 'utf-8'),
      };
    });
}

function repoParserRoot(parsersDir: string): string {
  return path.resolve(parsersDir, '..', '..');
}

function collectParserHardcodedRealityDetails(parsersDir: string): string[] {
  let repoRoot = path.resolve(parsersDir, '..', '..', '..');
  return auditPulseNoHardcodedReality(repoRoot)
    .findings.filter((finding) => isParserSourcePath(finding.filePath))
    .filter(
      (finding) =>
        finding.kind === 'hardcoded_break_push_type_risk' ||
        finding.kind === 'hardcoded_parser_rule_blocker_risk',
    )
    .map((finding) => {
      let samples = finding.samples.length > 0 ? ` ${finding.samples.join(',')}` : '';
      return `${finding.filePath}:${finding.line}:${finding.column} ${finding.kind}${samples}`;
    });
}

function isParserSourcePath(filePath: string): boolean {
  return filePath.split('\\').join('/').split('/').includes('parsers');
}

export function checkParserHardcodedFindingAudit(parsersDir: string): SelfTrustCheckpoint {
  let id = 'parser-hardcoded-finding-audit';

  try {
    let artifact = buildHardcodedFindingAuditArtifact(collectParserAuditSources(parsersDir));
    let hardcodedRealityDetails = collectParserHardcodedRealityDetails(parsersDir);
    let totalFindings = artifact.totalFindings + hardcodedRealityDetails.length;

    if (totalFindings > 0) {
      let findingAuditDetails = artifact.files
        .flatMap((file) =>
          file.findings.map(
            (finding) =>
              `${file.filePath}:${finding.line}:${finding.column} ${finding.kind} ${finding.symbol}`,
          ),
        )
        .slice(0, 5);
      let details = [...findingAuditDetails, ...hardcodedRealityDetails].slice(0, 5).join(' | ');
      return {
        id,
        name: 'Parser Hardcoded Finding Audit',
        description: 'Parser Break emitters must not promote fixed detector labels to final truth',
        pass: false,
        reason: `${totalFindings} parser hardcoded finding risk(s): ${details}`,
        severity: 'critical',
        score: checkpointScore(false),
      };
    }

    return {
      id,
      name: 'Parser Hardcoded Finding Audit',
      description: 'Parser Break emitters are free of hardcoded final-truth risks',
      pass: true,
      severity: 'critical',
      score: checkpointScore(true),
    };
  } catch (err) {
    return {
      id,
      name: 'Parser Hardcoded Finding Audit',
      description: 'Parser hardcoded finding audit must complete without error',
      pass: false,
      reason: err instanceof Error ? err.message : String(err),
      severity: 'critical',
      score: checkpointScore(false),
    };
  }
}

export function checkCrossArtifactConsistency(
  repoRoot?: string,
  artifactsOverride?: Record<string, Record<string, unknown>>,
): SelfTrustCheckpoint {
  let id = 'cross-artifact-consistency';

  try {
    let result: ConsistencyResult = runCrossArtifactConsistencyCheck(repoRoot, artifactsOverride);

    if (!result.pass) {
      let summary = result.divergences
        .map((d) => `${d.field}: ${d.sources.length} artifacts disagree`)
        .join('; ');
      return {
        id,
        name: 'Cross-Artifact Consistency',
        description: 'All PULSE artifacts must agree on shared key fields',
        pass: false,
        reason: `${result.divergences.length} divergence(s): ${summary}`,
        severity: 'critical',
        score: checkpointScore(false),
      };
    }

    let missingNote =
      result.missingArtifacts.length > 0
        ? ` (${result.missingArtifacts.length} artifact(s) absent — skipped)`
        : '';

    return {
      id,
      name: 'Cross-Artifact Consistency',
      description: `All loaded PULSE artifacts are mutually consistent${missingNote}`,
      pass: true,
      severity: 'critical',
      score: checkpointScore(true),
    };
  } catch (err) {
    return {
      id,
      name: 'Cross-Artifact Consistency',
      description: 'Cross-artifact check must complete without error',
      pass: false,
      reason: err instanceof Error ? err.message : String(err),
      severity: 'critical',
      score: checkpointScore(false),
    };
  }
}

export function checkExecutionTraceAuditTrail(config: {
  repoRoot?: string;
  executionTrace?: PulseExecutionTrace;
}): SelfTrustCheckpoint {
  let id = 'execution-trace-audit-trail';

  try {
    let trace = loadExecutionTraceCandidate(config.repoRoot, config.executionTrace);

    if (!trace) {
      return {
        id,
        name: 'Execution Trace Audit Trail',
        description: 'Execution trace must be present before convergence evidence is trusted',
        pass: false,
        reason: 'No execution trace artifact or active tracer snapshot was found',
        severity: 'critical',
        score: checkpointScore(false),
      };
    }

    let pass = verifyExecutionTraceAuditTrail(trace);
    return {
      id,
      name: 'Execution Trace Audit Trail',
      description: 'Execution trace phase history must match its immutable audit digest',
      pass,
      reason: pass
        ? undefined
        : 'Execution trace audit digest does not match current phase history',
      severity: 'critical',
      score: checkpointScore(pass),
    };
  } catch (err) {
    return {
      id,
      name: 'Execution Trace Audit Trail',
      description: 'Execution trace audit verification must complete without error',
      pass: false,
      reason: err instanceof Error ? err.message : String(err),
      severity: 'critical',
      score: checkpointScore(false),
    };
  }
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
    checks.length > 0 ? checks.reduce((sum, c) => sum + c.score, 0) / checks.length : 0;

  let criticalFailures = failedChecks.filter((c) => c.severity === 'critical');

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

export function formatSelfTrustReport(report: SelfTrustReport): string {
  let lines: string[] = [];

  lines.push('');
  lines.push(
    '\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563',
  );
  lines.push('\u2551    PULSE Self-Trust Verification Report         \u2551');
  lines.push(
    '\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2569',
  );
  lines.push('');

  let statusIcon = report.overallPass ? '\u2713' : '\u2717';
  let confidenceIcon =
    report.confidence === 'high'
      ? '\uD83D\uDFE2'
      : report.confidence === 'medium'
        ? '\uD83D\uDFE1'
        : '\uD83D\uDD34';

  lines.push(`${statusIcon} Overall Status: ${report.overallPass ? 'PASS' : 'FAIL'}`);
  lines.push(`${confidenceIcon} Confidence: ${report.confidence.toUpperCase()}`);
  lines.push(`\uD83D\uDCCA Score: ${report.score}/100`);
  lines.push('');

  lines.push('Checks:');
  for (const check of report.checks) {
    let icon = check.pass ? '\u2713' : '\u2717';
    lines.push(`  ${icon} ${check.name} (${check.score}%)`);
    if (!check.pass && check.reason) {
      lines.push(`     Reason: ${check.reason}`);
    }
  }

  if (report.recommendations.length > 0) {
    lines.push('');
    lines.push('Recommendations:');
    for (const rec of report.recommendations) {
      lines.push(`  \u2192 ${rec}`);
    }
  }

  lines.push('');

  return lines.join('\n');
}
