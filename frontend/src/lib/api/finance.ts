import { apiFetch } from './core';

export async function getPaymentsStatus() {
  return apiFetch<{ status: string; healthy: boolean; providers: Record<string, string> }>(
    '/kloel/payments/status',
  );
}

export async function getFinanceWebhookRecent(workspaceId: string, data?: { limit?: number }) {
  return apiFetch<{
    events: Array<{ id: string; provider: string; status: string; createdAt: string }>;
  }>(`/hooks/finance/${encodeURIComponent(workspaceId)}/recent`, {
    method: 'POST',
    body: data || {},
  });
}
