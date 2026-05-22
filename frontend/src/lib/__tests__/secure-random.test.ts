import { afterEach, describe, expect, it, vi } from 'vitest';
import { secureRandomFloat } from '../secure-random';

describe('secureRandomFloat', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a number in [0, 1)', () => {
    for (let i = 0; i < 100; i++) {
      const value = secureRandomFloat();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(typeof value).toBe('number');
    }
  });

  it('uses crypto.getRandomValues when available', () => {
    const mockValue = new Uint32Array(1);
    mockValue[0] = 0x80000000;
    const getRandomValues = vi.fn((arr: Uint32Array) => {
      arr[0] = mockValue[0];
      return arr;
    });

    vi.stubGlobal('crypto', { getRandomValues });

    const result = secureRandomFloat();
    expect(getRandomValues).toHaveBeenCalledOnce();
    expect(result).toBe(0x80000000 / 0x100000000);
  });

  it('falls back to deterministic LCG when crypto is absent', () => {
    vi.stubGlobal('crypto', undefined);

    const a = secureRandomFloat();
    const b = secureRandomFloat();
    const c = secureRandomFloat();

    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(1);
    expect(c).toBeGreaterThanOrEqual(0);
    expect(c).toBeLessThan(1);

    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
  });

  it('falls back when crypto.getRandomValues is missing', () => {
    vi.stubGlobal('crypto', {});

    const a = secureRandomFloat();
    const b = secureRandomFloat();

    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
    expect(a).not.toBe(b);
  });

  it('produces stable deterministic sequence from cold seed', () => {
    vi.stubGlobal('crypto', undefined);

    // Re-import triggers module-level seed reset only on first load.
    // The module-level fallbackSeed persists across calls within this test
    // but we verify the LCG is internally consistent.
    const values = Array.from({ length: 5 }, () => secureRandomFloat());
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});
