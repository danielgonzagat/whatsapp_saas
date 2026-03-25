'use client';

import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';
import { apiFetch } from '@/lib/api';

/* ── Types ── */
export interface AffiliateProduct {
  id: string;
  name: string;
  description?: string;
  category?: string;
  format?: 'DIGITAL' | 'PHYSICAL' | 'SERVICE';
  price?: number;
  maxPrice?: number;
  commission?: number;
  commissionType?: 'PERCENTAGE' | 'FIXED';
  temperature?: number;
  trending?: boolean;
  rating?: number;
  reviewsCount?: number;
  thumbnailUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  producerName?: string;
  tags?: string[];
  saved?: boolean;
}

export interface AffiliateStats {
  totalProducts: number;
  maxCommission: number;
  avgCommission: number;
  totalCategories: number;
}

/* ── Marketplace products for affiliation ── */
export function useAffiliateMarketplace(params?: {
  category?: string;
  search?: string;
  format?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}) {
  const qs = new URLSearchParams();
  if (params?.category && params.category !== 'Todos') qs.set('category', params.category);
  if (params?.search) qs.set('q', params.search);
  if (params?.format) qs.set('format', params.format);
  if (params?.sort) qs.set('sort', params.sort);
  if (params?.order) qs.set('order', params.order);
  const q = qs.toString();
  const { data, isLoading, error, mutate } = useSWR(
    `/affiliate/marketplace${q ? `?${q}` : ''}`,
    swrFetcher
  );
  return {
    products: ((data as any)?.products || (Array.isArray(data) ? data : [])) as AffiliateProduct[],
    isLoading,
    error,
    mutate,
  };
}

/* ── Affiliate stats ── */
export function useAffiliateStats() {
  const { data, isLoading, error } = useSWR('/affiliate/marketplace/stats', swrFetcher);
  return {
    stats: ((data as AffiliateStats) || {
      totalProducts: 0,
      maxCommission: 0,
      avgCommission: 0,
      totalCategories: 0,
    }) as AffiliateStats,
    isLoading,
    error,
  };
}

/* ── AI recommended products ── */
export function useAffiliateRecommended() {
  const { data, isLoading, error, mutate } = useSWR(
    '/affiliate/marketplace/recommended',
    swrFetcher
  );
  return {
    recommended: (((data as any)?.products || (Array.isArray(data) ? data : [])) as AffiliateProduct[]),
    reason: (data as any)?.reason || '',
    isLoading,
    error,
    mutate,
  };
}

/* ── My affiliate products (products I am promoting) ── */
export function useMyAffiliateProducts() {
  const { data, isLoading, error, mutate } = useSWR('/affiliate/my-products', swrFetcher);
  return {
    products: ((data as any)?.products || (Array.isArray(data) ? data : [])) as any[],
    isLoading,
    error,
    mutate,
  };
}

/* ── API mutations ── */
export const affiliateApi = {
  requestAffiliation: async (productId: string) =>
    apiFetch('/affiliate/request', { method: 'POST', body: { productId } }),

  saveProduct: async (productId: string) =>
    apiFetch(`/affiliate/saved/${productId}`, { method: 'POST' }),

  unsaveProduct: async (productId: string) =>
    apiFetch(`/affiliate/saved/${productId}`, { method: 'DELETE' }),

  searchWithAI: async (query: string) =>
    apiFetch<{ products: AffiliateProduct[] }>('/affiliate/ai-search', {
      method: 'POST',
      body: { query },
    }),

  suggestForMe: async () =>
    apiFetch<{ products: AffiliateProduct[] }>('/affiliate/suggest', {
      method: 'POST',
    }),
};
