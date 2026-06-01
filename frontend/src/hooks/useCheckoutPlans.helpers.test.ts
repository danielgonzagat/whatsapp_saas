import { describe, expect, it } from 'vitest';

import {
  buildCheckoutProductBody,
  buildCheckoutSeedProduct,
  buildDuplicatePlanBody,
  buildOrdersQueryString,
  extractCheckoutProductList,
  extractCheckoutsFromDetail,
  extractPixels,
  extractPlansFromDetail,
  matchesProduct,
  resolveOrdersTotal,
  requireCheckoutMutationSuccess,
  unwrapArrayOrEnvelope,
  type CheckoutProductItem,
  type CheckoutProductListResponse,
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

  it('throws malformed checkout product list envelopes instead of returning a false list', () => {
    expect(() =>
      extractCheckoutProductList({
        products: { id: 'prod-real', name: 'Produto real' },
      } as unknown as CheckoutProductListResponse),
    ).toThrow('Invalid checkout products payload');
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

  it('throws when the named key holds a non-array value instead of returning a false empty list', () => {
    expect(() =>
      unwrapArrayOrEnvelope<number>(
        { items: 'not-array' } as unknown as { items: number[] },
        'items',
      ),
    ).toThrow('Invalid checkout items payload');
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
      [
        'freeShipping',
        'maxInstallments',
        'name',
        'priceInCents',
        'quantity',
        'shippingPrice',
      ].sort(),
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

describe('buildCheckoutSeedProduct', () => {
  it('returns null when product is null', () => {
    expect(buildCheckoutSeedProduct(null)).toBeNull();
  });

  it('returns null when product is undefined', () => {
    expect(buildCheckoutSeedProduct(undefined)).toBeNull();
  });

  it('returns null when id is missing', () => {
    expect(buildCheckoutSeedProduct({ name: 'P' })).toBeNull();
  });

  it('returns null when name is missing', () => {
    expect(buildCheckoutSeedProduct({ id: 'pid' })).toBeNull();
  });

  it('projects all known fields when id and name are present', () => {
    expect(
      buildCheckoutSeedProduct({
        id: 'pid',
        name: 'P',
        slug: 's',
        description: 'd',
        images: ['img'],
        category: 'cat',
        price: 99,
      }),
    ).toEqual({
      id: 'pid',
      name: 'P',
      slug: 's',
      description: 'd',
      images: ['img'],
      category: 'cat',
      price: 99,
    });
  });

  it('passes through undefined optional fields unchanged', () => {
    const seed = buildCheckoutSeedProduct({ id: 'pid', name: 'P' });
    expect(seed).toEqual({
      id: 'pid',
      name: 'P',
      slug: undefined,
      description: undefined,
      images: undefined,
      category: undefined,
      price: undefined,
    });
  });
});

describe('extractPlansFromDetail', () => {
  it('returns empty array when data is undefined', () => {
    expect(extractPlansFromDetail(undefined)).toEqual([]);
  });

  it('returns empty array when data is null', () => {
    expect(extractPlansFromDetail(null)).toEqual([]);
  });

  it('prefers checkoutPlans over plans', () => {
    const canonical = [{ id: 'a', name: 'A' }];
    const legacy = [{ id: 'b', name: 'B' }];
    expect(extractPlansFromDetail({ checkoutPlans: canonical, plans: legacy })).toBe(canonical);
  });

  it('falls back to plans when checkoutPlans is missing', () => {
    const legacy = [{ id: 'b', name: 'B' }];
    expect(extractPlansFromDetail({ plans: legacy })).toBe(legacy);
  });

  it('returns empty array when neither key is present', () => {
    expect(extractPlansFromDetail({ id: 'pid' })).toEqual([]);
  });

  it('throws malformed checkoutPlans values instead of returning a false plan list', () => {
    expect(() =>
      extractPlansFromDetail({
        checkoutPlans: { id: 'plan-real', name: 'Plano real' },
      } as unknown as Parameters<typeof extractPlansFromDetail>[0]),
    ).toThrow('Invalid checkout plans payload');
  });
});

describe('extractCheckoutsFromDetail', () => {
  it('returns empty array when data is undefined', () => {
    expect(extractCheckoutsFromDetail(undefined)).toEqual([]);
  });

  it('prefers checkoutTemplates over checkouts', () => {
    const canonical = [{ id: 'a' }];
    const legacy = [{ id: 'b' }];
    expect(extractCheckoutsFromDetail({ checkoutTemplates: canonical, checkouts: legacy })).toBe(
      canonical,
    );
  });

  it('falls back to checkouts when checkoutTemplates is missing', () => {
    const legacy = [{ id: 'b' }];
    expect(extractCheckoutsFromDetail({ checkouts: legacy })).toBe(legacy);
  });

  it('returns empty array when neither key is present', () => {
    expect(extractCheckoutsFromDetail({ id: 'pid' })).toEqual([]);
  });

  it('throws malformed checkoutTemplates values instead of returning a false checkout list', () => {
    expect(() =>
      extractCheckoutsFromDetail({
        checkoutTemplates: { id: 'checkout-real' },
      } as unknown as Parameters<typeof extractCheckoutsFromDetail>[0]),
    ).toThrow('Invalid checkout templates payload');
  });
});

describe('extractPixels', () => {
  it('returns empty array when data is null', () => {
    expect(extractPixels(null)).toEqual([]);
  });

  it('returns empty array when data is undefined', () => {
    expect(extractPixels(undefined)).toEqual([]);
  });

  it('returns empty array when pixels field is missing', () => {
    expect(extractPixels({})).toEqual([]);
  });

  it('throws when pixels field is non-array instead of returning a false empty list', () => {
    expect(() => extractPixels({ pixels: 'nope' } as unknown as { pixels: never[] })).toThrow(
      'Invalid checkout pixels payload',
    );
  });

  it('returns the pixels array when present', () => {
    const pixels = [{ id: 'p1' }, { id: 'p2' }];
    expect(extractPixels({ pixels })).toBe(pixels);
  });
});

describe('resolveOrdersTotal', () => {
  it('returns orders length when data is undefined', () => {
    expect(resolveOrdersTotal(undefined, 7)).toBe(7);
  });

  it('returns orders length when data is null', () => {
    expect(resolveOrdersTotal(null, 3)).toBe(3);
  });

  it('returns orders length when data is a bare array (no envelope)', () => {
    expect(resolveOrdersTotal([{ id: 'o1' }, { id: 'o2' }], 2)).toBe(2);
  });

  it('returns the envelope total when present', () => {
    expect(resolveOrdersTotal({ total: 42 }, 5)).toBe(42);
  });

  it('falls back to orders length when envelope omits total', () => {
    expect(resolveOrdersTotal({}, 5)).toBe(5);
  });

  it('returns the envelope total even when it is 0', () => {
    // Use ?? so 0 is preserved (vs ||, which would coerce to orders.length).
    expect(resolveOrdersTotal({ total: 0 }, 99)).toBe(0);
  });
});

describe('requireCheckoutMutationSuccess', () => {
  it('returns the response when no backend error is present', () => {
    const response = { status: 200, data: { id: 'ok' } };
    expect(requireCheckoutMutationSuccess(response, 'fallback')).toBe(response);
  });

  it('throws malformed successful responses without a backend success marker', () => {
    expect(() => requireCheckoutMutationSuccess({}, 'fallback')).toThrow(
      'Invalid checkout mutation response',
    );
  });

  it('throws the backend error envelope message', () => {
    expect(() =>
      requireCheckoutMutationSuccess({ status: 400, error: 'Plano invalido' }, 'fallback'),
    ).toThrow('Plano invalido');
  });

  it('throws the fallback when backend returns success false without message', () => {
    expect(() => requireCheckoutMutationSuccess({ success: false }, 'Falha real')).toThrow(
      'Falha real',
    );
  });
});
