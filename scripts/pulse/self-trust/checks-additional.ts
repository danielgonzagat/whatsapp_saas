import * as path from 'path';
import type { Break } from '../../types.manifest';
import type { PulseExecutionTrace } from '../../types.evidence';
import { pathExists, readDir, readTextFile, statPath } from '../../safe-fs';
import {
  runCrossArtifactConsistencyCheck,
  type ConsistencyResult,
} from '../../cross-artifact-consistency-check';
import { buildHardcodedFindingAuditArtifact } from '../../hardcoded-finding-audit/artifact-builder';
import { auditPulseNoHardcodedReality } from '../../no-hardcoded-reality-audit';
import { verifyExecutionTraceAuditTrail } from '../../execution-trace';
import {
  deriveUnitValue,
  deriveZeroValue,
} from '../../dynamic-reality-kernel/catalog-arithmetic';
import {
  type SelfTrustCheckpoint,
  checkpointScore,
  riskLabelCritical,
  riskLabelHigh,
  riskLabelMedium,
  loadExecutionTraceCandidate,
} from './checks-core';

export function checkEvidenceFreshness(stateFile: string): SelfTrustCheckpoint {
  let id = 'evidence-freshness';

  try {
    if (!pathExists(stateFile)) {
      return {
        id,
        name: 'Evidence File',
        description: 'External evidence must be cached',
        pass: false,
        reason: 'No evidence cache found',
        severity: riskLabelHigh(),
        score: checkpointScore(false),
      };
    }

    let stat = statPath(stateFile);
    let ageMinutes = (Date.now() - stat.mtimeMs) / 60000;

    if (ageMinutes > 1440) {
      // 24 hours
      return {
        id,
        name: 'Evidence Age',
        description: 'External evidence must be < 24 hours old',
        pass: false,
        reason: `Evidence is ${Math.round(ageMinutes)} minutes old`,
        severity: riskLabelHigh(),
        score: checkpointScore(false),
      };
    }

    let freshness = Math.max(0, 100 - (ageMinutes / 1440) * 100);

    return {
      id,
      name: 'Evidence Freshness',
      description: `Evidence is ${Math.round(ageMinutes)} minutes old`,
      pass: true,
      severity: riskLabelHigh(),
      score: freshness,
    };
  } catch (err) {
    return {
      id,
      name: 'Evidence Access',
      description: 'Evidence cache must be accessible',
      pass: false,
      reason: err instanceof Error ? err.message : String(err),
      severity: riskLabelHigh(),
      score: checkpointScore(false),
    };
  }
}

export function checkIdempotence(lastOutput: unknown, currentOutput: unknown): SelfTrustCheckpoint {
  let id = 'idempotence';

  try {
    let lastStr = JSON.stringify(lastOutput);
    let currentStr = JSON.stringify(currentOutput);

    let match = lastStr === currentStr;

    return {
      id,
      name: 'Output Idempotence',
      description: 'Multiple PULSE runs must produce identical results',
      pass: match,
      reason: match ? undefined : 'Output differs between runs (non-deterministic)',
      severity: riskLabelHigh(),
      score: checkpointScore(match),
    };
  } catch (err) {
    return {
      id,
      name: 'Idempotence Check',
      description: 'Outputs must be comparable',
      pass: false,
      reason: err instanceof Error ? err.message : String(err),
      severity: riskLabelMedium(),
      score: checkpointScore(false),
    };
  }
}

export function checkBreakConsistency(breaks: Break[]): SelfTrustCheckpoint {
  let id = 'break-consistency';

  let suspicionCount = deriveZeroValue();

  for (const brk of breaks) {
    if (hasSuspiciousBreakEvidence(brk)) {
      suspicionCount++;
    }
  }

  let falsePositiveRatio =
    breaks.length > deriveZeroValue() ? suspicionCount / breaks.length : deriveZeroValue();

  if (falsePositiveRatio > 0.1) {
    return {
      id,
      name: 'Break Consistency',
      description: 'Breaks must not be obviously false positives',
      pass: false,
      reason: `~${Math.round(falsePositiveRatio * 100)}% of breaks look suspicious`,
      severity: riskLabelMedium(),
      score: Math.max(0, 100 - falsePositiveRatio * 1000),
    };
  }

  return {
    id,
    name: 'Break Consistency',
    description: 'Breaks appear credible (no obvious false positives)',
    pass: true,
    severity: riskLabelMedium(),
    score: checkpointScore(true),
  };
}

function hasSuspiciousBreakEvidence(brk: Break): boolean {
  let serialized = JSON.stringify(brk).toLowerCase();
  let impossibleIndex = serialized.indexOf('impossible');
  if (impossibleIndex !== -1 && serialized.indexOf('pattern', impossibleIndex) !== -1) {
    return true;
  }
  let commentIndex = serialized.indexOf('comment');
  let lineIndex = commentIndex === -1 ? -1 : serialized.indexOf('line', commentIndex);
  return lineIndex !== -1 && hasLongDigitRun(serialized.slice(lineIndex));
}

function hasLongDigitRun(value: string): boolean {
  let runLength = deriveZeroValue();
  for (const ch of value) {
    if (ch >= '0' && ch <= '9') {
      runLength = runLength + deriveUnitValue();
      const limit =
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue();
      if (runLength >= limit) {
        return true;
      }
      continue;
    }
    runLength = deriveZeroValue();
  }
  return false;
}

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

    if (totalFindings > deriveZeroValue()) {
      let findingAuditDetails = artifact.files
        .flatMap((file) =>
          file.findings.map(
            (finding) =>
              `${file.filePath}:${finding.line}:${finding.column} ${finding.kind} ${finding.symbol}`,
          ),
        )
        .slice(
          deriveZeroValue(),
          deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue(),
        );
      let details = [...findingAuditDetails, ...hardcodedRealityDetails]
        .slice(
          deriveZeroValue(),
          deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue(),
        )
        .join(' | ');
      return {
        id,
        name: 'Parser Hardcoded Finding Audit',
        description: 'Parser Break emitters must not promote fixed detector labels to final truth',
        pass: false,
        reason: `${totalFindings} parser hardcoded finding risk(s): ${details}`,
        severity: riskLabelCritical(),
        score: checkpointScore(false),
      };
    }

    return {
      id,
      name: 'Parser Hardcoded Finding Audit',
      description: 'Parser Break emitters are free of hardcoded final-truth risks',
      pass: true,
      severity: riskLabelCritical(),
      score: checkpointScore(true),
    };
  } catch (err) {
    return {
      id,
      name: 'Parser Hardcoded Finding Audit',
      description: 'Parser hardcoded finding audit must complete without error',
      pass: false,
      reason: err instanceof Error ? err.message : String(err),
      severity: riskLabelCritical(),
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
        severity: riskLabelCritical(),
        score: checkpointScore(false),
      };
    }

    let missingNote =
      result.missingArtifacts.length > deriveZeroValue()
        ? ` (${result.missingArtifacts.length} artifact(s) absent — skipped)`
        : '';

    return {
      id,
      name: 'Cross-Artifact Consistency',
      description: `All loaded PULSE artifacts are mutually consistent${missingNote}`,
      pass: true,
      severity: riskLabelCritical(),
      score: checkpointScore(true),
    };
  } catch (err) {
    return {
      id,
      name: 'Cross-Artifact Consistency',
      description: 'Cross-artifact check must complete without error',
      pass: false,
      reason: err instanceof Error ? err.message : String(err),
      severity: riskLabelCritical(),
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
        severity: riskLabelCritical(),
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
      severity: riskLabelCritical(),
      score: checkpointScore(pass),
    };
  } catch (err) {
    return {
      id,
      name: 'Execution Trace Audit Trail',
      description: 'Execution trace audit verification must complete without error',
      pass: false,
      reason: err instanceof Error ? err.message : String(err),
      severity: riskLabelCritical(),
      score: checkpointScore(false),
    };
  }
}
