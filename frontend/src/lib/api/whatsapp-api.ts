// whatsappApi object
import { mutate } from 'swr';
import { apiFetch, buildQuery } from './core';

const invalidateWhatsAppApi = () =>
  mutate((key: string) => typeof key === 'string' && key.startsWith('/whatsapp'));

/** Whatsapp api. */
export const whatsappApi = {
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
};
