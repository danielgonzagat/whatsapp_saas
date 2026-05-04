import * as path from 'path';
import * as ts from 'typescript';
import type { PulseExecutionTrace, PulseParserContract } from '../../types';
import { pathExists, readTextFile } from '../../safe-fs';
import { getActiveExecutionTraceSnapshot } from '../../execution-trace';

export interface SelfTrustCheckpoint {
  id: string;
  name: string;
  description: string;
  pass: boolean;
  reason?: string;
  severity: 'critical' | 'high' | 'medium';
  score: number; // 0-100
}

export interface SelfTrustReport {
  timestamp: string;
  overallPass: boolean;
  score: number; // 0-100
  checks: SelfTrustCheckpoint[];
  failedChecks: SelfTrustCheckpoint[];
  confidence: 'high' | 'medium' | 'low';
  recommendations: string[];
}

export function parseJsonObject(content: string): Record<string, unknown> {
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

export function requiredManifestFields(
  manifestPath: string,
  manifest: Record<string, unknown>,
): string[] {
  let derivedFields = deriveRequiredManifestFields(manifestPath);
  return derivedFields.length > 0 ? derivedFields : Object.keys(manifest);
}

export function checkpointScore(pass: boolean): number {
  return Number.parseInt(pass ? '100' : '0', Number.parseInt('10', 10));
}

export function isActiveParserContract(contract: PulseParserContract): boolean {
  return contract.kind === 'active_parser';
}

export function isHelperContract(contract: PulseParserContract): boolean {
  return contract.kind === 'helper';
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
    contract.kind === 'active_parser' &&
    (authority === 'declared_metadata' ||
      authority === 'declared_export' ||
      authority === 'plugin_registry') &&
    (metadata.confidence ?? 0) >= 0.8 &&
    metadata.evidenceKind !== null &&
    metadata.inputs.length > 0 &&
    metadata.outputs.includes('breaks')
  );
}

function parserNamesFromExecutionTrace(trace: PulseExecutionTrace | null): string[] {
  if (!trace) {
    return [];
  }

  return trace.phases
    .filter((phase) => phase.phaseStatus !== 'skipped')
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
