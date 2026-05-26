/**
 * Canonical primitive parsers for the backend.
 *
 * Audit A1 (2026-05-21) found 20 local `readString*` declarations across
 * backend/src with 7 distinct semantic variants. Force-merging them
 * would break callers (some return `undefined`, some `null`, some `''`;
 * some trim, some don't; some take a fallback, some don't). The right
 * answer is a small family of well-named helpers — each variant gets
 * its own canonical home here.
 *
 * Migration plan in [docs/architecture/PATTERN_MIGRATION_PLAYBOOK.md].
 * Each local `function readString*` gets replaced via the codemod at
 * `tools/canonicalize/migrate-read-string.mjs`, one variant at a time.
 */

import type { UnknownRecord } from './types';

// ─── readString family ──────────────────────────────────────────────

/**
 * Read a string from `unknown` with empty/whitespace as "no value".
 * Returns the value AS-IS (not trimmed); use {@link readTrimmedString}
 * if you want the trimmed result.
 *
 * Use when:
 * - Input may be a request header / Prisma JsonValue / raw payload
 * - Empty or whitespace-only strings should be treated as missing
 * - The original casing/whitespace matters downstream
 */
export function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/**
 * Like {@link readString} but returns the TRIMMED string.
 * Use when the caller doesn't care about leading/trailing whitespace.
 */
export function readTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * Like {@link readTrimmedString} but returns `null` instead of `undefined`
 * for missing values. Used by webhook / Prisma JSON-value adapters
 * where `null` is the canonical empty sentinel.
 */
export function readStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Always returns a string. Returns `''` (empty) when input is not a
 * non-empty string. Trims when input is a string.
 *
 * Use only when the caller will immediately operate on the result as
 * a string (e.g., `.length`, `.includes(...)`).
 */
export function readStringForce(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Always returns a string. Caller-provided fallback when input isn't a
 * non-empty string. Trims when input is a string.
 */
export function readStringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

/**
 * Variant of {@link readStringOr} that does NOT trim. Use only when
 * leading/trailing whitespace is meaningful (rare — bucket keys, action
 * names, etc.).
 */
export function readStringOrUntrimmed(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

// ─── readStringProperty (record-aware) ─────────────────────────────

/**
 * Read a string property from an unknown record. Returns the value
 * AS-IS (not trimmed) when present and non-empty; `undefined` otherwise.
 * Guards against non-object inputs internally.
 */
export function readStringProperty(source: unknown, key: string): string | undefined {
  if (typeof source !== 'object' || source === null || Array.isArray(source)) {
    return undefined;
  }
  const value = (source as UnknownRecord)[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

// ─── readStringArray ────────────────────────────────────────────────

/**
 * Read an array of strings from `unknown`. Returns `[]` for non-arrays
 * or empty arrays (after filtering non-strings out).
 *
 * Use when the caller treats "no entries" and "missing input" identically.
 */
export function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

/**
 * Like {@link readStringArray} but returns `undefined` when the input
 * isn't an array (vs `[]` when it IS an empty array). Use when the
 * caller needs to distinguish "no field set" from "field set to []".
 */
export function readStringArrayOr(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

// ─── readNumber family (canonical home for A2 audit) ──────────────

/**
 * Strict number: accepts only finite `typeof value === 'number'`.
 * Returns `undefined` for strings, null, undefined, NaN, Infinity.
 *
 * Use when input MUST already be a number (parsed JSON, typed DTO).
 */
export function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Lenient number: accepts strings via `Number()` coercion. Returns
 * `undefined` for empty strings, nulls, NaN.
 */
export function readNumberLoose(value: unknown): number | undefined {
  if (value === '' || value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/**
 * Number with caller-provided fallback. Uses `Number()` coercion.
 * Note: `Number('')` is 0 — guard empty strings if that matters.
 */
export function readNumberOr(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Force number: returns 0 instead of undefined for non-numbers.
 * Use only when callers immediately do arithmetic.
 */
export function readNumberForce(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
