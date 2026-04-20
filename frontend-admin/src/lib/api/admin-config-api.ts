import { adminFetch } from './admin-client';

/** Admin config workspace row shape. */
export interface AdminConfigWorkspaceRow {
  /** Workspace id property. */
  workspaceId: string;
  /** Name property. */
  name: string;
  /** Custom domain property. */
  customDomain: string | null;
  /** Guest mode property. */
  guestMode: boolean;
  /** Autopilot enabled property. */
  autopilotEnabled: boolean;
  /** Auth mode property. */
  authMode: string | null;
  /** Api keys count property. */
  apiKeysCount: number;
  /** Webhook subscriptions count property. */
  webhookSubscriptionsCount: number;
  /** Updated at property. */
  updatedAt: string;
}

/** Admin config overview response shape. */
export interface AdminConfigOverviewResponse {
  /** Metrics property. */
  metrics: {
    totalWorkspaces: number;
    customDomainsActive: number;
    apiKeysActive: number;
    webhookSubscriptions: number;
    autopilotEnabled: number;
  };
  /** Workspaces property. */
  workspaces: AdminConfigWorkspaceRow[];
}

/** Admin config api. */
export const adminConfigApi = {
  overview(search?: string): Promise<AdminConfigOverviewResponse> {
    const qs = search ? `?search=${encodeURIComponent(search)}` : '';
    return adminFetch<AdminConfigOverviewResponse>(`/config/overview${qs}`);
  },
  updateWorkspace(
    workspaceId: string,
    body: {
      customDomain?: string;
      guestMode?: boolean;
      autopilotEnabled?: boolean;
      authMode?: string;
    },
  ): Promise<AdminConfigWorkspaceRow> {
    return adminFetch<AdminConfigWorkspaceRow>(
      `/config/workspaces/${encodeURIComponent(workspaceId)}`,
      {
        method: 'PATCH',
        body,
      },
    );
  },
};
