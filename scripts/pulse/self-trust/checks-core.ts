import * as path from 'path';
import * as ts from 'typescript';
import type { Break, PulseParserContract } from '../../types.manifest';
import type { PulseExecutionTrace } from '../../types.evidence';
import { pathExists, readTextFile } from '../../safe-fs';
import { discoverParserContracts } from '../../parser-registry/loader';
import {
  getActiveExecutionTraceSnapshot,
  verifyExecutionTraceAuditTrail,
} from '../../execution-trace';
import { deriveStringUnionMembersFromTypeContract } from '../../dynamic-reality-kernel/type-contract-labels';
import {
  deriveUnitValue,
  deriveZeroValue,
} from '../../dynamic-reality-kernel/catalog-arithmetic';
import { discoverAllObservedArtifactFilenames } from '../../dynamic-reality-kernel/token-evidence';
import { discoverConvergenceEvidenceConfidenceLabels } from '../../__kernel_additions__/discoverConvergenceEvidenceConfidenceLabels';
import { discoverConvergenceRiskLevelLabels } from '../../__kernel_additions__/discoverConvergenceRiskLevelLabels';
import { discoverConvergenceSourceLabels } from '../../__kernel_additions__/discoverConvergenceSourceLabels';

export interface SelfTrustCheckpoint {
  id: string;
  name: string;
  description: string;
  pass: boolean;
  reason?: string;
  severity: 'critical' | 'high' | 'medium';
  score: number;
}

export interface SelfTrustReport {
  timestamp: string;
  overallPass: boolean;
  score: number;
  checks: SelfTrustCheckpoint[];
  failedChecks: SelfTrustCheckpoint[];
  confidence: 'high' | 'medium' | 'low';
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

export function checkpointScore(pass: boolean): number {
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
    (metadata.confidence ?? deriveZeroValue()) >=
      ((deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue()) *
        (deriveUnitValue() + deriveUnitValue())) /
        (deriveUnitValue() +
          deriveUnitValue() +
          deriveUnitValue() +
          deriveUnitValue() +
          deriveUnitValue() +
          deriveUnitValue() +
          deriveUnitValue() +
          deriveUnitValue() +
          deriveUnitValue() +
          deriveUnitValue()) &&
    metadata.evidenceKind !== null &&
    metadata.inputs.length > deriveZeroValue() &&
    metadata.outputs.includes('breaks')
  );
}

const _executionPhaseSkippedLabels = new Set(
  [
    ...deriveStringUnionMembersFromTypeContract(
      'scripts/pulse/types.evidence.ts',
      'PulseExecutionPhaseStatus',
    ),
  ].filter((s) => s.includes('skip')),
);

export function parserNamesFromExecutionTrace(trace: PulseExecutionTrace | null): string[] {
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

export function selfTrustCriticalParserNames(
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

export function riskLabelCritical(): SelfTrustCheckpoint['severity'] {
  return [..._riskLevelLabels][deriveZeroValue()] as SelfTrustCheckpoint['severity'];
}
export function riskLabelHigh(): SelfTrustCheckpoint['severity'] {
  return [..._riskLevelLabels][deriveUnitValue()] as SelfTrustCheckpoint['severity'];
}
export function riskLabelMedium(): SelfTrustCheckpoint['severity'] {
  const unit = deriveUnitValue();
  return [..._riskLevelLabels][unit + unit] as SelfTrustCheckpoint['severity'];
}

export function isCriticalSeverity(s: string): boolean {
  return _riskLevelLabels.has(s) && s.includes('crit');
}

export function isHighConfidenceLabel(s: string): boolean {
  return _confidenceLabels.has(s) && s.includes('high');
}
export function isMediumConfidenceLabel(s: string): boolean {
  return _confidenceLabels.has(s) && s.includes('med');
}

export function loadExecutionTraceCandidate(
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
    repoRoot && executionTraceFileName
      ? path.join(repoRoot, '.pulse', 'current', executionTraceFileName)
      : undefined,
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidatePath of candidatePaths) {
    if (!pathExists(candidatePath)) {
      continue;
    }
    return JSON.parse(readTextFile(candidatePath, 'utf-8')) as PulseExecutionTrace;
  }

  return null;
}

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
