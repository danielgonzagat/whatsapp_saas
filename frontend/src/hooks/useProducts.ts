'use client';

import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';
import { apiFetch } from '@/lib/api';
import { unwrapArray, unwrapPaginated } from '@/lib/normalizer';

/* ── List products with optional filters ── */
export function useProducts(params?: { category?: string; active?: string; search?: string }) {
  const qs = params
    ? '?' + new URLSearchParams(
        Object.entries(params).filter(([, v]) => v) as [string, string][]
      ).toString()
    : '';
  const { data, error, isLoading, mutate } = useSWR(`/products${qs}`, swrFetcher);
  const items = (data as any)?.products ?? (data as any)?.data ?? (Array.isArray(data) ? data : unwrapArray(data, 'products'));
  return { products: items, total: (data as any)?.count ?? items.length, isLoading, error, mutate };
}

/* ── Single product ── */
export function useProduct(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR(id ? `/products/${id}` : null, swrFetcher);
  const item = (data as any)?.product ?? (data as any)?.data ?? data ?? null;
  return { product: item, isLoading, error, mutate };
}

/* ── Product categories ── */
export function useProductCategories() {
  const { data, isLoading } = useSWR('/products/categories/list', swrFetcher);
  return { categories: Array.isArray(data) ? data : [], isLoading };
}

/* ── Mutations ── */
export function useProductMutations() {
  const createProduct = async (body: any) => apiFetch('/products', { method: 'POST', body });
  const updateProduct = async (id: string, body: any) => apiFetch(`/products/${id}`, { method: 'PUT', body });
  const deleteProduct = async (id: string) => apiFetch(`/products/${id}`, { method: 'DELETE' });
  return { createProduct, updateProduct, deleteProduct };
}
