import { adminFetch } from './admin-client';

export interface AdminConfigWorkspaceRow {
  workspaceId: string;
  name: string;
  customDomain: string | null;
  guestMode: boolean;
  autopilotEnabled: boolean;
  authMode: string | null;
  apiKeysCount: number;
  webhookSubscriptionsCount: number;
  updatedAt: string;
}

export interface AdminConfigOverviewResponse {
  metrics: {
    totalWorkspaces: number;
    customDomainsActive: number;
    apiKeysActive: number;
    webhookSubscriptions: number;
    autopilotEnabled: number;
  };
  workspaces: AdminConfigWorkspaceRow[];
}

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
