// ─── JSON Parsing & Type Guards ──────────────────────────────────────────────

import * as p from 'path';
import { pathExists as existsAt, readTextFile } from '../../safe-fs';
import { tokenize, unique } from '../../signal-normalizers';
import type { RuntimeCallGraphEvidence, OtelSpan } from '../../types.otel-runtime';
import type { RuntimeSignal, SignalSource } from '../../types.runtime-fusion';

export interface CanonicalExternalSignal {
  id: string;
  source: SignalSource;
  type: string;
  truthMode: 'observed' | 'inferred';
  severity: number;
  impactScore: number;
  baselineValue: number;
  blastRadiusValue: number;
  summary: string;
  observedAt: string | null;
  relatedFiles: string[];
  capabilityIds: string[];
  flowIds: string[];
  confidence: number;
  frequency: number;
  affectedUsers: number;
  trend: RuntimeSignal['trend'];
  observedPayload: Record<string, unknown>;
}

export interface CanonicalExternalAdapter {
  source: string;
  status: string;
}

export interface CanonicalExternalSignalState {
  generatedAt: string;
  truthMode: 'observed' | 'inferred';
  signals: CanonicalExternalSignal[];
  adapters: CanonicalExternalAdapter[];
}

export function safeJsonParse(raw: string): Record<string, unknown> | null {
  try {
    let value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function safeJsonParseFile(fsLoc: string): Record<string, unknown> | null {
  if (!existsAt(fsLoc)) return null;
  try {
    return safeJsonParse(readTextFile(fsLoc, 'utf8'));
  } catch {
    return null;
  }
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function asNumber(value: unknown, fallback: number = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return fallback;
}

export function asOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((e): e is string => typeof e === 'string')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizePathSeparators(value: string): string {
  let separator = String.fromCharCode('/'.charCodeAt(0) + '-'.charCodeAt(0));
  return [...value].map((char) => (char === separator ? '/' : char)).join('');
}

export function resolvePulseCurrentDir(rootDir: string): string {
  if (p.basename(rootDir) === 'current' && p.basename(p.dirname(rootDir)) === '.pulse') {
    return rootDir;
  }
  return p.join(rootDir, '.pulse', 'current');
}

export function syncAffectedAliases(signal: RuntimeSignal): void {
  signal.affectedCapabilityIds = unique(signal.affectedCapabilityIds);
  signal.affectedFlowIds = unique(signal.affectedFlowIds);
  signal.affectedCapabilities = signal.affectedCapabilityIds;
  signal.affectedFlows = signal.affectedFlowIds;
}

export function isSignalSource(value: string): value is SignalSource {
  switch (value) {
    case 'github':
    case 'sentry':
    case 'datadog':
    case 'prometheus':
    case 'github_actions':
    case 'codacy':
    case 'codecov':
    case 'dependabot':
    case 'gitnexus':
    case 'otel_runtime':
      return true;
    default:
      return false;
  }
}

export function isSkippedAdapterState(value: string): boolean {
  let words = new Set(tokenizeEvidenceTerm(value));
  return words.has('skipped') || (words.has('optional') && words.has('configured'));
}

export function traceSourceLooksObserved(source: string, runtimeObserved: boolean): boolean {
  if (runtimeObserved) return true;
  let words = new Set(tokenizeEvidenceTerm(source));
  return (
    words.has('real') ||
    words.has('manual') ||
    words.has('otel') ||
    words.has('collector') ||
    words.has('datadog') ||
    words.has('sentry') ||
    words.has('runtime')
  );
}

export function emptySourceCounts(): Record<SignalSource, number> {
  return {
    github: 0,
    sentry: 0,
    datadog: 0,
    prometheus: 0,
    github_actions: 0,
    codacy: 0,
    codecov: 0,
    dependabot: 0,
    gitnexus: 0,
    otel_runtime: 0,
  };
}

export function isRuntimeCallGraphEvidence(value: unknown): value is RuntimeCallGraphEvidence {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.source === 'string' &&
    isRecord(value.summary) &&
    Array.isArray(value.traces) &&
    Array.isArray(value.spanToPathMappings)
  );
}

export function tokenizeEvidenceTerm(value: string): string[] {
  let expanded = value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_./:-]+/g, ' ');
  return unique([...tokenize(value), ...tokenize(expanded)]);
}

export function flattenPayloadTokens(value: unknown): string[] {
  if (typeof value === 'string') return tokenizeEvidenceTerm(value);
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (Array.isArray(value)) return value.flatMap(flattenPayloadTokens);
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, entry]) => [
    ...tokenizeEvidenceTerm(key),
    ...flattenPayloadTokens(entry),
  ]);
}
