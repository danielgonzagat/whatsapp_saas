// whatsappApi object
import { apiFetch, buildQuery } from './core';

export const whatsappApi = {
  startSession: () => {
    return apiFetch(`/api/whatsapp-api/session/start`, { method: 'POST' });
  },

  bootstrapSession: () => {
    return apiFetch<{
      connected: boolean;
      status?: string;
      message?: string;
      pendingConversations?: number;
      pendingMessages?: number;
      options?: string[];
    }>(`/api/whatsapp-api/session/bootstrap`, { method: 'POST' });
  },

  startBacklog: (mode: string, limit?: number) => {
    return apiFetch<{
      queued: boolean;
      runId?: string;
      mode?: string;
      totalQueued?: number;
      message?: string;
    }>(`/api/whatsapp-api/session/backlog/start`, {
      method: 'POST',
      body: { mode, limit },
    });
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

  getQrCode: () => {
    return apiFetch<{ available: boolean; qr?: string }>(`/api/whatsapp-api/session/qr`);
  },

  claimSession: (sourceWorkspaceId: string) => {
    return apiFetch<{
      success: boolean;
      message?: string;
      sessionName?: string;
      status?: any;
      bootstrap?: any;
    }>(`/api/whatsapp-api/session/claim`, {
      method: 'POST',
      body: { sourceWorkspaceId },
    });
  },

  disconnect: () => {
    return apiFetch(`/api/whatsapp-api/session/disconnect`, { method: 'DELETE' });
  },

  logout: () => {
    return apiFetch(`/api/whatsapp-api/session/logout`, { method: 'POST' });
  },

  getViewer: () => {
    return apiFetch<any>(`/api/whatsapp-api/session/view`);
  },

  takeover: () => {
    return apiFetch<any>(`/api/whatsapp-api/session/takeover`, {
      method: 'POST',
    });
  },

  resumeAgent: () => {
    return apiFetch<any>(`/api/whatsapp-api/session/resume-agent`, {
      method: 'POST',
    });
  },

  performViewerAction: (action: Record<string, any>) => {
    return apiFetch<any>(`/api/whatsapp-api/session/action`, {
      method: 'POST',
      body: { action },
    });
  },

  getContacts: () => {
    return apiFetch<any[]>(`/whatsapp-api/contacts`);
  },

  createContact: (body: { phone: string; name?: string; email?: string }) => {
    return apiFetch<any>(`/whatsapp-api/contacts`, {
      method: 'POST',
      body: body,
    });
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

  setPresence: (
    chatId: string,
    presence: 'typing' | 'paused' | 'seen',
  ) => {
    return apiFetch<any>(
      `/whatsapp-api/chats/${encodeURIComponent(chatId)}/presence`,
      {
        method: 'POST',
        body: { presence },
      },
    );
  },

  getBacklog: () => {
    return apiFetch<any>(`/whatsapp-api/backlog`);
  },

  syncHistory: (reason?: string) => {
    return apiFetch<any>(`/whatsapp-api/sync`, {
      method: 'POST',
      body: { reason },
    });
  },
};
