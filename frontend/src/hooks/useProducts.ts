'use client';

import { apiFetch } from '@/lib/api';
import { swrFetcher } from '@/lib/fetcher';
import useSWR, { useSWRConfig } from 'swr';

/* ── Response types ── */
interface ProductEntityLike {
  readonly id?: string | number;
  readonly name?: string | null;
  readonly label?: string | null;
  readonly title?: string | null;
  readonly slug?: string | null;
  readonly referenceCode?: string | null;
  readonly active?: boolean | null;
  readonly isActive?: boolean | null;
}

interface ProductListItem extends ProductEntityLike {
  readonly category?: string | null;
  readonly status?: string | null;
  readonly plans?: readonly ProductEntityLike[] | null;
  readonly checkoutPlans?: readonly ProductEntityLike[] | null;
  readonly checkouts?: readonly ProductEntityLike[] | null;
  readonly checkoutTemplates?: readonly ProductEntityLike[] | null;
}

interface ProductsReadResult {
  products: ProductListItem[];
  total: number;
  error?: Error;
}

interface ProductReadResult {
  product: ProductListItem | null;
  error?: Error;
}

interface ProductCategoriesReadResult {
  categories: string[];
  error?: Error;
}

function hasProductMutationSuccessMarker(response: Record<string, unknown>): boolean {
  return (
    response.success === true ||
    isRecord(response.product) ||
    isRecord(response.data) ||
    typeof response.deleted === 'string'
  );
}

function requireProductMutationSuccess<T>(response: T, fallback: string): T {
  if (!isRecord(response)) {
    throw new Error('Invalid product mutation response');
  }
  const responseError = response.error;
  if (typeof responseError === 'string' && responseError.trim()) {
    throw new Error(responseError);
  }
  if (responseError) {
    throw new Error(fallback);
  }
  if (!hasProductMutationSuccessMarker(response)) {
    throw new Error('Invalid product mutation response');
  }
  return response;
}

const PRODUCT_LIST_KEYS = ['products', 'data', 'items', 'results'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isProductListItem(value: unknown): value is ProductListItem {
  return isRecord(value);
}

function readProductList(value: unknown): ProductListItem[] | null {
  if (!Array.isArray(value) || !value.every(isProductListItem)) {
    return null;
  }
  return value;
}

function invalidProductsPayload(): ProductsReadResult {
  return { products: [], total: 0, error: new Error('Invalid products payload') };
}

function readProductsTotal(record: Record<string, unknown>, fallback: number): number {
  const count = record.count;
  if (typeof count === 'number' && Number.isFinite(count)) {
    return count;
  }
  const total = record.total;
  if (typeof total === 'number' && Number.isFinite(total)) {
    return total;
  }
  return fallback;
}

function readProductsPayload(data: unknown): ProductsReadResult {
  if (!data) {
    return { products: [], total: 0 };
  }
  const rawArray = readProductList(data);
  if (rawArray) {
    return { products: rawArray, total: rawArray.length };
  }
  if (!isRecord(data)) {
    return invalidProductsPayload();
  }
  for (const key of PRODUCT_LIST_KEYS) {
    if (!(key in data)) {
      continue;
    }
    const products = readProductList(data[key]);
    if (!products) {
      return invalidProductsPayload();
    }
    return { products, total: readProductsTotal(data, products.length) };
  }
  return invalidProductsPayload();
}

function invalidProductPayload(): ProductReadResult {
  return { product: null, error: new Error('Invalid product payload') };
}

function readProductPayload(data: unknown): ProductReadResult {
  if (!data) {
    return { product: null };
  }
  if (!isRecord(data)) {
    return invalidProductPayload();
  }
  if ('product' in data) {
    return isProductListItem(data.product)
      ? { product: data.product }
      : invalidProductPayload();
  }
  if ('data' in data) {
    return isProductListItem(data.data) ? { product: data.data } : invalidProductPayload();
  }
  return isProductListItem(data) ? { product: data } : invalidProductPayload();
}

function invalidProductCategoriesPayload(): ProductCategoriesReadResult {
  return { categories: [], error: new Error('Invalid product categories payload') };
}

function readStringList(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    return null;
  }
  return value;
}

function readProductCategoriesPayload(data: unknown): ProductCategoriesReadResult {
  if (!data) {
    return { categories: [] };
  }
  const rawArray = readStringList(data);
  if (rawArray) {
    return { categories: rawArray };
  }
  if (!isRecord(data) || !('categories' in data)) {
    return invalidProductCategoriesPayload();
  }
  const categories = readStringList(data.categories);
  return categories ? { categories } : invalidProductCategoriesPayload();
}

/* ── List products with optional filters ── */
export function useProducts(params?: { category?: string; active?: string; search?: string }) {
  const qs = params
    ? `?${new URLSearchParams(
        Object.entries(params).filter(([, v]) => v) as [string, string][],
      ).toString()}`
    : '';
  const { data, error, isLoading, mutate } = useSWR(`/products${qs}`, swrFetcher);
  const decoded = readProductsPayload(data);
  return {
    products: decoded.products,
    total: decoded.total,
    isLoading,
    error: error ?? decoded.error,
    mutate,
  };
}

/* ── Single product ── */
export function useProduct(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR(id ? `/products/${id}` : null, swrFetcher);
  const decoded = readProductPayload(data);
  return { product: decoded.product, isLoading, error: error ?? decoded.error, mutate };
}

/* ── Product categories ── */
export function useProductCategories() {
  const { data, isLoading, error } = useSWR('/products/categories/list', swrFetcher);
  const decoded = readProductCategoriesPayload(data);
  return { categories: decoded.categories, isLoading, error: error ?? decoded.error };
}


/* ── Mutations ── */
export function useProductMutations() {
  const { mutate: globalMutate } = useSWRConfig();
  const invalidate = () =>
    globalMutate((key: unknown) => typeof key === 'string' && key.startsWith('/products'));
  const createProduct = async (body: Record<string, unknown>) => {
    const res = await apiFetch('/products', { method: 'POST', body });
    requireProductMutationSuccess(res, 'Erro ao criar produto');
    await invalidate();
    return res;
  };
  const updateProduct = async (id: string, body: Record<string, unknown>) => {
    const res = await apiFetch(`/products/${id}`, { method: 'PUT', body });
    requireProductMutationSuccess(res, 'Erro ao atualizar produto');
    await invalidate();
    return res;
  };
  const deleteProduct = async (id: string) => {
    const res = await apiFetch(`/products/${id}`, { method: 'DELETE' });
    requireProductMutationSuccess(res, 'Erro ao remover produto');
    await invalidate();
    return res;
  };
  return { createProduct, updateProduct, deleteProduct };
}
