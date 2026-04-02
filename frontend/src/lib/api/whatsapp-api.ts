// whatsappApi object
import { mutate } from 'swr';
import { apiFetch, buildQuery } from './core';

const invalidateWhatsAppApi = () =>
  mutate((key: string) => typeof key === 'string' && key.startsWith('/api/whatsapp'));

export const whatsappApi = {
  startSession: async () => {
    const res = await apiFetch(`/api/whatsapp-api/session/start`, { method: 'POST' });
    invalidateWhatsAppApi();
    return res;
  },

  bootstrapSession: async () => {
    const res = await apiFetch<{
      connected: boolean;
      status?: string;
      message?: string;
      pendingConversations?: number;
      pendingMessages?: number;
      options?: string[];
    }>(`/api/whatsapp-api/session/bootstrap`, { method: 'POST' });
    invalidateWhatsAppApi();
    return res;
  },

  startBacklog: async (mode: string, limit?: number) => {
    const res = await apiFetch<{
      queued: boolean;
      runId?: string;
      mode?: string;
      totalQueued?: number;
      message?: string;
    }>(`/api/whatsapp-api/session/backlog/start`, {
      method: 'POST',
      body: { mode, limit },
    });
    invalidateWhatsAppApi();
    return res;
  },

  getCiaIntelligence: () => {
    return apiFetch<{
      businessState: any;
      marketSignals: any[];
      humanTasks: any[];
      demandStates: any[];
      insights: any[];
    }>(`/api/whatsapp-api/cia/intelligence`);
  },

  getStatus: () => {
    return apiFetch(`/api/whatsapp-api/session/status`);
  },

  claimSession: async (sourceWorkspaceId: string) => {
    const res = await apiFetch<{
      success: boolean;
      message?: string;
      sessionName?: string;
      status?: any;
      bootstrap?: any;
    }>(`/api/whatsapp-api/session/claim`, {
      method: 'POST',
      body: { sourceWorkspaceId },
    });
    invalidateWhatsAppApi();
    return res;
  },

  getContacts: () => {
    return apiFetch<any[]>(`/whatsapp-api/contacts`);
  },

  createContact: async (body: { phone: string; name?: string; email?: string }) => {
    const res = await apiFetch<any>(`/whatsapp-api/contacts`, {
      method: 'POST',
      body: body,
    });
    invalidateWhatsAppApi();
    return res;
  },

  getChats: () => {
    return apiFetch<any[]>(`/api/whatsapp-api/chats`);
  },

  getChatMessages: (
    chatId: string,
    params?: { limit?: number; offset?: number; downloadMedia?: boolean },
  ) => {
    return apiFetch<any[]>(
      `/api/whatsapp-api/chats/${encodeURIComponent(chatId)}/messages${buildQuery({
        limit: params?.limit,
        offset: params?.offset,
        downloadMedia: params?.downloadMedia ? 'true' : undefined,
      })}`,
    );
  },

  setPresence: async (chatId: string, presence: 'typing' | 'paused' | 'seen') => {
    const res = await apiFetch<any>(`/whatsapp-api/chats/${encodeURIComponent(chatId)}/presence`, {
      method: 'POST',
      body: { presence },
    });
    return res;
  },

  getBacklog: () => {
    return apiFetch<any>(`/whatsapp-api/backlog`);
  },

  syncHistory: async (reason?: string) => {
    const res = await apiFetch<any>(`/whatsapp-api/sync`, {
      method: 'POST',
      body: { reason },
    });
    invalidateWhatsAppApi();
    return res;
  },
};
