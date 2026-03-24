'use client';

import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';
import { apiFetch } from '@/lib/api';
import { unwrapArray, unwrapPaginated, type NormalizedList } from '@/lib/normalizer';

/* ── Contacts (paginated) ── */
export function useContacts(params?: { page?: string; limit?: string; search?: string; tag?: string }) {
  const qs = params
    ? '?' + new URLSearchParams(
        Object.entries(params).filter(([, v]) => v) as [string, string][]
      ).toString()
    : '';
  const { data, error, isLoading, mutate } = useSWR(`/crm/contacts${qs}`, swrFetcher);
  const result: NormalizedList<any> = unwrapPaginated(data, 'contacts');
  return { contacts: result.items, total: result.total, page: result.page, hasMore: result.hasMore, isLoading, error, mutate };
}

/* ── Single contact ── */
export function useContact(phone: string | null) {
  const { data, error, isLoading, mutate } = useSWR(phone ? `/crm/contacts/${phone}` : null, swrFetcher);
  return { contact: (data as any)?.contact ?? (data as any)?.data ?? data, isLoading, error, mutate };
}

/* ── Pipelines ── */
export function usePipelines() {
  const { data, error, isLoading, mutate } = useSWR('/crm/pipelines', swrFetcher);
  const items = unwrapArray(data, 'pipelines');
  return { pipelines: items, isLoading, error, mutate };
}

/* ── Deals ── */
export function useDeals(params?: { pipeline?: string; stage?: string; search?: string }) {
  const qs = params
    ? '?' + new URLSearchParams(
        Object.entries(params).filter(([, v]) => v) as [string, string][]
      ).toString()
    : '';
  const { data, error, isLoading, mutate } = useSWR(`/crm/deals${qs}`, swrFetcher);
  const items = unwrapArray(data, 'deals');
  return { deals: items, total: (data as any)?.count ?? items.length, isLoading, error, mutate };
}

/* ── Mutations ── */
export function useCRMMutations() {
  const createContact = async (body: any) => apiFetch('/crm/contacts', { method: 'POST', body });
  const upsertContact = async (body: any) => apiFetch('/crm/contacts/upsert', { method: 'POST', body });
  const addTag = async (phone: string, tag: string) =>
    apiFetch(`/crm/contacts/${phone}/tags`, { method: 'POST', body: { tag } });
  const removeTag = async (phone: string, tag: string) =>
    apiFetch(`/crm/contacts/${phone}/tags/${encodeURIComponent(tag)}`, { method: 'DELETE' });

  const createPipeline = async (body: any) => apiFetch('/crm/pipelines', { method: 'POST', body });
  const createDeal = async (body: any) => apiFetch('/crm/deals', { method: 'POST', body });
  const moveDeal = async (id: string, stage: string) =>
    apiFetch(`/crm/deals/${id}/move`, { method: 'PUT', body: { stage } });
  const updateDeal = async (id: string, body: any) => apiFetch(`/crm/deals/${id}`, { method: 'PUT', body });
  const deleteDeal = async (id: string) => apiFetch(`/crm/deals/${id}`, { method: 'DELETE' });

  return { createContact, upsertContact, addTag, removeTag, createPipeline, createDeal, moveDeal, updateDeal, deleteDeal };
}
