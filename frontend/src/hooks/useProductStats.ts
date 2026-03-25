'use client';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';

export function useProductStats() {
  const { data, error, isLoading } = useSWR('/products/stats', swrFetcher);
  return {
    stats: data || { totalProducts: 0, activeProducts: 0, totalSales: 0, totalRevenue: 0 },
    isLoading,
    error,
  };
}
