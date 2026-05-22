/**
 * Canonical numeric helpers shared across backend modules.
 *
 * Phase F+J of the canonicalization mission consolidated 9 duplicate `clamp`
 * implementations (10 detected; one uses an incompatible [domain, value]
 * signature and stays local in `kloel/evol/types.ts`).
 *
 * Add new shared math primitives here — never duplicate `clamp` again.
 * The gate `scripts/ops/check-canonical-duplicates.mjs` enforces this.
 */

/**
 * Constrain `value` to the inclusive range `[min, max]`.
 *
 * Canonical signature: `clamp(value, min, max)`.
 *
 * Equivalent forms previously scattered across the codebase
 * (`Math.max(min, Math.min(max, value))` /
 *  `Math.min(max, Math.max(min, value))`) are mathematically identical and
 *  collapse to this single helper.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Constrain a score to the canonical `[0, 1]` range.
 *
 * Shorthand for `clamp(value, 0, 1)`. Used by quality / risk / health
 * scorers across kloel modules.
 */
export function clampScore(value: number): number {
  return clamp(value, 0, 1);
}

/**
 * Days elapsed since the ISO 8601 timestamp `iso`, relative to `nowMs`.
 *
 * Returns a non-negative fractional number of days; an unparseable `iso`
 * returns `0` (the conservative default used by every previous
 * implementation in this codebase).
 *
 * Note: fractional, not floored — callers that need integer days should
 * `Math.floor()` the result themselves.
 */
export function daysSince(iso: string, nowMs: number): number {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) {
    return 0;
  }
  return Math.max(0, (nowMs - ts) / (1000 * 60 * 60 * 24));
}
