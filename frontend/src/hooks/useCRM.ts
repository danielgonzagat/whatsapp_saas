'use client';

import { apiFetch } from '@/lib/api';
import { swrFetcher } from '@/lib/fetcher';
import { type NormalizedList, unwrapArray, unwrapPaginated } from '@/lib/normalizer';
import useSWR, { useSWRConfig } from 'swr';

/* ── Response types ── */
interface ContactsResponseMeta {
  total?: number;
  page?: number;
  pages?: number;
  limit?: number;
}

interface ContactsResponse {
  meta?: ContactsResponseMeta;
}

interface ContactResponse {
  contact?: unknown;
  data?: unknown;
}

interface DealsResponse {
  count?: number;
}

/* ── Contacts (paginated) ── */
export function useContacts(params?: {
  page?: string;
  limit?: string;
  search?: string;
  tag?: string;
}) {
  const qs = params
    ? '?' +
      new URLSearchParams(
        Object.entries(params).filter(([, v]) => v) as [string, string][],
      ).toString()
    : '';
  const { data, error, isLoading, mutate } = useSWR(`/crm/contacts${qs}`, swrFetcher);
  const result: NormalizedList<unknown> = unwrapPaginated(data, 'contacts');
  const meta = (data as ContactsResponse)?.meta;
  const total = meta?.total ?? result.total;
  const page = meta?.page ?? result.page ?? 1;
  const pages = meta?.pages ?? (meta?.limit ? Math.ceil(total / meta.limit) : undefined);
  const hasMore = result.hasMore ?? (pages != null ? page < pages : undefined);
  return { contacts: result.items, total, page, hasMore, isLoading, error, mutate };
}

/* ── Single contact ── */
export function useContact(phone: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    phone ? `/crm/contacts/${phone}` : null,
    swrFetcher,
  );
  const d = data as ContactResponse | undefined;
  return { contact: d?.contact ?? d?.data ?? data, isLoading, error, mutate };
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
    ? '?' +
      new URLSearchParams(
        Object.entries(params).filter(([, v]) => v) as [string, string][],
      ).toString()
    : '';
  const { data, error, isLoading, mutate } = useSWR(`/crm/deals${qs}`, swrFetcher);
  const items = unwrapArray(data, 'deals');
  return {
    deals: items,
    total: (data as DealsResponse)?.count ?? items.length,
    isLoading,
    error,
    mutate,
  };
}

/* ── Mutations ── */
export function useCRMMutations() {
  const { mutate: globalMutate } = useSWRConfig();
  const invalidateContacts = () =>
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/crm/contacts'));
  const invalidatePipelines = () =>
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/crm/pipelines'));
  const invalidateDeals = () =>
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/crm/deals'));

  const createContact = async (body: Record<string, unknown>) => {
    const res = await apiFetch('/crm/contacts', { method: 'POST', body });
    await invalidateContacts();
    return res;
  };
  const upsertContact = async (body: Record<string, unknown>) => {
    const res = await apiFetch('/crm/contacts/upsert', { method: 'POST', body });
    await invalidateContacts();
    return res;
  };
  const addTag = async (phone: string, tag: string) => {
    const res = await apiFetch(`/crm/contacts/${phone}/tags`, { method: 'POST', body: { tag } });
    await invalidateContacts();
    return res;
  };
  const removeTag = async (phone: string, tag: string) => {
    const res = await apiFetch(`/crm/contacts/${phone}/tags/${encodeURIComponent(tag)}`, {
      method: 'DELETE',
    });
    await invalidateContacts();
    return res;
  };

  const createPipeline = async (body: Record<string, unknown>) => {
    const res = await apiFetch('/crm/pipelines', { method: 'POST', body });
    await invalidatePipelines();
    return res;
  };
  const createDeal = async (body: Record<string, unknown>) => {
    const res = await apiFetch('/crm/deals', { method: 'POST', body });
    await invalidateDeals();
    return res;
  };
  const moveDeal = async (id: string, stageId: string) => {
    const res = await apiFetch(`/crm/deals/${id}/move`, { method: 'PUT', body: { stageId } });
    await invalidateDeals();
    return res;
  };
  const updateDeal = async (id: string, body: Record<string, unknown>) => {
    const res = await apiFetch(`/crm/deals/${id}`, { method: 'PUT', body });
    await invalidateDeals();
    return res;
  };
  const deleteDeal = async (id: string) => {
    const res = await apiFetch(`/crm/deals/${id}`, { method: 'DELETE' });
    await invalidateDeals();
    return res;
  };

  return {
    createContact,
    upsertContact,
    addTag,
    removeTag,
    createPipeline,
    createDeal,
    moveDeal,
    updateDeal,
    deleteDeal,
  };
}
