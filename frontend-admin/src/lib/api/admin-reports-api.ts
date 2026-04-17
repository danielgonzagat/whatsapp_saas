import { adminFetch } from './admin-client';
import type { AdminHomePeriod, AdminHomeResponse } from './admin-dashboard-api';

export interface AdminReportsOverviewResponse {
  snapshot: AdminHomeResponse;
  exportHistory: Array<{
    id: string;
    action: string;
    actorName: string | null;
    createdAt: string;
    details: unknown;
  }>;
}

export const adminReportsApi = {
  overview(query: { period?: AdminHomePeriod; from?: string; to?: string } = {}) {
    const params = new URLSearchParams();
    params.set('period', query.period ?? '30D');
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
    return adminFetch<AdminReportsOverviewResponse>(`/reports/overview?${params.toString()}`);
  },
  exportCsvRows(query: { period?: AdminHomePeriod; from?: string; to?: string } = {}) {
    const params = new URLSearchParams();
    params.set('period', query.period ?? '30D');
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
    return adminFetch<Array<Record<string, unknown>>>(`/reports/export/csv?${params.toString()}`);
  },
};
