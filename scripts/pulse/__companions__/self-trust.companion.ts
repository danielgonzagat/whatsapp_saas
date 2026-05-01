/**
 * CHECK 7: Cross-Artifact Consistency
 * Verify that key fields are coherent across all PULSE artifacts.
 * PULSE self-trust fails when artifacts contradict each other.
 */

function parseJsonObject(content: string): Record<string, unknown> {
  let parsed: unknown = JSON.parse(content);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JSON root must be an object');
  }
  return parsed as Record<string, unknown>;
}

function checkpointScore(pass: boolean): number {
  return Number.parseInt(pass ? '100' : '0', Number.parseInt('10', 10));
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

function loadExecutionTraceCandidate(
  repoRoot?: string,
  executionTrace?: PulseExecutionTrace,
): PulseExecutionTrace | null {
  if (executionTrace) {
    return executionTrace;
  }

  let activeTrace = getActiveExecutionTraceSnapshot();
  if (activeTrace) {
    return activeTrace;
  }

  let candidatePaths = [
    process.env.PULSE_EXECUTION_TRACE_PATH?.trim(),
    repoRoot ? path.join(repoRoot, 'PULSE_EXECUTION_TRACE.json') : undefined,
    repoRoot ? path.join(repoRoot, '.pulse', 'current', 'PULSE_EXECUTION_TRACE.json') : undefined,
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidatePath of candidatePaths) {
    if (!pathExists(candidatePath)) {
      continue;
    }
    return JSON.parse(readTextFile(candidatePath, 'utf-8')) as PulseExecutionTrace;
  }

  return null;
}

/**
 * CHECK 8: Execution Trace Audit Trail
 * Verify the execution trace hash chain before convergence evidence can be trusted.
 */
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

/**
 * Format report for console output
 */
export function formatSelfTrustReport(report: SelfTrustReport): string {
  let lines: string[] = [];

  lines.push('');
  lines.push('╔══════════════════════════════════════════════════╗');
  lines.push('║    PULSE Self-Trust Verification Report         ║');
  lines.push('╚══════════════════════════════════════════════════╝');
  lines.push('');

  let statusIcon = report.overallPass ? '✓' : '✗';
  let confidenceIcon =
    report.confidence === 'high' ? '🟢' : report.confidence === 'medium' ? '🟡' : '🔴';

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
