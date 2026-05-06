import { apiFetch } from './core';
import { mutate } from 'swr';

interface Affiliate {
  id: string;
  partnerName: string;
  partnerEmail: string;
  type: string;
  status: string;
  totalRevenue: number;
  totalCommission: number;
  commissionRate: number;
  temperature: number;
  totalSales: number;
  productIds: string[];
  createdAt: string;
  updatedAt: string;
}

interface AffiliateStats {
  activeAffiliates: number;
  producers: number;
  totalRevenue: number;
  totalCommissions: number;
  topPartner: { name: string; revenue: number } | null;
}

interface CollaboratorStats {
  total: number;
  online: number;
  pendingInvites: number;
}

interface CollaboratorsResponse {
  agents: unknown[];
  invites: unknown[];
}

const invalidatePartnerships = () =>
  mutate((key: string) => typeof key === 'string' && key.startsWith('/partnerships'));

export const partnershipsApi = {
  // ── Collaborators ──
  listCollaborators: () => apiFetch<CollaboratorsResponse>('/partnerships/collaborators'),

  getCollaboratorStats: () => apiFetch<CollaboratorStats>('/partnerships/collaborators/stats'),

  inviteCollaborator: async (data: { email: string; role: string }) => {
    const res = await apiFetch('/partnerships/collaborators/invite', {
      method: 'POST',
      body: data,
    });
    invalidatePartnerships();
    return res;
  },

  revokeInvite: async (id: string) => {
    const res = await apiFetch(`/partnerships/collaborators/invite/${id}`, { method: 'DELETE' });
    invalidatePartnerships();
    return res;
  },

  updateCollaboratorRole: async (agentId: string, role: string) => {
    const res = await apiFetch(`/partnerships/collaborators/${agentId}/role`, {
      method: 'PUT',
      body: { role },
    });
    invalidatePartnerships();
    return res;
  },

  removeCollaborator: async (agentId: string) => {
    const res = await apiFetch(`/partnerships/collaborators/${agentId}`, { method: 'DELETE' });
    invalidatePartnerships();
    return res;
  },

  // ── Affiliates ──
  listAffiliates: (params?: { type?: string; status?: string; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.type) qs.set('type', params.type);
    if (params?.status) qs.set('status', params.status);
    if (params?.search) qs.set('search', params.search);
    const q = qs.toString();
    return apiFetch<{ affiliates: Affiliate[] }>(`/partnerships/affiliates${q ? `?${q}` : ''}`);
  },

  getAffiliateStats: () => apiFetch<AffiliateStats>('/partnerships/affiliates/stats'),

  getAffiliateDetail: (id: string) =>
    apiFetch<{ affiliate: Affiliate }>(`/partnerships/affiliates/${encodeURIComponent(id)}`),

  createAffiliate: async (data: Record<string, unknown>) => {
    const res = await apiFetch('/partnerships/affiliates', { method: 'POST', body: data });
    invalidatePartnerships();
    return res;
  },

  approveAffiliate: async (id: string) => {
    const res = await apiFetch(`/partnerships/affiliates/${id}/approve`, { method: 'POST' });
    invalidatePartnerships();
    return res;
  },

  revokeAffiliate: async (id: string) => {
    const res = await apiFetch(`/partnerships/affiliates/${id}/revoke`, { method: 'POST' });
    invalidatePartnerships();
    return res;
  },

  getAffiliatePerformance: (affiliateId: string) =>
    apiFetch<{
      monthlyPerformance: number[];
      totalSales: number;
      totalRevenue: number;
      commission: number;
      lastSaleAt?: string;
    }>(`/partnerships/affiliates/${encodeURIComponent(affiliateId)}/performance`),

  affiliatePerformance: (affiliateId: string) =>
    partnershipsApi.getAffiliatePerformance(affiliateId),

  // ── Chat ──
  getChatContacts: () => apiFetch<{ contacts: unknown[] }>('/partnerships/chat/contacts'),

  getMessages: (partnerId: string, cursor?: string) => {
    const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    return apiFetch<{ messages: unknown[] }>(
      `/partnerships/chat/${encodeURIComponent(partnerId)}/messages${qs}`,
    );
  },

  sendMessage: async (partnerId: string, content: string) => {
    const res = await apiFetch(`/partnerships/chat/${encodeURIComponent(partnerId)}/messages`, {
      method: 'POST',
      body: { content },
    });
    invalidatePartnerships();
    return res;
  },

  markAsRead: async (partnerId: string) => {
    const res = await apiFetch(`/partnerships/chat/${encodeURIComponent(partnerId)}/read`, {
      method: 'PUT',
    });
    invalidatePartnerships();
    return res;
  },
};
