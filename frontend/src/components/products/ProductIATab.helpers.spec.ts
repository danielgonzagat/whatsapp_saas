import { describe, expect, it } from 'vitest';

import {
  appendEmptyObjection,
  buildAIConfigBody,
  clampMessageLimit,
  clampPersistence,
  createDefaultAIConfig,
  FOLLOW_UP_OPTIONS,
  getObjectionKey,
  getSaveButtonLabel,
  isProductsCacheKey,
  MESSAGE_LIMIT_MIN,
  mergeAIConfigPayload,
  PERSISTENCE_MAX,
  PERSISTENCE_MIN,
  PRODUCT_IA_COPY,
  setObjectionFieldAt,
  TONE_OPTIONS,
  type AIConfig,
} from './ProductIATab.helpers';

describe('createDefaultAIConfig', () => {
  it('returns a stable default config with conservative behaviour toggles', () => {
    const config = createDefaultAIConfig();
    expect(config).toEqual({
      objections: [],
      tone: 'Consultivo',
      persistence: 3,
      messageLimit: 10,
      followUp: '2h, 24h, 72h',
      autoCheckoutLink: true,
      offerDiscount: true,
      useUrgency: true,
    });
  });

  it('returns a fresh objections array each call (no shared mutable state)', () => {
    const a = createDefaultAIConfig();
    const b = createDefaultAIConfig();
    expect(a.objections).not.toBe(b.objections);
  });
});

describe('mergeAIConfigPayload', () => {
  it('hydrates an empty config from a full payload', () => {
    const prev: AIConfig = createDefaultAIConfig();
    const merged = mergeAIConfigPayload(prev, {
      customerProfile: { idealCustomer: 'X', painPoints: 'Y', promisedResult: 'Z' },
      objections: [{ q: 'caro?', a: 'vale a pena' }],
      tone: 'Agressivo',
      persistenceLevel: 4,
      messageLimit: 20,
      followUpConfig: { schedule: '1h, 12h, 48h' },
      salesArguments: { autoCheckoutLink: false, offerDiscount: false, useUrgency: false },
    });
    expect(merged.idealCustomer).toBe('X');
    expect(merged.painPoints).toBe('Y');
    expect(merged.promisedResult).toBe('Z');
    expect(merged.tone).toBe('Agressivo');
    expect(merged.persistence).toBe(4);
    expect(merged.messageLimit).toBe(20);
    expect(merged.followUp).toBe('1h, 12h, 48h');
    expect(merged.autoCheckoutLink).toBe(false);
    expect(merged.offerDiscount).toBe(false);
    expect(merged.useUrgency).toBe(false);
    expect(merged.objections).toEqual([{ q: 'caro?', a: 'vale a pena' }]);
  });

  it('falls back to safe defaults for missing fields', () => {
    const merged = mergeAIConfigPayload(createDefaultAIConfig(), {});
    expect(merged.idealCustomer).toBe('');
    expect(merged.painPoints).toBe('');
    expect(merged.promisedResult).toBe('');
    expect(merged.objections).toEqual([]);
    expect(merged.tone).toBe('Consultivo');
    expect(merged.persistence).toBe(3);
    expect(merged.messageLimit).toBe(10);
    expect(merged.followUp).toBe('2h, 24h, 72h');
    expect(merged.autoCheckoutLink).toBe(true);
    expect(merged.offerDiscount).toBe(true);
    expect(merged.useUrgency).toBe(true);
  });

  it('preserves unrelated keys from prev', () => {
    const prev = { ...createDefaultAIConfig(), tone: 'Amigavel' } satisfies AIConfig;
    const merged = mergeAIConfigPayload(prev, { tone: 'Urgente' });
    expect(merged.tone).toBe('Urgente');
  });
});

describe('buildAIConfigBody', () => {
  it('omits customerProfile when idealCustomer is missing', () => {
    const body = buildAIConfigBody({ idealCustomer: '' });
    expect(body.customerProfile).toBeUndefined();
  });

  it('includes customerProfile when idealCustomer is present', () => {
    const body = buildAIConfigBody({
      idealCustomer: 'Mulheres 35-55',
      painPoints: 'Rugas',
      promisedResult: 'Pele rejuvenescida',
    });
    expect(body.customerProfile).toEqual({
      idealCustomer: 'Mulheres 35-55',
      painPoints: 'Rugas',
      promisedResult: 'Pele rejuvenescida',
    });
  });

  it('omits followUpConfig when followUp is empty', () => {
    const body = buildAIConfigBody({ idealCustomer: 'X', followUp: '' });
    expect(body.followUpConfig).toBeUndefined();
  });

  it('wraps followUp as { schedule } when present', () => {
    const body = buildAIConfigBody({ idealCustomer: 'X', followUp: '2h, 24h, 72h' });
    expect(body.followUpConfig).toEqual({ schedule: '2h, 24h, 72h' });
  });

  it('maps persistence -> persistenceLevel', () => {
    const body = buildAIConfigBody({ idealCustomer: 'X', persistence: 5 });
    expect(body.persistenceLevel).toBe(5);
  });

  it('always emits salesArguments even when fields are undefined', () => {
    const body = buildAIConfigBody({ idealCustomer: 'X' });
    expect(body.salesArguments).toEqual({
      autoCheckoutLink: undefined,
      offerDiscount: undefined,
      useUrgency: undefined,
    });
  });
});

describe('clampPersistence', () => {
  it('returns the integer value when inside [1, 5]', () => {
    expect(clampPersistence(1)).toBe(1);
    expect(clampPersistence(3)).toBe(3);
    expect(clampPersistence(5)).toBe(5);
  });

  it('clamps below the minimum to PERSISTENCE_MIN', () => {
    expect(clampPersistence(0)).toBe(PERSISTENCE_MIN);
    expect(clampPersistence(-12)).toBe(PERSISTENCE_MIN);
  });

  it('clamps above the maximum to PERSISTENCE_MAX', () => {
    expect(clampPersistence(6)).toBe(PERSISTENCE_MAX);
    expect(clampPersistence(99)).toBe(PERSISTENCE_MAX);
  });

  it('truncates floats toward zero before clamping', () => {
    expect(clampPersistence(3.7)).toBe(3);
    expect(clampPersistence(4.999)).toBe(4);
  });

  it('coerces numeric strings', () => {
    expect(clampPersistence('4')).toBe(4);
    expect(clampPersistence('  2  ')).toBe(2);
  });

  it('falls back to the default for non-finite / non-numeric input', () => {
    expect(clampPersistence('abc')).toBe(3);
    expect(clampPersistence(NaN)).toBe(3);
    expect(clampPersistence(Infinity)).toBe(3);
    expect(clampPersistence(-Infinity)).toBe(3);
    expect(clampPersistence(undefined)).toBe(3);
  });

  it('treats empty string / null as Number-coercible (0) and clamps to min', () => {
    // Number('') === 0 and Number(null) === 0 — both finite and below the
    // range, so they are clamped to PERSISTENCE_MIN rather than falling back.
    expect(clampPersistence('')).toBe(PERSISTENCE_MIN);
    expect(clampPersistence(null)).toBe(PERSISTENCE_MIN);
  });

  it('honors a custom fallback', () => {
    expect(clampPersistence('xyz', 2)).toBe(2);
  });
});

describe('clampMessageLimit', () => {
  it('returns non-negative integers as-is', () => {
    expect(clampMessageLimit(0)).toBe(MESSAGE_LIMIT_MIN);
    expect(clampMessageLimit(10)).toBe(10);
    expect(clampMessageLimit(1000)).toBe(1000);
  });

  it('clamps negative values to MESSAGE_LIMIT_MIN', () => {
    expect(clampMessageLimit(-5)).toBe(MESSAGE_LIMIT_MIN);
  });

  it('truncates floats', () => {
    expect(clampMessageLimit(7.9)).toBe(7);
  });

  it('falls back when non-finite', () => {
    expect(clampMessageLimit('not a number')).toBe(10);
    expect(clampMessageLimit(NaN)).toBe(10);
    expect(clampMessageLimit(Infinity)).toBe(10);
    expect(clampMessageLimit(undefined)).toBe(10);
  });

  it('coerces empty string / null to 0 (Number-coercion path)', () => {
    expect(clampMessageLimit('')).toBe(MESSAGE_LIMIT_MIN);
    expect(clampMessageLimit(null)).toBe(MESSAGE_LIMIT_MIN);
  });
});

describe('getObjectionKey', () => {
  it('combines index with trimmed q/a', () => {
    expect(getObjectionKey({ q: '  caro? ', a: ' vale ' }, 2)).toBe('objection-2-caro?-vale');
  });

  it('produces distinct keys for two empty rows at different indices', () => {
    const k0 = getObjectionKey({ q: '', a: '' }, 0);
    const k1 = getObjectionKey({ q: '', a: '' }, 1);
    expect(k0).not.toBe(k1);
  });
});

describe('setObjectionFieldAt', () => {
  const baseline = [
    { q: 'caro?', a: 'vale' },
    { q: 'demora?', a: 'rapido' },
  ] as const;

  it('updates the targeted field immutably', () => {
    const next = setObjectionFieldAt(baseline, 1, 'q', 'demora muito?');
    expect(next).toEqual([
      { q: 'caro?', a: 'vale' },
      { q: 'demora muito?', a: 'rapido' },
    ]);
    expect(next).not.toBe(baseline as unknown as typeof next);
    expect(next[0]).toEqual(baseline[0]); // unchanged row preserved
  });

  it('returns a defensive copy when the index is out of bounds', () => {
    const result = setObjectionFieldAt(baseline, 99, 'q', 'noop');
    expect(result).toEqual(baseline);
    expect(result).not.toBe(baseline as unknown as typeof result);
  });

  it('handles negative indices safely', () => {
    expect(setObjectionFieldAt(baseline, -1, 'a', 'nope')).toEqual(baseline);
  });
});

describe('appendEmptyObjection', () => {
  it('adds a blank q/a row', () => {
    expect(appendEmptyObjection([])).toEqual([{ q: '', a: '' }]);
  });

  it('does not mutate the source list', () => {
    const src: Array<{ q: string; a: string }> = [{ q: 'x', a: 'y' }];
    const out = appendEmptyObjection(src);
    expect(src).toHaveLength(1);
    expect(out).toHaveLength(2);
  });
});

describe('getSaveButtonLabel', () => {
  it('returns the success copy when saved (even if saving is true)', () => {
    expect(getSaveButtonLabel(true, true)).toBe(PRODUCT_IA_COPY.saveSuccess);
    expect(getSaveButtonLabel(true, false)).toBe(PRODUCT_IA_COPY.saveSuccess);
  });

  it('returns the saving copy when only saving', () => {
    expect(getSaveButtonLabel(false, true)).toBe(PRODUCT_IA_COPY.saveSaving);
  });

  it('returns the idle copy by default', () => {
    expect(getSaveButtonLabel(false, false)).toBe(PRODUCT_IA_COPY.saveIdle);
  });

  it('accepts an injected copy bundle', () => {
    const custom = {
      saveSuccess: 'OK',
      saveSaving: 'WAIT',
      saveIdle: 'GO',
    };
    expect(getSaveButtonLabel(true, false, custom)).toBe('OK');
    expect(getSaveButtonLabel(false, true, custom)).toBe('WAIT');
    expect(getSaveButtonLabel(false, false, custom)).toBe('GO');
  });
});

describe('isProductsCacheKey', () => {
  it('matches /products and subpaths', () => {
    expect(isProductsCacheKey('/products')).toBe(true);
    expect(isProductsCacheKey('/products/abc')).toBe(true);
    expect(isProductsCacheKey('/products/abc/ai-config')).toBe(true);
  });

  it('rejects unrelated keys', () => {
    expect(isProductsCacheKey('/orders')).toBe(false);
    expect(isProductsCacheKey('products')).toBe(false); // no leading slash
    expect(isProductsCacheKey('/product')).toBe(false); // singular
  });

  it('rejects non-string keys (SWR sometimes uses tuples / nullish)', () => {
    expect(isProductsCacheKey(null)).toBe(false);
    expect(isProductsCacheKey(undefined)).toBe(false);
    expect(isProductsCacheKey(42)).toBe(false);
    expect(isProductsCacheKey(['/products', 'x'])).toBe(false);
  });
});

describe('option lists are non-empty and stable', () => {
  it('exposes a non-empty TONE_OPTIONS tuple', () => {
    expect(TONE_OPTIONS.length).toBeGreaterThan(0);
    // Default tone must be selectable from the list.
    expect(TONE_OPTIONS).toContain('Consultivo');
  });

  it('exposes a non-empty FOLLOW_UP_OPTIONS tuple', () => {
    expect(FOLLOW_UP_OPTIONS.length).toBeGreaterThan(0);
    expect(FOLLOW_UP_OPTIONS).toContain('2h, 24h, 72h');
  });
});
