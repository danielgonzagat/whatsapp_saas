import { apiFetch } from './core';

export const launchApi = {
  createLauncher: (data: { name: string; description?: string; [key: string]: unknown }) =>
    apiFetch<{ id: string; name: string; slug?: string; createdAt: string }>('/launch/launcher', {
      method: 'POST',
      body: data,
    }),

  addGroups: (launcherId: string, data: { groupLink: string; [key: string]: unknown }) =>
    apiFetch<{ id: string; groupLink: string }>(
      `/launch/launcher/${encodeURIComponent(launcherId)}/groups`,
      {
        method: 'POST',
        body: data,
      },
    ),
};
