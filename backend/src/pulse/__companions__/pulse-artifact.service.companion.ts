import type { RuntimeAuthorityMode, RuntimeReadinessVerdict } from './pulse-artifact.service.types';

type JsonObject = Record<string, unknown>;

export function getJsonObject(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : null;
}

export function getString(record: JsonObject | null | undefined, key: string): string | null {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

export function getBoolean(record: JsonObject | null | undefined, key: string): boolean | null {
  const value = record?.[key];
  return typeof value === 'boolean' ? value : null;
}

export function getNumber(record: JsonObject | null | undefined, key: string): number | null {
  const value = record?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

export function normalizeAuthorityMode(
  value: string | null,
  humanReplacementStatus: string | null,
): RuntimeAuthorityMode {
  if (
    value === 'advisory-only' ||
    value === 'autonomous-execution' ||
    value === 'certified-autonomous'
  ) {
    return value;
  }
  return humanReplacementStatus === 'READY' ? 'certified-autonomous' : 'advisory-only';
}

export function normalizeVerdict(value: string | null): RuntimeReadinessVerdict {
  if (value === 'SIM' || value === 'NAO') return value;
  return 'UNKNOWN';
}
