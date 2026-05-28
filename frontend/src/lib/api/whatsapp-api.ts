// whatsappApi object
import { mutate } from 'swr';
import { apiFetch, buildQuery } from './core';

const invalidateWhatsAppApi = () =>
  mutate((key: string) => typeof key === 'string' && key.startsWith('/whatsapp'));

/** Whatsapp api. */
export const whatsappApi = {
  bootstrapSession: async () => {
    const res = await apiFetch<{
      connected: boolean;
      status?: string;
      message?: string;
      pendingConversations?: number;
      pendingMessages?: number;
      options?: string[];
    }>(`/whatsapp-api/session/bootstrap`, { method: 'POST' });
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
    }>(`/whatsapp-api/session/backlog/start`, {
      method: 'POST',
      body: { mode, limit },
    });
    invalidateWhatsAppApi();
    return res;
  },

  getCiaIntelligence: () => {
    return apiFetch<{
      businessState: Record<string, unknown>;
      marketSignals: Array<Record<string, unknown>>;
      humanTasks: Array<Record<string, unknown>>;
      demandStates: Array<Record<string, unknown>>;
      insights: Array<Record<string, unknown>>;
    }>(`/whatsapp-api/cia/intelligence`);
  },

  claimSession: async (sourceWorkspaceId: string) => {
    const res = await apiFetch<{
      success: boolean;
      message?: string;
      sessionName?: string;
      status?: Record<string, unknown>;
      bootstrap?: Record<string, unknown>;
    }>(`/whatsapp-api/session/claim`, {
      method: 'POST',
      body: { sourceWorkspaceId },
    });
    invalidateWhatsAppApi();
    return res;
  },

  getContacts: () => {
    return apiFetch<Array<Record<string, unknown>>>(`/whatsapp-api/contacts`);
  },

  createContact: async (body: { phone: string; name?: string; email?: string }) => {
    const res = await apiFetch<unknown>(`/whatsapp-api/contacts`, {
      method: 'POST',
      body: body,
    });
    invalidateWhatsAppApi();
    return res;
  },

  getChats: () => {
    return apiFetch<Array<Record<string, unknown>>>('/whatsapp-api/chats');
  },

  getChatMessages: (
    chatId: string,
    params?: { limit?: number; offset?: number; downloadMedia?: boolean },
  ) => {
    return apiFetch<Array<Record<string, unknown>>>(
      `/whatsapp-api/chats/${encodeURIComponent(chatId)}/messages${buildQuery({
        limit: params?.limit,
        offset: params?.offset,
        downloadMedia: params?.downloadMedia ? 'true' : undefined,
      })}`,
    );
  },

  setPresence: async (chatId: string, presence: 'typing' | 'paused' | 'seen') => {
    const res = await apiFetch<unknown>(
      `/whatsapp-api/chats/${encodeURIComponent(chatId)}/presence`,
      {
        method: 'POST',
        body: { presence },
      },
    );
    return res;
  },

  getBacklog: () => {
    return apiFetch<unknown>(`/whatsapp-api/backlog`);
  },

  syncHistory: async (reason?: string) => {
    const res = await apiFetch<unknown>(`/whatsapp-api/sync`, {
      method: 'POST',
      body: { reason },
    });
    invalidateWhatsAppApi();
    return res;
  },
};
