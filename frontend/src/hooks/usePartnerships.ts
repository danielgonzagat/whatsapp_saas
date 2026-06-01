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

interface PartnerChatContactsResponse {
  contacts?: Record<string, unknown>[];
}

interface PartnerMessagesResponse {
  messages?: Record<string, unknown>[];
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

type ResolvedPayload<T> = { value: T; payloadError?: Error };

const EMPTY_COLLABORATOR_STATS: CollaboratorStats = { total: 0, online: 0, pendingInvites: 0 };
const EMPTY_AFFILIATE_STATS: AffiliateStats = {
  activeAffiliates: 0,
  producers: 0,
  totalRevenue: 0,
  totalCommissions: 0,
  topPartner: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isRecordArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every(isRecord);
}

function hasFiniteNumberKeys(payload: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((key) => Number.isFinite(payload[key]));
}

function invalidPayload<T>(fallback: T, invalidMessage: string): ResolvedPayload<T> {
  return { value: fallback, payloadError: new Error(invalidMessage) };
}

function resolveArrayEnvelope<T>(
  payload: unknown,
  isLoading: boolean,
  key: string,
  invalidMessage: string,
  fallback: T[],
  validateItems: (items: unknown) => items is T[],
): ResolvedPayload<T[]> {
  if (payload === undefined) {
    return isLoading ? { value: fallback } : invalidPayload(fallback, invalidMessage);
  }

  if (!isRecord(payload) || !validateItems(payload[key])) {
    return invalidPayload(fallback, invalidMessage);
  }

  return { value: payload[key] };
}

function resolveRecordPayload<T>(
  payload: unknown,
  isLoading: boolean,
  invalidMessage: string,
  fallback: T,
  validate: (payload: unknown) => payload is T,
): ResolvedPayload<T> {
  if (payload === undefined) {
    return isLoading ? { value: fallback } : invalidPayload(fallback, invalidMessage);
  }

  if (!validate(payload)) {
    return invalidPayload(fallback, invalidMessage);
  }

  return { value: payload };
}

function isCollaboratorStatsPayload(payload: unknown): payload is CollaboratorStats {
  return isRecord(payload) && hasFiniteNumberKeys(payload, ['total', 'online', 'pendingInvites']);
}

function isAffiliateStatsPayload(payload: unknown): payload is AffiliateStats {
  return (
    isRecord(payload) &&
    hasFiniteNumberKeys(payload, [
      'activeAffiliates',
      'producers',
      'totalRevenue',
      'totalCommissions',
    ]) &&
    Object.prototype.hasOwnProperty.call(payload, 'topPartner')
  );
}

function isAffiliateDetailPayload(payload: unknown): payload is AffiliateDetailResponse {
  return isRecord(payload) && isRecord(payload.affiliate);
}

/** Use collaborators. */
export function useCollaborators() {
  const { data, error, isLoading, mutate } = useSWR<CollaboratorsResponse>(
    '/partnerships/collaborators',
    swrFetcher,
  );
  const { value: agents, payloadError: agentsError } = resolveArrayEnvelope(
    data,
    isLoading,
    'agents',
    'Invalid collaborators payload',
    [],
    Array.isArray,
  );
  const { value: invites, payloadError: invitesError } = resolveArrayEnvelope(
    data,
    isLoading,
    'invites',
    'Invalid collaborators payload',
    [],
    Array.isArray,
  );
  return { agents, invites, isLoading, error: error ?? agentsError ?? invitesError, mutate };
}

/** Use collaborator stats. */
export function useCollaboratorStats() {
  const { data, error, isLoading } = useSWR<CollaboratorStats>(
    '/partnerships/collaborators/stats',
    swrFetcher,
  );
  const { value: stats, payloadError } = resolveRecordPayload(
    data,
    isLoading,
    'Invalid collaborator stats payload',
    EMPTY_COLLABORATOR_STATS,
    isCollaboratorStatsPayload,
  );
  return { stats, isLoading, error: error ?? payloadError };
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
  const { data, error, isLoading, mutate } = useSWR<AffiliatesResponse>(
    `/partnerships/affiliates${q ? `?${q}` : ''}`,
    swrFetcher,
  );
  const { value: affiliates, payloadError } = resolveArrayEnvelope(
    data,
    isLoading,
    'affiliates',
    'Invalid affiliates payload',
    [],
    Array.isArray,
  );
  return {
    affiliates: affiliates.map(normalizeAffiliate),
    isLoading,
    error: error ?? payloadError,
    mutate,
  };
}

/** Use affiliate stats. */
export function useAffiliateStats() {
  const { data, error, isLoading } = useSWR<AffiliateStats>('/partnerships/affiliates/stats', swrFetcher, {
    refreshInterval: 60000,
  });
  const { value: statsPayload, payloadError } = resolveRecordPayload(
    data,
    isLoading,
    'Invalid affiliate stats payload',
    EMPTY_AFFILIATE_STATS,
    isAffiliateStatsPayload,
  );
  return {
    stats: {
      activeAffiliates: statsPayload.activeAffiliates,
      producers: statsPayload.producers,
      totalRevenue: statsPayload.totalRevenue,
      totalCommissions: statsPayload.totalCommissions,
      topPartner: normalizeTopPartner(statsPayload.topPartner),
    } satisfies AffiliateStats,
    isLoading,
    error: error ?? payloadError,
  };
}

/** Use affiliate detail. */
export function useAffiliateDetail(id: string | null) {
  const { data, error, isLoading } = useSWR<AffiliateDetailResponse>(
    id ? `/partnerships/affiliates/${id}` : null,
    swrFetcher,
  );
  const { value: detail, payloadError } = resolveRecordPayload(
    data,
    isLoading,
    'Invalid affiliate detail payload',
    { affiliate: null },
    isAffiliateDetailPayload,
  );
  return { affiliate: detail.affiliate, isLoading, error: error ?? payloadError };
}

/** Use partner chat contacts. */
export function usePartnerChatContacts() {
  const { data, error, isLoading, mutate } = useSWR<PartnerChatContactsResponse>(
    '/partnerships/chat/contacts',
    swrFetcher,
    { refreshInterval: 15000 },
  );
  const { value: contacts, payloadError } = resolveArrayEnvelope(
    data,
    isLoading,
    'contacts',
    'Invalid partner chat contacts payload',
    [],
    isRecordArray,
  );
  return { contacts: contacts.map(normalizeContact), isLoading, error: error ?? payloadError, mutate };
}

/** Use partner messages. */
export function usePartnerMessages(partnerId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<PartnerMessagesResponse>(
    partnerId ? `/partnerships/chat/${partnerId}/messages` : null,
    swrFetcher,
    { refreshInterval: 15000 },
  );
  const { value: messages, payloadError } = resolveArrayEnvelope(
    data,
    isLoading,
    'messages',
    'Invalid partner messages payload',
    [],
    isRecordArray,
  );
  return { messages: messages.map(normalizeMessage), isLoading, error: error ?? payloadError, mutate };
}

const invalidateCollaborators = () =>
  mutate((key: string) => typeof key === 'string' && key.startsWith('/partnerships/collaborators'));
const invalidateAffiliates = () =>
  mutate((key: string) => typeof key === 'string' && key.startsWith('/partnerships/affiliates'));
const invalidateChat = () =>
  mutate((key: string) => typeof key === 'string' && key.startsWith('/partnerships/chat'));

function requirePartnershipMutationSuccess<T extends { error?: string }>(response: T): T {
  if (response.error) {
    throw new Error(response.error);
  }
  return response;
}

/** Invite collaborator. */
export async function inviteCollaborator(data: { email: string; role: string }) {
  const res = requirePartnershipMutationSuccess(
    await apiFetch('/partnerships/collaborators/invite', { method: 'POST', body: data }),
  );
  await invalidateCollaborators();
  return res;
}

/** Revoke invite. */
export async function revokeInvite(id: string) {
  const res = requirePartnershipMutationSuccess(
    await apiFetch(`/partnerships/collaborators/invite/${id}`, { method: 'DELETE' }),
  );
  await invalidateCollaborators();
  return res;
}

/** Update collaborator role. */
export async function updateCollaboratorRole(agentId: string, role: string) {
  const res = requirePartnershipMutationSuccess(
    await apiFetch(`/partnerships/collaborators/${agentId}/role`, {
      method: 'PUT',
      body: { role },
    }),
  );
  await invalidateCollaborators();
  return res;
}

/** Remove collaborator. */
export async function removeCollaborator(agentId: string) {
  const res = requirePartnershipMutationSuccess(
    await apiFetch(`/partnerships/collaborators/${agentId}`, { method: 'DELETE' }),
  );
  await invalidateCollaborators();
  return res;
}

/** Create affiliate. */
export async function createAffiliate(data: Record<string, unknown>) {
  const res = requirePartnershipMutationSuccess(
    await apiFetch('/partnerships/affiliates', { method: 'POST', body: data }),
  );
  await invalidateAffiliates();
  return res;
}

/** Approve affiliate. */
export async function approveAffiliate(id: string) {
  const res = requirePartnershipMutationSuccess(
    await apiFetch(`/partnerships/affiliates/${id}/approve`, { method: 'POST' }),
  );
  await invalidateAffiliates();
  return res;
}

/** Revoke affiliate. */
export async function revokeAffiliate(id: string) {
  const res = requirePartnershipMutationSuccess(
    await apiFetch(`/partnerships/affiliates/${id}/revoke`, { method: 'POST' }),
  );
  await invalidateAffiliates();
  return res;
}

/** Send partner message. */
export async function sendPartnerMessage(partnerId: string, content: string) {
  const res = requirePartnershipMutationSuccess(
    await apiFetch(`/partnerships/chat/${partnerId}/messages`, {
      method: 'POST',
      body: { content },
    }),
  );
  await invalidateChat();
  return res;
}

/** Mark partner as read. */
export async function markPartnerAsRead(partnerId: string) {
  const res = requirePartnershipMutationSuccess(
    await apiFetch(`/partnerships/chat/${partnerId}/read`, { method: 'PUT' }),
  );
  await invalidateChat();
  return res;
}
