/**
 * Low-level value normalization helpers used by external signal parsers.
 * All functions are pure — no I/O, no side effects.
 */
import * as path from 'path';
import type { PulseScopeExecutionMode } from './types';

const S_RE = /\s+/g;
const WORD_RE = /[a-z0-9]+/g;

export function compact(value: string, max: number = 240): string {
  const normalized = value.replace(S_RE, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 3)}...`;
}

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function toStringArray(value: unknown): string[] {
  return unique(
    asArray(value)
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean),
  );
}

export function normalizePathValue(rootDir: string, value: string): string {
  const normalized = value.trim().replace(/\\/g, '/');
  if (!normalized) return normalized;
  if (path.isAbsolute(normalized)) {
    const relative = path.relative(rootDir, normalized);
    if (relative && !relative.startsWith('..')) return relative.replace(/\\/g, '/');
  }
  return normalized.replace(/^\.\/+/, '');
}

export function normalizeFileArray(rootDir: string, value: unknown): string[] {
  return unique(
    [
      ...toStringArray(value),
      ...asArray(value)
        .map((entry) => asObject(entry))
        .filter((entry): entry is Record<string, unknown> => Boolean(entry))
        .flatMap((entry) =>
          [entry.path, entry.file, entry.filePath]
            .map((candidate) => (typeof candidate === 'string' ? candidate : ''))
            .filter(Boolean),
        ),
    ]
      .map((entry) => normalizePathValue(rootDir, entry))
      .filter(Boolean),
  );
}

export function normalizeRoutePattern(value: string): string {
  return value.trim().replace(/\/+$/, '').toLowerCase() || '/';
}

export function normalizeRouteArray(value: unknown): string[] {
  return unique(
    [
      ...toStringArray(value),
      ...asArray(value)
        .map((entry) => asObject(entry))
        .filter((entry): entry is Record<string, unknown> => Boolean(entry))
        .flatMap((entry) =>
          [entry.route, entry.path, entry.endpoint]
            .map((candidate) => (typeof candidate === 'string' ? candidate : ''))
            .filter(Boolean),
        ),
    ]
      .map((entry) => normalizeRoutePattern(entry))
      .filter(Boolean),
  );
}

export function normalizeDate(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString();
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function severityFromString(value: string): number {
  const normalized = value.trim().toLowerCase();
  if (
    normalized.includes('critical') ||
    normalized.includes('fatal') ||
    normalized.includes('blocker')
  )
    return 1;
  if (normalized.includes('high') || normalized.includes('error')) return 0.85;
  if (normalized.includes('medium') || normalized.includes('warn')) return 0.6;
  if (normalized.includes('low') || normalized.includes('info')) return 0.35;
  return 0.5;
}

export function normalizeScore(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value <= 1 && value >= 0) return Math.round(value * 100) / 100;
    if (value > 1 && value <= 10) return Math.round((value / 10) * 100) / 100;
    if (value > 10 && value <= 100) return Math.round((value / 100) * 100) / 100;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return normalizeScore(parsed, fallback);
    return severityFromString(value);
  }
  return fallback;
}

export function normalizeSummary(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) return compact(value);
  return compact(fallback);
}

export function normalizeExecutionMode(value: unknown): PulseScopeExecutionMode | undefined {
  return value === 'ai_safe' || value === 'human_required' || value === 'observation_only'
    ? value
    : undefined;
}

export function routeMatches(left: string, right: string): boolean {
  const leftNormalized = normalizeRoutePattern(left);
  const rightNormalized = normalizeRoutePattern(right);
  return (
    leftNormalized === rightNormalized ||
    leftNormalized.startsWith(rightNormalized) ||
    rightNormalized.startsWith(leftNormalized)
  );
}

export function tokenize(value: string): string[] {
  return value.toLowerCase().match(WORD_RE) || [];
}

export function normalizedFileMatch(left: string, right: string): boolean {
  const leftNormalized = left.replace(/\\/g, '/');
  const rightNormalized = right.replace(/\\/g, '/');
  return (
    leftNormalized === rightNormalized ||
    leftNormalized.endsWith(`/${rightNormalized}`) ||
    rightNormalized.endsWith(`/${leftNormalized}`)
  );
}
