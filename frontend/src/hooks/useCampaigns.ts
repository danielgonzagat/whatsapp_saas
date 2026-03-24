'use client';

import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';
import { apiFetch } from '@/lib/api';
import { unwrapArray } from '@/lib/normalizer';

/* ── List campaigns with optional filters ── */
export function useCampaigns(params?: { status?: string; search?: string }) {
  const qs = params
    ? '?' + new URLSearchParams(
        Object.entries(params).filter(([, v]) => v) as [string, string][]
      ).toString()
    : '';
  const { data, error, isLoading, mutate } = useSWR(`/campaigns${qs}`, swrFetcher);
  const items = unwrapArray(data, 'campaigns');
  return { campaigns: items, total: (data as any)?.count ?? items.length, isLoading, error, mutate };
}

/* ── Single campaign ── */
export function useCampaign(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR(id ? `/campaigns/${id}` : null, swrFetcher);
  return { campaign: (data as any)?.campaign ?? (data as any)?.data ?? data, isLoading, error, mutate };
}

/* ── Mutations ── */
export function useCampaignMutations() {
  const createCampaign = async (body: any) => apiFetch('/campaigns', { method: 'POST', body });
  const updateCampaign = async (id: string, body: any) => apiFetch(`/campaigns/${id}`, { method: 'PUT', body });
  const deleteCampaign = async (id: string) => apiFetch(`/campaigns/${id}`, { method: 'DELETE' });
  const launchCampaign = async (id: string) => apiFetch(`/campaigns/${id}/launch`, { method: 'POST' });
  const pauseCampaign = async (id: string) => apiFetch(`/campaigns/${id}/pause`, { method: 'POST' });
  return { createCampaign, updateCampaign, deleteCampaign, launchCampaign, pauseCampaign };
}
