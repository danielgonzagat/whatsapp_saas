'use client';
import { apiFetch } from '@/lib/api';
import { swrFetcher } from '@/lib/fetcher';
import useSWR, { mutate } from 'swr';

/* ── Response types ── */
interface CollaboratorsResponse {
  agents?: unknown[];
  invites?: unknown[];
}

interface CollaboratorStats {
  total: number;
  online: number;
  pendingInvites: number;
}

interface AffiliatesResponse {
  affiliates?: unknown[];
}

interface AffiliateStats {
  activeAffiliates: number;
  producers: number;
  totalRevenue: number;
  totalCommissions: number;
  topPartner: string | null;
}

interface AffiliateDetailResponse {
  affiliate?: unknown;
}

function normalizeContact(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...raw,
    time: raw.lastMessageTime
      ? new Date(raw.lastMessageTime as string).toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : '',
  };
}

function normalizeMessage(raw: Record<string, unknown>): Record<string, unknown> {
  const createdAt = raw.createdAt as string | undefined;
  return {
    id: raw.id,
    sender: (raw.senderName as string) || '',
    content: (raw.content as string) || '',
    time: createdAt
      ? new Date(createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : '',
    isMe: (raw.senderType as string) === 'OWNER',
    createdAt,
  };
}

interface RawAffiliateRecord {
  id?: string;
  partnerName?: string;
  partnerEmail?: string;
  type?: string;
  status?: string;
  totalRevenue?: number;
  commissionRate?: number;
  temperature?: number;
  totalSales?: number;
  productIds?: unknown;
  createdAt?: string;
}

function asLowercaseString(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function normalizeAffiliate(record: unknown) {
  const raw = (record || {}) as RawAffiliateRecord;
  return {
    id: raw.id || '',
    name: raw.partnerName || '',
    email: raw.partnerEmail || '',
    type: asLowercaseString(raw.type),
    status: asLowercaseString(raw.status),
    revenue: Number(raw.totalRevenue || 0),
    commission: Number(raw.commissionRate || 0),
    temperature: Number(raw.temperature || 0),
    totalSales: Number(raw.totalSales || 0),
    products: asStringArray(raw.productIds),
    joined: raw.createdAt || '',
  };
}

function normalizeTopPartner(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  if (
    value &&
    typeof value === 'object' &&
    'name' in value &&
    typeof value.name === 'string' &&
    value.name.trim()
  ) {
    return value.name;
  }

  return null;
}

/** Use collaborators. */
export function useCollaborators() {
  const { data, isLoading, mutate } = useSWR('/partnerships/collaborators', swrFetcher);
  const d = data as CollaboratorsResponse | undefined;
  return { agents: d?.agents || [], invites: d?.invites || [], isLoading, mutate };
}

/** Use collaborator stats. */
export function useCollaboratorStats() {
  const { data, isLoading } = useSWR('/partnerships/collaborators/stats', swrFetcher);
  return {
    stats: (data || { total: 0, online: 0, pendingInvites: 0 }) as CollaboratorStats,
    isLoading,
  };
}

/** Use affiliates. */
export function useAffiliates(params?: { type?: string; search?: string }) {
  const qs = new URLSearchParams();
  if (params?.type && params.type !== 'todos') {
    qs.set('type', params.type);
  }
  if (params?.search) {
    qs.set('search', params.search);
  }
  const q = qs.toString();
  const { data, isLoading, mutate } = useSWR(
    `/partnerships/affiliates${q ? `?${q}` : ''}`,
    swrFetcher,
  );
  const d = data as AffiliatesResponse | undefined;
  return {
    affiliates: (d?.affiliates || []).map(normalizeAffiliate),
    isLoading,
    mutate,
  };
}

/** Use affiliate stats. */
export function useAffiliateStats() {
  const { data, isLoading } = useSWR('/partnerships/affiliates/stats', swrFetcher, {
    refreshInterval: 60000,
  });
  return {
    stats: {
      activeAffiliates:
        Number((data as Record<string, unknown> | undefined)?.activeAffiliates || 0) || 0,
      producers: Number((data as Record<string, unknown> | undefined)?.producers || 0) || 0,
      totalRevenue: Number((data as Record<string, unknown> | undefined)?.totalRevenue || 0) || 0,
      totalCommissions:
        Number((data as Record<string, unknown> | undefined)?.totalCommissions || 0) || 0,
      topPartner: normalizeTopPartner(
        (data as Record<string, unknown> | undefined)?.topPartner || null,
      ),
    } as AffiliateStats,
    isLoading,
  };
}

/** Use affiliate detail. */
export function useAffiliateDetail(id: string | null) {
  const { data, isLoading } = useSWR(id ? `/partnerships/affiliates/${id}` : null, swrFetcher);
  const d = data as AffiliateDetailResponse | undefined;
  return { affiliate: d?.affiliate || null, isLoading };
}

/** Use partner chat contacts. */
export function usePartnerChatContacts() {
  const { data, isLoading, mutate } = useSWR('/partnerships/chat/contacts', swrFetcher, {
    refreshInterval: 15000,
  });
  const contacts = Array.isArray((data as Record<string, unknown> | undefined)?.contacts)
    ? ((data as Record<string, unknown>).contacts as Record<string, unknown>[]).map(
        normalizeContact,
      )
    : [];
  return { contacts, isLoading, mutate };
}

/** Use partner messages. */
export function usePartnerMessages(partnerId: string | null) {
  const { data, isLoading, mutate } = useSWR(
    partnerId ? `/partnerships/chat/${partnerId}/messages` : null,
    swrFetcher,
    { refreshInterval: 15000 },
  );
  const messages = Array.isArray((data as Record<string, unknown> | undefined)?.messages)
    ? ((data as Record<string, unknown>).messages as Record<string, unknown>[]).map(
        normalizeMessage,
      )
    : [];
  return { messages, isLoading, mutate };
}

const invalidateCollaborators = () =>
  mutate((key: string) => typeof key === 'string' && key.startsWith('/partnerships/collaborators'));
const invalidateAffiliates = () =>
  mutate((key: string) => typeof key === 'string' && key.startsWith('/partnerships/affiliates'));
const invalidateChat = () =>
  mutate((key: string) => typeof key === 'string' && key.startsWith('/partnerships/chat'));

/** Invite collaborator. */
export async function inviteCollaborator(data: { email: string; role: string }) {
  const res = await apiFetch('/partnerships/collaborators/invite', { method: 'POST', body: data });
  await invalidateCollaborators();
  return res;
}

/** Revoke invite. */
export async function revokeInvite(id: string) {
  const res = await apiFetch(`/partnerships/collaborators/invite/${id}`, { method: 'DELETE' });
  await invalidateCollaborators();
  return res;
}

/** Update collaborator role. */
export async function updateCollaboratorRole(agentId: string, role: string) {
  const res = await apiFetch(`/partnerships/collaborators/${agentId}/role`, {
    method: 'PUT',
    body: { role },
  });
  await invalidateCollaborators();
  return res;
}

/** Remove collaborator. */
export async function removeCollaborator(agentId: string) {
  const res = await apiFetch(`/partnerships/collaborators/${agentId}`, { method: 'DELETE' });
  await invalidateCollaborators();
  return res;
}

/** Create affiliate. */
export async function createAffiliate(data: Record<string, unknown>) {
  const res = await apiFetch('/partnerships/affiliates', { method: 'POST', body: data });
  await invalidateAffiliates();
  return res;
}

/** Approve affiliate. */
export async function approveAffiliate(id: string) {
  const res = await apiFetch(`/partnerships/affiliates/${id}/approve`, { method: 'POST' });
  await invalidateAffiliates();
  return res;
}

/** Revoke affiliate. */
export async function revokeAffiliate(id: string) {
  const res = await apiFetch(`/partnerships/affiliates/${id}/revoke`, { method: 'POST' });
  await invalidateAffiliates();
  return res;
}

/** Send partner message. */
export async function sendPartnerMessage(partnerId: string, content: string) {
  const res = await apiFetch(`/partnerships/chat/${partnerId}/messages`, {
    method: 'POST',
    body: { content },
  });
  await invalidateChat();
  return res;
}

/** Mark partner as read. */
export async function markPartnerAsRead(partnerId: string) {
  const res = await apiFetch(`/partnerships/chat/${partnerId}/read`, { method: 'PUT' });
  await invalidateChat();
  return res;
}
