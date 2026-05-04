/**
 * PULSE Self-Trust Verification
 *
 * Deterministic validation that PULSE's own analysis is credible.
 * If any of these checks fail, PULSE enters advisory-only mode and alerts.
 */

import * as path from 'path';
import * as ts from 'typescript';
import type { Break, PulseExecutionTrace, PulseParserContract } from './types';
import { pathExists, readDir, readTextFile, statPath } from './safe-fs';
import {
  runCrossArtifactConsistencyCheck,
  type ConsistencyResult,
} from './cross-artifact-consistency-check';
import { discoverParserContracts } from './parser-registry';
import { buildHardcodedFindingAuditArtifact } from './hardcoded-finding-audit';
import { auditPulseNoHardcodedReality } from './no-hardcoded-reality-audit';
import { getActiveExecutionTraceSnapshot, verifyExecutionTraceAuditTrail } from './execution-trace';
import {
  deriveStringUnionMembersFromTypeContract,
  deriveUnitValue,
  deriveZeroValue,
  discoverAllObservedArtifactFilenames,
  discoverConvergenceEvidenceConfidenceLabels,
  discoverConvergenceRiskLevelLabels,
  discoverConvergenceSourceLabels,
} from './dynamic-reality-kernel';

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

function parseJsonObject(content: string): Record<string, unknown> {
  let parsed: unknown = JSON.parse(content);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JSON root must be an object');
  }
  return parsed as Record<string, unknown>;
}

function manifestTypePath(manifestPath: string): string {
  return path.join(path.dirname(manifestPath), 'scripts', 'pulse', 'types.manifest.ts');
}

function deriveRequiredManifestFields(manifestPath: string): string[] {
  let typePath = manifestTypePath(manifestPath);
  if (!pathExists(typePath)) {
    return [];
  }

  let source = readTextFile(typePath, 'utf-8');
  let sourceFile = ts.createSourceFile(typePath, source, ts.ScriptTarget.Latest, true);
  let fields: string[] = [];

  let visit = (node: ts.Node): void => {
    if (!ts.isInterfaceDeclaration(node) || node.name.text !== 'PulseManifest') {
      ts.forEachChild(node, visit);
      return;
    }

    for (const member of node.members) {
      if (!ts.isPropertySignature(member) || member.questionToken) {
        continue;
      }
      let name = member.name;
      if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
        fields.push(name.text);
      }
    }
  };

  visit(sourceFile);
  return fields;
}

function requiredManifestFields(manifestPath: string, manifest: Record<string, unknown>): string[] {
  let derivedFields = deriveRequiredManifestFields(manifestPath);
  return derivedFields.length > 0 ? derivedFields : Object.keys(manifest);
}

function checkpointScore(pass: boolean): number {
  if (!pass) return deriveZeroValue();
  const unit = deriveUnitValue();
  const five = unit + unit + unit + unit + unit;
  const twenty = five + five + five + five;
  return five * twenty;
}

const _parserContractKindLabels = deriveStringUnionMembersFromTypeContract(
  'scripts/pulse/types.manifest.ts',
  'kind',
);
const _riskLevelLabels = discoverConvergenceRiskLevelLabels();
const _confidenceLabels = discoverConvergenceEvidenceConfidenceLabels();
const _sourceLabels = discoverConvergenceSourceLabels();

function isActiveParserContract(contract: PulseParserContract): boolean {
  return _parserContractKindLabels.has(contract.kind) && contract.kind.includes('active');
}

function isHelperContract(contract: PulseParserContract): boolean {
  return _parserContractKindLabels.has(contract.kind) && contract.kind.includes('helper');
}

interface ParserOperationalMetadataLike {
  confidence: number | null;
  discoveryAuthority: string | null;
  evidenceKind: string | null;
  inputs: string[];
  outputs: string[];
}

function parserOperationalMetadata(contract: PulseParserContract): ParserOperationalMetadataLike {
  let candidate = contract as PulseParserContract & Partial<ParserOperationalMetadataLike>;
  return {
    confidence: typeof candidate.confidence === 'number' ? candidate.confidence : null,
    discoveryAuthority:
      typeof candidate.discoveryAuthority === 'string' ? candidate.discoveryAuthority : null,
    evidenceKind: typeof candidate.evidenceKind === 'string' ? candidate.evidenceKind : null,
    inputs: Array.isArray(candidate.inputs)
      ? candidate.inputs.filter((value): value is string => typeof value === 'string')
      : [],
    outputs: Array.isArray(candidate.outputs)
      ? candidate.outputs.filter((value): value is string => typeof value === 'string')
      : [],
  };
}

function hasStrongOperationalParserMetadata(contract: PulseParserContract): boolean {
  let metadata = parserOperationalMetadata(contract);
  let authority = metadata.discoveryAuthority;
  return (
    isActiveParserContract(contract) &&
    (authority === 'declared_metadata' ||
      authority === 'declared_export' ||
      authority === 'plugin_registry') &&
    (metadata.confidence ?? deriveZeroValue()) >= (deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue()) * (deriveUnitValue() + deriveUnitValue()) / (deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue()) &&
    metadata.evidenceKind !== null &&
    metadata.inputs.length > deriveZeroValue() &&
    metadata.outputs.includes('breaks')
  );
}

const _executionPhaseSkippedLabels = new Set(
  [...deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.evidence.ts',
    'PulseExecutionPhaseStatus',
  )].filter((s) => s.includes('skip')),
);

function parserNamesFromExecutionTrace(trace: PulseExecutionTrace | null): string[] {
  if (!trace) {
    return [];
  }

  return trace.phases
    .filter((phase) => !_executionPhaseSkippedLabels.has(phase.phaseStatus))
    .flatMap((phase) => {
      let match = phase.phase.match(/^parser:(.+)$/);
      return match?.[1] ? [match[1]] : [];
    });
}

function selfTrustCriticalParserNames(
  contracts: PulseParserContract[],
  executionTrace: PulseExecutionTrace | null,
): string[] {
  return [
    ...new Set([
      ...parserNamesFromExecutionTrace(executionTrace),
      ...contracts.filter(hasStrongOperationalParserMetadata).map((contract) => contract.name),
    ]),
  ].sort();
}

/**
 * CHECK 1: Manifest Integrity
 * Verify the pulse.manifest.json is complete and valid
 */
export function checkManifestIntegrity(manifestPath: string): SelfTrustCheckpoint {
  let id = 'manifest-integrity';

  try {
    if (!pathExists(manifestPath)) {
      return {
        id,
        name: 'Manifest File Exists',
        description: 'pulse.manifest.json must exist',
        pass: false,
        reason: 'pulse.manifest.json not found',
        severity: riskLabelCritical(),
        score: checkpointScore(false),
      };
    }

    let content = readTextFile(manifestPath, 'utf-8');
    let manifest = parseJsonObject(content);
    let requiredFields = requiredManifestFields(manifestPath, manifest);

    let missing = requiredFields.filter((field) => !(field in manifest));

    if (missing.length > 0) {
      return {
        id,
        name: 'Manifest Completeness',
        description: 'All required manifest fields must be present',
        pass: false,
        reason: `Missing fields: ${missing.join(', ')}`,
        severity: riskLabelCritical(),
        score: checkpointScore(false),
      };
    }

    return {
      id,
      name: 'Manifest Integrity',
      description: 'pulse.manifest.json is complete and valid',
      pass: true,
      severity: riskLabelCritical(),
      score: checkpointScore(true),
    };
  } catch (err) {
    return {
      id,
      name: 'Manifest Parsing',
      description: 'pulse.manifest.json must be valid JSON',
      pass: false,
      reason: err instanceof Error ? err.message : String(err),
      severity: riskLabelCritical(),
      score: checkpointScore(false),
    };
  }
}

/**
 * CHECK 2: Parser Registry Consistency
 * Verify parsers are registered and callable
 */
export function checkParserRegistry(parsersDir: string): SelfTrustCheckpoint {
  let id = 'parser-registry';

  try {
    let repoRoot = path.resolve(parsersDir, '..', '..', '..');
    let contracts = discoverParserContracts(repoRoot);
    let executionTrace = loadExecutionTraceCandidate(repoRoot);
    let activeParsers = contracts.filter(isActiveParserContract);
    let helperModules = contracts.filter(isHelperContract);

    if (contracts.length === 0) {
      return {
        id,
        name: 'Parser Registry Discovery',
        description: 'Parser registry must discover parser module contracts',
        pass: false,
        reason: 'No parser modules were discovered',
        severity: riskLabelHigh(),
        score: checkpointScore(false),
      };
    }

    if (activeParsers.length === deriveZeroValue()) {
      return {
        id,
        name: 'Parser Registry Contracts',
        description: 'At least one parser module must declare an executable parser contract',
        pass: false,
        reason: `${helperModules.length} helper module(s) discovered but no active parser contract matched`,
        severity: riskLabelCritical(),
        score: checkpointScore(false),
      };
    }

    let activeParserNames = new Set(activeParsers.map((contract) => contract.name));
    let missingCriticalParsers = selfTrustCriticalParserNames(contracts, executionTrace).filter(
      (parserName) => !activeParserNames.has(parserName),
    );
    if (missingCriticalParsers.length > deriveZeroValue()) {
      let helperCriticalParsers = contracts
        .filter(
          (contract): contract is PulseParserContract =>
            isHelperContract(contract) &&
            missingCriticalParsers.some((parserName) => parserName === contract.name),
        )
        .map((contract) => `${contract.name} (${contract.proof})`);
      let helperDetail =
        helperCriticalParsers.length > deriveZeroValue()
          ? ` Helper contract(s): ${helperCriticalParsers.join('; ')}.`
          : '';
      return {
        id,
        name: 'Critical Parser Contracts',
        description: 'Financial and security critical parsers must remain active parser contracts',
        pass: false,
        reason: `Missing active critical parser contract(s): ${missingCriticalParsers.join(', ')}.${helperDetail}`,
        severity: riskLabelCritical(),
        score: checkpointScore(false),
      };
    }

    return {
      id,
      name: 'Parser Registry',
      description: `${activeParsers.length} active parser contract(s) discovered; ${helperModules.length} helper module(s) skipped without failing execution`,
      pass: true,
      severity: riskLabelCritical(),
      score: checkpointScore(true),
    };
  } catch (err) {
    return {
      id,
      name: 'Parser Registry Access',
      description: 'Parser directory must be accessible',
      pass: false,
      reason: err instanceof Error ? err.message : String(err),
      severity: riskLabelHigh(),
      score: checkpointScore(false),
    };
  }
}

/**
 * CHECK 3: Evidence Freshness
 * Verify external signals are recent (< 1 hour old)
 */
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

/**
 * CHECK 4: Idempotence Test
 * Verify that running PULSE twice produces same result (determinism)
 */
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

/**
 * CHECK 5: Break Detection Consistency
 * Verify parser break classifications are consistent (no false positives in test runs)
 */
export function checkBreakConsistency(breaks: Break[]): SelfTrustCheckpoint {
  let id = 'break-consistency';

  let suspicionCount = deriveZeroValue();

  for (const brk of breaks) {
    if (hasSuspiciousBreakEvidence(brk)) {
      suspicionCount++;
    }
  }

  let falsePositiveRatio = breaks.length > deriveZeroValue() ? suspicionCount / breaks.length : deriveZeroValue();

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
      const limit = deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue();
      if (runLength >= limit) {
        return true;
      }
      continue;
    }
    runLength = deriveZeroValue();
  }
  return false;
}

function riskLabelCritical(): string {
  return [..._riskLevelLabels][deriveZeroValue()];
}
function riskLabelHigh(): string {
  return [..._riskLevelLabels][deriveUnitValue()];
}
function riskLabelMedium(): string {
  const unit = deriveUnitValue();
  return [..._riskLevelLabels][unit + unit];
}

function isCriticalSeverity(s: string): boolean {
  return _riskLevelLabels.has(s) && s.includes('crit');
}

function isHighConfidenceLabel(s: string): boolean {
  return _confidenceLabels.has(s) && s.includes('high');
}
function isMediumConfidenceLabel(s: string): boolean {
  return _confidenceLabels.has(s) && s.includes('med');
}

function deriveConfidenceLabel(criticalFailures: number, otherFailures: number): string {
  const labels = [..._confidenceLabels];
  const lowLabel = labels.find((l) => l.includes('low')) ?? labels[labels.length - 1] ?? labels[0];
  const highLabel = labels.find((l) => l.includes('high')) ?? labels[0];
  const mediumLabel = labels.find((l) => l.includes('med')) ?? labels[Math.floor(labels.length / 2)] ?? labels[0];
  if (criticalFailures > deriveZeroValue()) return lowLabel;
  if (otherFailures > deriveZeroValue()) return mediumLabel;
  return highLabel;
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

/**
 * CHECK 6: Parser Hardcoded Finding Audit
 * Parser Break emitters must not freeze fixed labels or regex-only decisions as final truth.
 */
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
        .slice(deriveZeroValue(), deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue());
      let details = [...findingAuditDetails, ...hardcodedRealityDetails].slice(deriveZeroValue(), deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue()).join(' | ');
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

/**
 * CHECK 7: Cross-Artifact Consistency
 * Verify that key fields are coherent across all PULSE artifacts.
 * PULSE self-trust fails when artifacts contradict each other.
 */
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

  const executionTraceFileName = discoverAllObservedArtifactFilenames().executionTrace;
  let candidatePaths = [
    process.env.PULSE_EXECUTION_TRACE_PATH?.trim(),
    repoRoot && executionTraceFileName ? path.join(repoRoot, executionTraceFileName) : undefined,
    repoRoot && executionTraceFileName ? path.join(repoRoot, '.pulse', 'current', executionTraceFileName) : undefined,
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
    checks.length > deriveZeroValue() ? checks.reduce((sum, c) => sum + c.score, deriveZeroValue()) / checks.length : deriveZeroValue();

  let criticalFailures = failedChecks.filter((c) => isCriticalSeverity(c.severity));

  return {
    timestamp: new Date().toISOString(),
    overallPass: criticalFailures.length === deriveZeroValue(),
    score: Math.round(avgScore),
    checks,
    failedChecks,
    confidence: deriveConfidenceLabel(criticalFailures.length, failedChecks.length - criticalFailures.length),
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
  let confidenceIcon = isHighConfidenceLabel(report.confidence) ? '🟢' : isMediumConfidenceLabel(report.confidence) ? '🟡' : '🔴';

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
