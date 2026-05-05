/**
 * JSON parsing and type-safe accessor utilities used by runtime-fusion parts.
 */
import * as p from 'path';
import { pathExists as existsAt, readTextFile } from '../../safe-fs';

function safeJsonParse(raw: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

function safeJsonParseFile(fsLoc: string): Record<string, unknown> | null {
  if (!existsAt(fsLoc)) return null;
  try {
    return safeJsonParse(readTextFile(fsLoc, 'utf8'));
  } catch {
    return null;
  }
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown, fallback: number = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return fallback;
}

function asOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((e): e is string => typeof e === 'string')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function resolvePulseCurrentDir(rootDir: string): string {
  if (p.basename(rootDir) === 'current' && p.basename(p.dirname(rootDir)) === '.pulse') {
    return rootDir;
  }
  return p.join(rootDir, '.pulse', 'current');
}

export {
  asArray,
  asNumber,
  asOptionalNumber,
  asString,
  asStringArray,
  isRecord,
  resolvePulseCurrentDir,
  safeJsonParseFile,
};
