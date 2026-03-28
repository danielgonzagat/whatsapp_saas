'use client';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';

/* ── Response types ── */
interface CanvasDesignsResponse {
  designs?: unknown[];
  count?: number;
}

interface CanvasDesignResponse {
  design?: unknown;
}

export function useCanvasDesigns(productId?: string) {
  const qs = productId ? `?productId=${productId}` : '';
  const { data, isLoading, error, mutate } = useSWR(`/canvas/designs${qs}`, swrFetcher);
  const d = data as CanvasDesignsResponse | undefined;
  return { designs: d?.designs || [], total: d?.count || 0, isLoading, error, mutate };
}

export function useCanvasDesign(id: string | null) {
  const { data, isLoading, mutate } = useSWR(id ? `/canvas/designs/${id}` : null, swrFetcher);
  return { design: (data as CanvasDesignResponse)?.design || null, isLoading, mutate };
}
