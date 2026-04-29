import { adminApiUrl, adminFetch } from './admin-client';

/** Admin queue summary response shape. */
export interface AdminOpsQueueSummary {
  /** Name property. */
  name: string;
  /** Main queue counts. */
  main: Record<string, number>;
  /** Dead-letter queue counts. */
  dlq: Record<string, number>;
  /** Waiting threshold. */
  threshold?: number;
}

/** Admin dead-letter queue job response shape. */
export interface AdminOpsDlqJob {
  /** Job id. */
  id: string | number | null;
  /** Job name. */
  name: string;
  /** Job data. */
  data: unknown;
  /** Job options. */
  opts: unknown;
  /** Failed reason. */
  failedReason?: string;
  /** Attempts made. */
  attemptsMade?: number;
  /** Timestamp. */
  timestamp?: number;
}

/** Admin suspended billing workspace response shape. */
export interface AdminOpsSuspendedWorkspace {
  /** Workspace id. */
  id: string;
  /** Workspace name. */
  name: string;
  /** Subscription status. */
  subscriptionStatus: string;
}

function opsUrl(path: string) {
  const base = adminApiUrl.replace(/\/admin\/?$/, '');
  return `${base}${path}`;
}

/** Admin ops api. */
export const adminOpsApi = {
  queues() {
    return adminFetch<AdminOpsQueueSummary[]>(opsUrl('/ops/queues'));
  },
  dlq(name: string, limit = 20) {
    const params = new URLSearchParams({ limit: String(limit) });
    return adminFetch<AdminOpsDlqJob[]>(
      opsUrl(`/ops/queues/${encodeURIComponent(name)}/dlq?${params.toString()}`),
    );
  },
  retryDlq(name: string, limit = 10) {
    return adminFetch<{ queue: string; retried: number }, { limit: number }>(
      opsUrl(`/ops/queues/${encodeURIComponent(name)}/dlq/retry`),
      {
        method: 'POST',
        body: { limit },
      },
    );
  },
  webhookAlerts(limit = 20) {
    const params = new URLSearchParams({ limit: String(limit) });
    return adminFetch<unknown[]>(opsUrl(`/ops/queues/alerts/webhooks?${params.toString()}`));
  },
  billingSuspended() {
    return adminFetch<AdminOpsSuspendedWorkspace[]>(opsUrl('/ops/queues/billing/suspended'));
  },
};
