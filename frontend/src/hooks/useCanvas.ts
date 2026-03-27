'use client';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';

export function useCanvasDesigns(productId?: string) {
  const qs = productId ? `?productId=${productId}` : '';
  const { data, isLoading, error, mutate } = useSWR(`/canvas/designs${qs}`, swrFetcher);
  return { designs: data?.designs || [], total: data?.count || 0, isLoading, error, mutate };
}

export function useCanvasDesign(id: string | null) {
  const { data, isLoading, mutate } = useSWR(id ? `/canvas/designs/${id}` : null, swrFetcher);
  return { design: data?.design || null, isLoading, mutate };
}
