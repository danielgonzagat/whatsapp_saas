// whatsappApi object
import { mutate } from 'swr';
import { apiFetch, buildQuery } from './core';

const invalidateWhatsAppApi = () =>
  mutate((key: string) => typeof key === 'string' && key.startsWith('/api/whatsapp'));

function buildLegacyDisabledResponse(feature: string, extra?: Record<string, unknown>) {
  const payload = {
    statusCode: 410,
    success: false,
    provider: 'meta-cloud',
    feature,
    notSupported: true,
    reason: `${feature}_not_supported_for_meta_cloud`,
    message: 'Descontinuado. Use a integração Meta.',
    ...(extra || {}),
  } as const;

  return {
    ...payload,
    data: payload,
    error: payload.message,
    status: 410,
  };
}

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
      businessState: Record<string, unknown>;
      marketSignals: Array<Record<string, unknown>>;
      humanTasks: Array<Record<string, unknown>>;
      demandStates: Array<Record<string, unknown>>;
      insights: Array<Record<string, unknown>>;
    }>(`/api/whatsapp-api/cia/intelligence`);
  },

  getStatus: () => {
    return apiFetch(`/api/whatsapp-api/session/status`);
  },

  getQrCode: () => {
    return Promise.resolve(buildLegacyDisabledResponse('qr_code', { available: false }));
  },

  claimSession: async (_sourceWorkspaceId: string) => {
    return Promise.resolve(buildLegacyDisabledResponse('legacy_session_claim'));
  },

  disconnect: async () => {
    const res = await apiFetch(`/api/whatsapp-api/session/disconnect`, { method: 'DELETE' });
    invalidateWhatsAppApi();
    return res;
  },

  logout: async () => {
    const res = await apiFetch(`/api/whatsapp-api/session/logout`, { method: 'POST' });
    invalidateWhatsAppApi();
    return res;
  },

  getViewer: () => {
    return Promise.resolve(buildLegacyDisabledResponse('viewer'));
  },

  takeover: async () => {
    return Promise.resolve(buildLegacyDisabledResponse('viewer_takeover'));
  },

  resumeAgent: async () => {
    return Promise.resolve(buildLegacyDisabledResponse('viewer_resume_agent'));
  },

  performViewerAction: async (_action: Record<string, unknown>) => {
    return Promise.resolve(buildLegacyDisabledResponse('viewer_action'));
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
    return apiFetch<Array<Record<string, unknown>>>(`/api/whatsapp-api/chats`);
  },

  getChatMessages: (
    chatId: string,
    params?: { limit?: number; offset?: number; downloadMedia?: boolean },
  ) => {
    return apiFetch<Array<Record<string, unknown>>>(
      `/api/whatsapp-api/chats/${encodeURIComponent(chatId)}/messages${buildQuery({
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
