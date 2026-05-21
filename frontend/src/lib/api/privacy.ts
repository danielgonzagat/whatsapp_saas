import { apiFetch } from './core';

export const gdprApi = {
  requestDeletion: () =>
    apiFetch<{ success: boolean; message: string }>('/kloel/data/request-deletion', {
      method: 'POST',
    }),

  exportData: () =>
    apiFetch<{
      contacts: Array<Record<string, unknown>>;
      messages: Array<Record<string, unknown>>;
      sales: Array<Record<string, unknown>>;
      exportedAt: string;
    }>('/kloel/data/export'),

  requestGdprExport: () =>
    apiFetch<{ code: string; status: string; requestedAt: string }>('/gdpr/export-request', {
      method: 'POST',
    }),

  requestGdprDeletion: () =>
    apiFetch<{ code: string; status: string; requestedAt: string }>('/gdpr/delete-request', {
      method: 'POST',
    }),

  verifyIdentity: (code: string, token: string) =>
    apiFetch<{ code: string; status: string; message: string }>(
      `/gdpr/verify/${encodeURIComponent(code)}?token=${encodeURIComponent(token)}`,
      { method: 'POST' },
    ),

  getStatus: (code: string) =>
    apiFetch<{
      code?: string;
      type?: string;
      status?: string;
      requestedAt?: string;
      completedAt?: string | null;
      message?: string;
    }>(`/gdpr/status/${encodeURIComponent(code)}`),
};
