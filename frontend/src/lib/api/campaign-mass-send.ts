import { apiFetch } from './core';

export const campaignMassSendApi = {
  start: (workspaceId: string, user: string, numbers: string[], message: string) =>
    apiFetch<{ success: boolean; campaignId?: string }>('/campaign/start', {
      method: 'POST',
      body: { workspaceId, user, numbers, message },
    }),
};
