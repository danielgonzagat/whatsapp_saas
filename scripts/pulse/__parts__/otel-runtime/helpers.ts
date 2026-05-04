import * as path from 'path';
import * as crypto from 'crypto';
import type { OtelRuntimeSource, OtelTraceSummary } from '../../types.otel-runtime';

function nowIso(): string {
  return new Date().toISOString();
}

function randomHex(len: number): string {
  return crypto
    .randomBytes(Math.ceil(len / 2))
    .toString('hex')
    .slice(0, len);
}

function stableHex(input: string, len: number): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, len);
}

function stableNumber(input: string, modulo: number): number {
  if (modulo <= 1) return 0;
  return Number.parseInt(stableHex(input, 12), 16) % modulo;
}

function stableChoice<T>(items: readonly T[], input: string): T {
  return items[stableNumber(input, items.length)];
}

function stableIso(offsetMs: number): string {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0) + offsetMs).toISOString();
}

function clampDuration(ms: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, ms));
}

function idFromName(name: string): string {
  return crypto.createHash('md5').update(name).digest('hex').slice(0, 12);
}

function normalizePath(input: string): string {
  return input.split(path.sep).join('/');
}

function isRuntimeObservedSource(source: OtelRuntimeSource): boolean {
  return source === 'real' || source === 'manual';
}

function emptyTraceSummary(): OtelTraceSummary {
  return {
    totalTraces: 0,
    totalSpans: 0,
    errorTraces: 0,
    avgDurationMs: 0,
    p95DurationMs: 0,
    p99DurationMs: 0,
    serviceMap: {},
    endpointMap: {},
  };
}

export { clampDuration, emptyTraceSummary, idFromName, isRuntimeObservedSource, normalizePath, nowIso, randomHex, stableChoice, stableHex, stableIso, stableNumber };
