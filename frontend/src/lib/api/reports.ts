import { apiFetch } from './core';

export async function getAdSpendReport(params?: { startDate?: string; endDate?: string }) {
  const qs = new URLSearchParams();
  if (params?.startDate) {
    qs.set('startDate', params.startDate);
  }
  if (params?.endDate) {
    qs.set('endDate', params.endDate);
  }
  const q = qs.toString();
  return apiFetch<{ spend: number; impressions: number; clicks: number; cpa: number }>(
    `/reports/ad-spend${q ? `?${q}` : ''}`,
  );
}

export async function sendReportEmail(data: {
  email: string;
  reportType?: string;
  period?: string;
  filters?: Record<string, string>;
}) {
  return apiFetch<{ success: boolean; message?: string }>('/reports/send-email', {
    method: 'POST',
    body: data,
  });
}
