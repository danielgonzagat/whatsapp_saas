'use client';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';
import { apiFetch } from '@/lib/api';

export function useCollaborators() {
  const { data, isLoading, mutate } = useSWR('/partnerships/collaborators', swrFetcher);
  const d = data as any;
  return { agents: d?.agents || [], invites: d?.invites || [], isLoading, mutate };
}

export function useCollaboratorStats() {
  const { data, isLoading } = useSWR('/partnerships/collaborators/stats', swrFetcher);
  return { stats: (data || { total: 0, online: 0, pendingInvites: 0 }) as any, isLoading };
}

export function useAffiliates(params?: { type?: string; search?: string }) {
  const qs = new URLSearchParams();
  if (params?.type && params.type !== 'todos') qs.set('type', params.type);
  if (params?.search) qs.set('search', params.search);
  const q = qs.toString();
  const { data, isLoading, mutate } = useSWR(`/partnerships/affiliates${q ? `?${q}` : ''}`, swrFetcher);
  const d = data as any;
  return { affiliates: d?.affiliates || [], isLoading, mutate };
}

export function useAffiliateStats() {
  const { data, isLoading } = useSWR('/partnerships/affiliates/stats', swrFetcher, { refreshInterval: 60000 });
  return { stats: (data || { activeAffiliates: 0, producers: 0, totalRevenue: 0, totalCommissions: 0, topPartner: null }) as any, isLoading };
}

export function useAffiliateDetail(id: string | null) {
  const { data, isLoading } = useSWR(id ? `/partnerships/affiliates/${id}` : null, swrFetcher);
  const d = data as any;
  return { affiliate: d?.affiliate || null, isLoading };
}

export function usePartnerChatContacts() {
  const { data, isLoading, mutate } = useSWR('/partnerships/chat/contacts', swrFetcher, { refreshInterval: 15000 });
  const d = data as any;
  return { contacts: d?.contacts || [], isLoading, mutate };
}

export function usePartnerMessages(partnerId: string | null) {
  const { data, isLoading, mutate } = useSWR(
    partnerId ? `/partnerships/chat/${partnerId}/messages` : null,
    swrFetcher,
    { refreshInterval: 5000 }
  );
  const d = data as any;
  return { messages: d?.messages || [], isLoading, mutate };
}

export async function inviteCollaborator(data: { email: string; role: string }) {
  return apiFetch('/partnerships/collaborators/invite', { method: 'POST', body: data });
}

export async function revokeInvite(id: string) {
  return apiFetch(`/partnerships/collaborators/invite/${id}`, { method: 'DELETE' });
}

export async function updateCollaboratorRole(agentId: string, role: string) {
  return apiFetch(`/partnerships/collaborators/${agentId}/role`, { method: 'PUT', body: { role } });
}

export async function removeCollaborator(agentId: string) {
  return apiFetch(`/partnerships/collaborators/${agentId}`, { method: 'DELETE' });
}

export async function createAffiliate(data: any) {
  return apiFetch('/partnerships/affiliates', { method: 'POST', body: data });
}

export async function approveAffiliate(id: string) {
  return apiFetch(`/partnerships/affiliates/${id}/approve`, { method: 'POST' });
}

export async function revokeAffiliate(id: string) {
  return apiFetch(`/partnerships/affiliates/${id}/revoke`, { method: 'POST' });
}

export async function sendPartnerMessage(partnerId: string, content: string) {
  return apiFetch(`/partnerships/chat/${partnerId}/messages`, { method: 'POST', body: { content } });
}

export async function markPartnerAsRead(partnerId: string) {
  return apiFetch(`/partnerships/chat/${partnerId}/read`, { method: 'PUT' });
}
