// PULSE — Live Codebase Nervous System
// OpenTelemetry Runtime Call Graph Integration — Constants & Helpers

import * as path from 'path';
import * as crypto from 'crypto';
import {
  deriveHttpStatusFromObservedCatalog,
  deriveUnitValue,
  deriveZeroValue,
  discoverKnownHttpClientMethods,
  discoverRouteSeparatorFromRuntime,
  observeStatusTextLengthFromCatalog,
} from '../../dynamic-reality-kernel/__parts__/catalog-arithmetic';
import { deriveStringUnionMembersFromTypeContract } from '../../dynamic-reality-kernel/__parts__/type-contract-labels';
import { discoverAllObservedArtifactFilenames } from '../../dynamic-reality-kernel/__parts__/token-evidence';
import { discoverNestjsDecoratorNamesFromTypeEvidence } from '../../dynamic-reality-kernel/__parts__/evidence-domain';
import {
  discoverAxiosMethodNamesFromRuntimeTypeEvidence,
  discoverBullMQMethodNamesFromRuntimeTypeEvidence,
  discoverPrismaClientMethodNamesFromRuntimeTypeEvidence,
} from '../../dynamic-runtime-method-evidence';
import type { OtelRuntimeSource, OtelTraceSummary } from '../../types.otel-runtime';

// ─── Constants ───────────────────────────────────────────────────────────────

export function resolveArtifactRuntimeTraces(): string {
  return discoverAllObservedArtifactFilenames().runtimeTraces || 'PULSE_RUNTIME_TRACES.json';
}
export function resolveArtifactTraceDiff(): string {
  return discoverAllObservedArtifactFilenames().traceDiff || 'PULSE_TRACE_DIFF.json';
}
export const RUNTIME_TRACES_ARTIFACT = resolveArtifactRuntimeTraces();
export const TRACE_DIFF_ARTIFACT = resolveArtifactTraceDiff();

// ── Runtime-derived constants (sourced from type-contract files on disk) ────

export const OTEL_SPAN_STATUS_MEMBERS = deriveStringUnionMembersFromTypeContract(
  'scripts/pulse/types.otel-runtime.ts',
  'status',
);
export const OTEL_STATUS_OK = [...OTEL_SPAN_STATUS_MEMBERS].find((m) => m === 'ok')!;
export const OTEL_STATUS_ERROR = [...OTEL_SPAN_STATUS_MEMBERS].find((m) => m === 'error')!;
export const OTEL_STATUS_UNSET = [...OTEL_SPAN_STATUS_MEMBERS].find((m) => m === 'unset')!;

export const OTEL_RUNTIME_SOURCE_MEMBERS = deriveStringUnionMembersFromTypeContract(
  'scripts/pulse/types.otel-runtime.ts',
  'OtelRuntimeSource',
);
export const OTEL_SOURCE_REAL = [...OTEL_RUNTIME_SOURCE_MEMBERS].find((m) => m === 'real')!;
export const OTEL_SOURCE_MANUAL = [...OTEL_RUNTIME_SOURCE_MEMBERS].find((m) => m === 'manual')!;
export const OTEL_SOURCE_NOT_AVAILABLE = [...OTEL_RUNTIME_SOURCE_MEMBERS].find(
  (m) => m === 'not_available',
)!;
export const OTEL_SOURCE_SIMULATED = [...OTEL_RUNTIME_SOURCE_MEMBERS].find(
  (m) => m === 'simulated',
)!;

export const OTEL_RUNTIME_KIND_MEMBERS = deriveStringUnionMembersFromTypeContract(
  'scripts/pulse/types.otel-runtime.ts',
  'kind',
);
export const OTEL_KIND_OTEL_COLLECTOR = [...OTEL_RUNTIME_KIND_MEMBERS].find(
  (m) => m === 'otel_collector',
)!;
export const OTEL_KIND_TRACE_FILE = [...OTEL_RUNTIME_KIND_MEMBERS].find((m) => m === 'trace_file')!;
export const OTEL_KIND_MANUAL_TRACER = [...OTEL_RUNTIME_KIND_MEMBERS].find(
  (m) => m === 'manual_tracer',
)!;
export const OTEL_KIND_AST_STATIC_MAP = [...OTEL_RUNTIME_KIND_MEMBERS].find(
  (m) => m === 'ast_static_map',
)!;
export const OTEL_KIND_NONE = [...OTEL_RUNTIME_KIND_MEMBERS].find((m) => m === 'none')!;

export const HTTP_STATUS_OK = deriveHttpStatusFromObservedCatalog('OK');
export const HTTP_STATUS_BAD_REQUEST = deriveHttpStatusFromObservedCatalog('Bad Request');
export const HTTP_STATUS_INTERNAL_SERVER_ERROR =
  deriveHttpStatusFromObservedCatalog('Internal Server Error');
export const HTTP_STATUS_FORBIDDEN = deriveHttpStatusFromObservedCatalog('Forbidden');
export const HTTP_STATUS_TEXT_LEN_OK = observeStatusTextLengthFromCatalog(HTTP_STATUS_OK);
export const HTTP_STATUS_TEXT_LEN_FORBIDDEN =
  observeStatusTextLengthFromCatalog(HTTP_STATUS_FORBIDDEN);

export const NESTJS_DECORATOR_NAMES = [...discoverNestjsDecoratorNamesFromTypeEvidence()];

export const PRISMA_METHODS = [...discoverPrismaClientMethodNamesFromRuntimeTypeEvidence()];

export const BULLMQ_PATTERNS = [...discoverBullMQMethodNamesFromRuntimeTypeEvidence()];

export const AXIOS_METHODS = [
  ...new Set([
    ...discoverKnownHttpClientMethods(),
    ...discoverAxiosMethodNamesFromRuntimeTypeEvidence(),
  ]),
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function nowIso(): string {
  return new Date().toISOString();
}

export function randomHex(len: number): string {
  return crypto
    .randomBytes(Math.ceil(len / (deriveUnitValue() + deriveUnitValue())))
    .toString('hex')
    .slice(0, len);
}

export function stableHex(input: string, len: number): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, len);
}

export function stableNumber(input: string, modulo: number): number {
  if (modulo <= deriveUnitValue()) return deriveZeroValue();
  return Number.parseInt(stableHex(input, 12), 16) % modulo;
}

export function stableChoice<T>(items: readonly T[], input: string): T {
  return items[stableNumber(input, items.length)];
}

export function stableIso(offsetMs: number): string {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0) + offsetMs).toISOString();
}

export function clampDuration(ms: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, ms));
}

export function idFromName(name: string): string {
  return crypto.createHash('md5').update(name).digest('hex').slice(0, 12);
}

export function normalizePath(input: string): string {
  return input.split(path.sep).join(discoverRouteSeparatorFromRuntime());
}

export function isRuntimeObservedSource(source: OtelRuntimeSource): boolean {
  return source === OTEL_SOURCE_REAL || source === OTEL_SOURCE_MANUAL;
}

export function emptyTraceSummary(): OtelTraceSummary {
  return {
    totalTraces: deriveZeroValue(),
    totalSpans: deriveZeroValue(),
    errorTraces: deriveZeroValue(),
    avgDurationMs: deriveZeroValue(),
    p95DurationMs: deriveZeroValue(),
    p99DurationMs: deriveZeroValue(),
    serviceMap: {},
    endpointMap: {},
  };
}
