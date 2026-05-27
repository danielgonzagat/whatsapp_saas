import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('swr', () => ({
  default: vi.fn(() => ({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() })),
}));

vi.mock('@/lib/fetcher', () => ({
  swrFetcher: vi.fn(),
}));

import useSWR from 'swr';

import { useProducts, useProduct, useProductCategories } from './useProducts';

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
});
