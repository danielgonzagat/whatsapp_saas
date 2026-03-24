'use client';

import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';
import { apiFetch } from '@/lib/api';
import { unwrapArray } from '@/lib/normalizer';

/* ── Marketplace templates ── */
export function useMarketplaceTemplates() {
  const { data, error, isLoading, mutate } = useSWR('/marketplace/templates', swrFetcher);
  const items = unwrapArray(data, 'templates');
  return { templates: items, isLoading, error, mutate };
}

/* ── Mutations ── */
export function useMarketplaceMutations() {
  const install = async (templateId: string) =>
    apiFetch(`/marketplace/templates/${templateId}/install`, { method: 'POST' });
  return { install };
}
