import { apiFetch } from './core';

export const scrapersApi = {
  createJob: (data: {
    workspaceId: string;
    type: 'MAPS' | 'INSTAGRAM' | 'GROUP';
    query: string;
    location?: string;
    flowId?: string;
  }) =>
    apiFetch<{ id: string; type: string; query: string; status: string; createdAt: string }>(
      '/scrapers/jobs',
      {
        method: 'POST',
        body: data,
      },
    ),

  importResults: (jobId: string, workspaceId: string) =>
    apiFetch<{ imported: number; errors?: Array<{ message: string }> }>(
      `/scrapers/jobs/${encodeURIComponent(jobId)}/import`,
      {
        method: 'POST',
        body: { workspaceId },
      },
    ),
};
