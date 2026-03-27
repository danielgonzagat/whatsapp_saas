'use client';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';

export function useCanvasDesigns(productId?: string) {
  const qs = productId ? `?productId=${productId}` : '';
  const { data, isLoading, error, mutate } = useSWR(`/canvas/designs${qs}`, swrFetcher);
  const d = data as any;
  return { designs: d?.designs || [], total: d?.count || 0, isLoading, error, mutate };
}

export function useCanvasDesign(id: string | null) {
  const { data, isLoading, mutate } = useSWR(id ? `/canvas/designs/${id}` : null, swrFetcher);
  return { design: (data as any)?.design || null, isLoading, mutate };
}
