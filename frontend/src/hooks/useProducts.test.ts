import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const swrMocks = vi.hoisted(() => ({
  globalMutate: vi.fn(),
}));

const apiMocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}));

vi.mock('swr', () => ({
  default: vi.fn(() => ({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() })),
  useSWRConfig: vi.fn(() => ({ mutate: swrMocks.globalMutate })),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: apiMocks.apiFetch,
}));

vi.mock('@/lib/fetcher', () => ({
  swrFetcher: vi.fn(),
}));

import useSWR from 'swr';

import { useProducts, useProduct, useProductCategories, useProductMutations } from './useProducts';

beforeEach(() => {
  apiMocks.apiFetch.mockReset();
  swrMocks.globalMutate.mockReset();
  swrMocks.globalMutate.mockResolvedValue(undefined);
});

describe('useProducts', () => {
  beforeEach(() => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });
  });

  it('returns empty products and isLoading=true when SWR is loading', () => {
    const { result } = renderHook(() => useProducts());
    expect(result.current.products).toEqual([]);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.total).toBe(0);
  });

  it('returns products from data.products when loaded', () => {
    const items = [{ id: '1', name: 'Produto A' }];
    vi.mocked(useSWR).mockReturnValue({
      data: { products: items, count: 1 },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useProducts());
    expect(result.current.products).toEqual(items);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.total).toBe(1);
  });

  it('falls back to data.data when products key is absent', () => {
    const items = [{ id: '2' }];
    vi.mocked(useSWR).mockReturnValue({
      data: { data: items, count: 1 },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useProducts());
    expect(result.current.products).toEqual(items);
  });

  it('uses Array.isArray fallback when data is a raw array', () => {
    const items = [{ id: '3' }, { id: '4' }];
    vi.mocked(useSWR).mockReturnValue({
      data: items,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useProducts());
    expect(result.current.products).toEqual(items);
    expect(result.current.total).toBe(2);
  });

  it('surfaces malformed successful product payloads instead of returning false-empty products', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: { products: { id: 'prod-real', name: 'Produto real' }, count: 1 },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useProducts());
    expect(result.current.products).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Invalid products payload');
  });

  it('returns error when SWR errors', () => {
    const err = new Error('fetch failed');
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: err,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useProducts());
    expect(result.current.error).toBe(err);
    expect(result.current.products).toEqual([]);
  });
});

describe('useProduct', () => {
  beforeEach(() => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });
  });

  it('returns null product while loading', () => {
    const { result } = renderHook(() => useProduct('prod-1'));
    expect(result.current.product).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });

  it('returns a loaded product', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: { product: { id: 'prod-1', name: 'Curso' } },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useProduct('prod-1'));
    expect(result.current.product).toEqual({ id: 'prod-1', name: 'Curso' });
    expect(result.current.isLoading).toBe(false);
  });

  it('surfaces malformed successful single-product payloads instead of returning fake products', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: { product: 'not-a-product' },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useProduct('prod-1'));
    expect(result.current.product).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Invalid product payload');
  });

  it('returns null when id is null (SWR not called)', () => {
    const { result } = renderHook(() => useProduct(null));
    expect(result.current.product).toBeNull();
  });
});

describe('useProductCategories', () => {
  it('returns empty categories while loading', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useProductCategories());
    expect(result.current.categories).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('returns categories from data.categories', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: { categories: ['cursos', 'servicos'] },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useProductCategories());
    expect(result.current.categories).toEqual(['cursos', 'servicos']);
  });

  it('surfaces malformed successful category payloads instead of returning false-empty categories', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: { categories: 'cursos' },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useProductCategories());
    expect(result.current.categories).toEqual([]);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Invalid product categories payload');
  });
});


describe('useProductMutations', () => {
  it('throws backend errors and does not invalidate cache after failed update', async () => {
    apiMocks.apiFetch.mockResolvedValue({ error: 'Produto invalido', status: 400 });
    const { result } = renderHook(() => useProductMutations());

    await expect(result.current.updateProduct('prod-1', { name: 'Novo' })).rejects.toThrow(
      'Produto invalido',
    );

    expect(apiMocks.apiFetch).toHaveBeenCalledWith('/products/prod-1', {
      method: 'PUT',
      body: { name: 'Novo' },
    });
    expect(swrMocks.globalMutate).not.toHaveBeenCalled();
  });

  it('throws malformed successful mutation responses and does not invalidate cache', async () => {
    apiMocks.apiFetch.mockResolvedValue({});
    const { result } = renderHook(() => useProductMutations());

    await expect(result.current.createProduct({ name: 'Produto' })).rejects.toThrow(
      'Invalid product mutation response',
    );

    expect(apiMocks.apiFetch).toHaveBeenCalledWith('/products', {
      method: 'POST',
      body: { name: 'Produto' },
    });
    expect(swrMocks.globalMutate).not.toHaveBeenCalled();
  });

  it('invalidates product caches after successful create', async () => {
    apiMocks.apiFetch.mockResolvedValue({ data: { product: { id: 'prod-1' } }, status: 201 });
    const { result } = renderHook(() => useProductMutations());

    await expect(result.current.createProduct({ name: 'Produto' })).resolves.toEqual({
      data: { product: { id: 'prod-1' } },
      status: 201,
    });

    const predicateCandidate = swrMocks.globalMutate.mock.calls[0]?.[0];
    expect(typeof predicateCandidate).toBe('function');
    const predicate = predicateCandidate as (key: unknown) => boolean;
    expect(predicate('/products')).toBe(true);
    expect(predicate('/products?active=true')).toBe(true);
    expect(predicate('/kyc/profile')).toBe(false);
  });
});
