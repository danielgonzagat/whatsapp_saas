import { describe, expect, it } from 'vitest';

import {
  buildStaticWavePoints,
  jn,
  jv,
  unwrapApiPayload,
} from './product-nerve-center.shared.helpers';

describe('jv', () => {
  it('returns an empty string for null and undefined', () => {
    expect(jv(null)).toBe('');
    expect(jv(undefined)).toBe('');
  });

  it('coerces primitives via String()', () => {
    expect(jv(42)).toBe('42');
    expect(jv(true)).toBe('true');
    expect(jv(false)).toBe('false');
    expect(jv('plan')).toBe('plan');
  });

  it('does not collapse the literal string "0" into the empty fallback', () => {
    expect(jv(0)).toBe('0');
    expect(jv('')).toBe('');
  });
});

describe('jn', () => {
  it('returns 0 for nullish, NaN, and unparseable values', () => {
    expect(jn(null)).toBe(0);
    expect(jn(undefined)).toBe(0);
    expect(jn(Number.NaN)).toBe(0);
    expect(jn('abc')).toBe(0);
    expect(jn({})).toBe(0);
  });

  it('coerces numeric strings and numbers', () => {
    expect(jn('19')).toBe(19);
    expect(jn('19.99')).toBeCloseTo(19.99);
    expect(jn(7)).toBe(7);
  });

  it('returns 0 for the literal 0 (falsy) — documented behavior', () => {
    // Number(0) || 0 === 0, which is correct.
    expect(jn(0)).toBe(0);
    expect(jn('0')).toBe(0);
  });
});

describe('unwrapApiPayload', () => {
  it('throws when the envelope carries an error message', () => {
    expect(() => unwrapApiPayload({ error: 'workspace missing' })).toThrow('workspace missing');
  });

  it('returns envelope.data when present', () => {
    const payload = { id: 'plan-1', name: 'Pro' };
    expect(unwrapApiPayload<{ id: string; name: string }>({ data: payload })).toBe(payload);
  });

  it('falls back to the response itself when no data property exists', () => {
    const raw = { id: 'plan-2' };
    expect(unwrapApiPayload<{ id: string }>(raw)).toBe(raw);
  });

  it('handles null and undefined responses', () => {
    expect(unwrapApiPayload(null)).toBe(null);
    expect(unwrapApiPayload(undefined)).toBe(undefined);
  });
});

describe('buildStaticWavePoints', () => {
  it('returns a space-separated list of "x,y" coordinate pairs', () => {
    const points = buildStaticWavePoints(120, 24, 1);
    const pairs = points.split(' ');
    expect(pairs.length).toBeGreaterThanOrEqual(2);
    for (const pair of pairs) {
      expect(pair).toMatch(/^-?\d+\.\d{2},-?\d+\.\d{2}$/);
    }
  });

  it('clamps the sample count to at least 2 points even for tiny widths', () => {
    const points = buildStaticWavePoints(0, 10, 1);
    const pairs = points.split(' ');
    expect(pairs.length).toBeGreaterThanOrEqual(2);
  });

  it('is deterministic for the same inputs', () => {
    const first = buildStaticWavePoints(80, 20, 0.5);
    const second = buildStaticWavePoints(80, 20, 0.5);
    expect(first).toBe(second);
  });

  it('places the first point at x=0 and the last at x=width', () => {
    const width = 100;
    const points = buildStaticWavePoints(width, 30, 1);
    const pairs = points.split(' ');
    const firstX = Number.parseFloat(pairs[0].split(',')[0]);
    const lastX = Number.parseFloat(pairs.at(-1)!.split(',')[0]);
    expect(firstX).toBeCloseTo(0);
    expect(lastX).toBeCloseTo(width);
  });

  it('y stays bounded by height/2 ± height*0.2*intensity', () => {
    const height = 40;
    const intensity = 1;
    const points = buildStaticWavePoints(60, height, intensity);
    const amplitude = height * 0.2 * intensity;
    const center = height / 2;
    for (const pair of points.split(' ')) {
      const y = Number.parseFloat(pair.split(',')[1]);
      expect(y).toBeGreaterThanOrEqual(center - amplitude - 0.001);
      expect(y).toBeLessThanOrEqual(center + amplitude + 0.001);
    }
  });
});
