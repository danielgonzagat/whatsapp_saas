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
};
