// ─── Numeric Utilities ───────────────────────────────────────────────────────

import type { RuntimeSignal } from '../../types.runtime-fusion';

export function bound01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function observedSpread(values: number[]): number {
  if (values.length <= 1) return 0;
  let mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

export function positiveObservedFloor(values: number[]): number {
  let positives = values.filter((value) => value > 0).sort((left, right) => left - right);
  if (positives.length === 0) return Number.POSITIVE_INFINITY;
  return positives[0] / Math.max(1, Math.sqrt(positives.length));
}

export function observedMeanOrSelf(values: number[], self: number): number {
  let positives = values.filter((value) => value > 0);
  return positives.length > 0 ? average(positives) : self;
}

export function neutralMagnitude(left: number | null, right: number | null): number {
  return bound01(left ?? right ?? Math.SQRT1_2);
}

export function defaultCertainty(value: unknown): number {
  return bound01(asNumber(value, Math.SQRT1_2));
}

function asNumber(value: unknown, fallback: number = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return fallback;
}

export function positiveSignal(value: number): number {
  return value > 0 ? bound01(Math.log10(value + 1)) : 0;
}

export function trendSignal(trend: RuntimeSignal['trend']): number {
  if (trend === 'worsening') return 1;
  if (trend === 'improving') return -0.5;
  return 0;
}

export function observedHttpDenominator(value: number): number {
  return Math.max(value, value + Math.sqrt(Math.max(value, Number.EPSILON)));
}

export function observedLatencyDenominator(
  p95Ms: number,
  avgMs: number,
  traceTotal: number,
): number {
  let observed = Math.max(p95Ms, avgMs, traceTotal, Number.EPSILON);
  return observed + Math.sqrt(observed) + Math.log1p(observed);
}

export function observedOccurrence(value: number): number {
  return Math.max(Math.sign(value), value / Math.max(value, Number.EPSILON));
}
