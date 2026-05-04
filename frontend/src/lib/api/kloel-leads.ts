import { apiFetch } from './core';

export const kloelLeadsApi = {
  list: (workspaceId: string) =>
    apiFetch<Array<Record<string, unknown>>>(`/kloel/leads/${encodeURIComponent(workspaceId)}`),
};
