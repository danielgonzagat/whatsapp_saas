'use client';

import useSWR, { useSWRConfig } from 'swr';
import { swrFetcher } from '@/lib/fetcher';
import { apiFetch } from '@/lib/api';
import { unwrapArray, unwrapPaginated } from '@/lib/normalizer';

/* ── Response types ── */
interface ProductsResponse {
  products?: unknown[];
  data?: unknown[];
  count?: number;
}

interface ProductResponse {
  product?: unknown;
  data?: unknown;
}

/* ── List products with optional filters ── */
export function useProducts(params?: { category?: string; active?: string; search?: string }) {
  const qs = params
    ? '?' +
      new URLSearchParams(
        Object.entries(params).filter(([, v]) => v) as [string, string][],
      ).toString()
    : '';
  const { data, error, isLoading, mutate } = useSWR(`/products${qs}`, swrFetcher);
  const d = data as ProductsResponse | undefined;
  const items =
    d?.products ?? d?.data ?? (Array.isArray(data) ? data : unwrapArray(data, 'products'));
  return { products: items, total: d?.count ?? items.length, isLoading, error, mutate };
}

/* ── Single product ── */
export function useProduct(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR(id ? `/products/${id}` : null, swrFetcher);
  const d = data as ProductResponse | undefined;
  const item = d?.product ?? d?.data ?? data ?? null;
  return { product: item, isLoading, error, mutate };
}

/* ── Product categories ── */
export function useProductCategories() {
  const { data, isLoading } = useSWR('/products/categories/list', swrFetcher);
  return { categories: Array.isArray(data) ? data : [], isLoading };
}

/* ── Mutations ── */
export function useProductMutations() {
  const { mutate: globalMutate } = useSWRConfig();
  const invalidate = () =>
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/products'));
  const createProduct = async (body: Record<string, unknown>) => {
    const res = await apiFetch('/products', { method: 'POST', body });
    await invalidate();
    return res;
  };
  const updateProduct = async (id: string, body: Record<string, unknown>) => {
    const res = await apiFetch(`/products/${id}`, { method: 'PUT', body });
    await invalidate();
    return res;
  };
  const deleteProduct = async (id: string) => {
    const res = await apiFetch(`/products/${id}`, { method: 'DELETE' });
    await invalidate();
    return res;
  };
  return { createProduct, updateProduct, deleteProduct };
}
