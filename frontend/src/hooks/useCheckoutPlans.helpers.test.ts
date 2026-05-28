import { describe, expect, it } from 'vitest';

import {
  buildCheckoutProductBody,
  buildDuplicatePlanBody,
  buildOrdersQueryString,
  extractCheckoutProductList,
  matchesProduct,
  unwrapArrayOrEnvelope,
  type CheckoutProductItem,
  type DashboardProduct,
} from './useCheckoutPlans.helpers';

describe('extractCheckoutProductList', () => {
  it('returns empty array when input is undefined', () => {
    expect(extractCheckoutProductList(undefined)).toEqual([]);
  });

  it('returns the array as-is when given a bare array', () => {
    const list: CheckoutProductItem[] = [{ id: 'a', name: 'A' }];
    expect(extractCheckoutProductList(list)).toBe(list);
  });

  it('unwraps a { products: [...] } envelope', () => {
    const list: CheckoutProductItem[] = [{ id: 'a', name: 'A' }];
    expect(extractCheckoutProductList({ products: list })).toBe(list);
  });

  it('unwraps a { data: [...] } envelope', () => {
    const list: CheckoutProductItem[] = [{ id: 'a', name: 'A' }];
    expect(extractCheckoutProductList({ data: list })).toBe(list);
  });

  it('prefers products over data when both are present', () => {
    const products: CheckoutProductItem[] = [{ id: 'p', name: 'P' }];
    const data: CheckoutProductItem[] = [{ id: 'd', name: 'D' }];
    expect(extractCheckoutProductList({ products, data })).toBe(products);
  });

  it('returns empty array for an empty envelope', () => {
    expect(extractCheckoutProductList({})).toEqual([]);
  });
});

describe('matchesProduct', () => {
  it('matches by slug when slugs are equal', () => {
    const candidate: CheckoutProductItem = { id: '1', name: 'Other', slug: 'shared-slug' };
    expect(matchesProduct(candidate, { name: 'X', slug: 'shared-slug' })).toBe(true);
  });

  it('matches by name when slugs differ', () => {
    const candidate: CheckoutProductItem = { id: '1', name: 'Same', slug: 'a' };
    expect(matchesProduct(candidate, { name: 'Same', slug: 'b' })).toBe(true);
  });

  it('returns false when neither slug nor name matches', () => {
    const candidate: CheckoutProductItem = { id: '1', name: 'A', slug: 'a' };
    expect(matchesProduct(candidate, { name: 'B', slug: 'b' })).toBe(false);
  });

  it('treats both candidates missing slug as a slug-match', () => {
    // Both undefined → undefined === undefined → true. This mirrors original
    // behavior and means name comparison is short-circuited; tests pin it.
    const candidate: CheckoutProductItem = { id: '1', name: 'A' };
    expect(matchesProduct(candidate, { name: 'B' })).toBe(true);
  });
});

describe('buildCheckoutProductBody', () => {
  it('falls back to product.id when slug is missing', () => {
    const product: DashboardProduct = { id: 'pid', name: 'P' };
    const body = buildCheckoutProductBody(product);
    expect(body.slug).toBe('pid');
  });

  it('keeps slug when present', () => {
    const product: DashboardProduct = { id: 'pid', name: 'P', slug: 'p-slug' };
    expect(buildCheckoutProductBody(product).slug).toBe('p-slug');
  });

  it('defaults images to empty array when missing', () => {
    const product: DashboardProduct = { id: 'pid', name: 'P' };
    expect(buildCheckoutProductBody(product).images).toEqual([]);
  });

  it('defaults price to 0 when missing', () => {
    const product: DashboardProduct = { id: 'pid', name: 'P' };
    expect(buildCheckoutProductBody(product).price).toBe(0);
  });

  it('passes through optional description, category, images, price', () => {
    const product: DashboardProduct = {
      id: 'pid',
      name: 'P',
      slug: 's',
      description: 'd',
      images: ['img'],
      category: 'cat',
      price: 1234,
    };
    expect(buildCheckoutProductBody(product)).toEqual({
      name: 'P',
      slug: 's',
      description: 'd',
      images: ['img'],
      category: 'cat',
      price: 1234,
    });
  });
});

describe('unwrapArrayOrEnvelope', () => {
  it('returns empty array for undefined', () => {
    expect(unwrapArrayOrEnvelope<number>(undefined, 'items')).toEqual([]);
  });

  it('returns the array when input is already an array', () => {
    const arr = [1, 2, 3];
    expect(unwrapArrayOrEnvelope<number>(arr, 'items')).toBe(arr);
  });

  it('unwraps the envelope using the named key', () => {
    const arr = [{ id: 'x' }];
    expect(unwrapArrayOrEnvelope<{ id: string }>({ bumps: arr }, 'bumps')).toBe(arr);
  });

  it('returns empty array when the envelope has no key', () => {
    expect(unwrapArrayOrEnvelope<number>({}, 'items')).toEqual([]);
  });

  it('returns empty array when the key holds a non-array value', () => {
    expect(
      unwrapArrayOrEnvelope<number>(
        { items: 'not-array' } as unknown as { items: number[] },
        'items',
      ),
    ).toEqual([]);
  });
});

describe('buildDuplicatePlanBody', () => {
  it('appends "(Copia)" to the name', () => {
    expect(buildDuplicatePlanBody({ id: '1', name: 'Mensal' }).name).toBe('Mensal (Copia)');
  });

  it('mirrors pricing and shipping fields', () => {
    const body = buildDuplicatePlanBody({
      id: '1',
      name: 'Plan',
      priceInCents: 9990,
      quantity: 2,
      maxInstallments: 12,
      freeShipping: true,
      shippingPrice: 0,
    });
    expect(body).toEqual({
      name: 'Plan (Copia)',
      priceInCents: 9990,
      quantity: 2,
      maxInstallments: 12,
      freeShipping: true,
      shippingPrice: 0,
    });
  });

  it('keeps undefined fields undefined (does not coerce)', () => {
    const body = buildDuplicatePlanBody({ id: '1', name: 'Plan' });
    expect(body.priceInCents).toBeUndefined();
    expect(body.quantity).toBeUndefined();
    expect(body.maxInstallments).toBeUndefined();
    expect(body.freeShipping).toBeUndefined();
    expect(body.shippingPrice).toBeUndefined();
  });

  it('ignores extra properties on the input plan', () => {
    const body = buildDuplicatePlanBody({
      id: '1',
      name: 'Plan',
      extra: 'ignored',
    } as never);
    expect(Object.keys(body).sort()).toEqual(
      ['freeShipping', 'maxInstallments', 'name', 'priceInCents', 'quantity', 'shippingPrice'].sort(),
    );
  });
});

describe('buildOrdersQueryString', () => {
  it('returns empty string when params is undefined', () => {
    expect(buildOrdersQueryString(undefined)).toBe('');
  });

  it('returns empty string when params is empty', () => {
    expect(buildOrdersQueryString({})).toBe('');
  });

  it('returns ?status=paid when only status is set', () => {
    expect(buildOrdersQueryString({ status: 'paid' })).toBe('?status=paid');
  });

  it('includes page and limit as strings', () => {
    expect(buildOrdersQueryString({ page: 2, limit: 50 })).toBe('?page=2&limit=50');
  });

  it('combines all three params in stable order', () => {
    expect(buildOrdersQueryString({ status: 'paid', page: 1, limit: 25 })).toBe(
      '?status=paid&page=1&limit=25',
    );
  });

  it('omits page when 0 (falsy guard preserves original behavior)', () => {
    // The original used `if (params?.page)` so 0 is intentionally dropped.
    expect(buildOrdersQueryString({ page: 0 })).toBe('');
  });
});
