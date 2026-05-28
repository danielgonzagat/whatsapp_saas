import { describe, expect, it } from 'vitest';

import {
  INITIAL_NEW_PLAN,
  buildDuplicatedPlanBody,
  buildPlanLinks,
  isProductsCacheKey,
  normalizePlansResponse,
  parseCreatePlanBody,
  parseItemsPerPlan,
  shortPlanId,
  toPlanErrorMessage,
  type Plan,
} from './ProductPlansTab.helpers';

const samplePlan: Plan = {
  id: 'plan_abc12345_xyz',
  name: 'Curso Pro',
  price: 297,
  billingType: 'RECURRING',
  itemsPerPlan: 4,
  visibleToAffiliates: true,
  active: true,
  salesCount: 12,
};

describe('toPlanErrorMessage', () => {
  it('returns Error.message when given an Error with text', () => {
    expect(toPlanErrorMessage(new Error('boom'), 'fallback')).toBe('boom');
  });

  it('falls back when Error.message is empty', () => {
    expect(toPlanErrorMessage(new Error(''), 'fallback')).toBe('fallback');
  });

  it('falls back when value is not an Error', () => {
    expect(toPlanErrorMessage('string-error', 'fallback')).toBe('fallback');
    expect(toPlanErrorMessage(null, 'fallback')).toBe('fallback');
    expect(toPlanErrorMessage(undefined, 'fallback')).toBe('fallback');
    expect(toPlanErrorMessage({ message: 'x' }, 'fallback')).toBe('fallback');
  });
});

describe('parseCreatePlanBody', () => {
  it('parses a well-formed numeric price string', () => {
    expect(
      parseCreatePlanBody({
        name: 'Basic',
        price: '49.90',
        billingType: 'ONE_TIME',
        itemsPerPlan: 2,
      }),
    ).toEqual({
      name: 'Basic',
      price: 49.9,
      billingType: 'ONE_TIME',
      itemsPerPlan: 2,
    });
  });

  it('coerces non-numeric price to 0', () => {
    expect(
      parseCreatePlanBody({
        name: 'X',
        price: 'abc',
        billingType: 'FREE',
        itemsPerPlan: 1,
      }).price,
    ).toBe(0);
  });

  it('passes empty price as 0', () => {
    expect(
      parseCreatePlanBody({ ...INITIAL_NEW_PLAN, name: 'X' }).price,
    ).toBe(0);
  });
});

describe('buildDuplicatedPlanBody', () => {
  it('appends "(Copia)" suffix to the name', () => {
    expect(buildDuplicatedPlanBody(samplePlan).name).toBe('Curso Pro (Copia)');
  });

  it('preserves price and billing fields', () => {
    expect(buildDuplicatedPlanBody(samplePlan)).toEqual({
      name: 'Curso Pro (Copia)',
      price: 297,
      billingType: 'RECURRING',
      itemsPerPlan: 4,
    });
  });

  it('defaults billingType when missing', () => {
    const stripped: Plan = { ...samplePlan, billingType: '' };
    expect(buildDuplicatedPlanBody(stripped).billingType).toBe('ONE_TIME');
  });

  it('defaults itemsPerPlan to 1 when 0/falsey', () => {
    const stripped: Plan = { ...samplePlan, itemsPerPlan: 0 };
    expect(buildDuplicatedPlanBody(stripped).itemsPerPlan).toBe(1);
  });
});

describe('normalizePlansResponse', () => {
  it('returns the array unchanged when given a list', () => {
    expect(normalizePlansResponse([samplePlan])).toEqual([samplePlan]);
  });

  it('returns an empty array for non-array input', () => {
    expect(normalizePlansResponse(null)).toEqual([]);
    expect(normalizePlansResponse(undefined)).toEqual([]);
    expect(normalizePlansResponse({ data: [] })).toEqual([]);
    expect(normalizePlansResponse('x')).toEqual([]);
  });
});

describe('parseItemsPerPlan', () => {
  it('parses a positive integer string', () => {
    expect(parseItemsPerPlan('7')).toBe(7);
  });

  it('floors decimal strings via parseInt', () => {
    expect(parseItemsPerPlan('3.9')).toBe(3);
  });

  it('falls back to 1 on non-numeric input', () => {
    expect(parseItemsPerPlan('')).toBe(1);
    expect(parseItemsPerPlan('abc')).toBe(1);
  });

  it('falls back to 1 for zero (matches `|| 1` semantics)', () => {
    expect(parseItemsPerPlan('0')).toBe(1);
  });

  it('lets negatives pass through (matches inline semantics)', () => {
    expect(parseItemsPerPlan('-2')).toBe(-2);
  });
});

describe('buildPlanLinks', () => {
  it('returns 3 links anchored at origin/productId', () => {
    const links = buildPlanLinks('prod_123', 'https://kloel.com');
    expect(links).toHaveLength(3);
    expect(links[0]).toEqual({ label: 'Abrir produto', url: 'https://kloel.com/products/prod_123' });
    expect(links[1].url).toBe('https://kloel.com/products/prod_123?tab=planos');
    expect(links[2].url).toBe('https://kloel.com/products/prod_123?tab=checkouts');
  });

  it('works with empty origin', () => {
    expect(buildPlanLinks('p', '')[0].url).toBe('/products/p');
  });
});

describe('isProductsCacheKey', () => {
  it('matches /products and /products/<id> keys', () => {
    expect(isProductsCacheKey('/products')).toBe(true);
    expect(isProductsCacheKey('/products/abc')).toBe(true);
  });

  it('rejects unrelated keys and non-strings', () => {
    expect(isProductsCacheKey('/orders')).toBe(false);
    expect(isProductsCacheKey('products')).toBe(false);
    expect(isProductsCacheKey(123)).toBe(false);
    expect(isProductsCacheKey(null)).toBe(false);
    expect(isProductsCacheKey(undefined)).toBe(false);
  });
});

describe('shortPlanId', () => {
  it('returns first 8 chars', () => {
    expect(shortPlanId('plan_abc12345_xyz')).toBe('plan_abc');
  });

  it('returns short strings unchanged', () => {
    expect(shortPlanId('abc')).toBe('abc');
  });

  it('stringifies non-string input', () => {
    expect(shortPlanId(123456789)).toBe('12345678');
    expect(shortPlanId(null)).toBe('null');
    expect(shortPlanId(undefined)).toBe('undefine');
  });
});

describe('INITIAL_NEW_PLAN', () => {
  it('starts with empty name and price and ONE_TIME billing', () => {
    expect(INITIAL_NEW_PLAN).toEqual({
      name: '',
      price: '',
      billingType: 'ONE_TIME',
      itemsPerPlan: 1,
    });
  });
});
