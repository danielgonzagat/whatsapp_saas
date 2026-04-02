// Campaign interfaces and functions
import { apiFetch } from './core';

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  status?: string;
  type?: string;
  targetAudience?: string;
  messageTemplate?: string;
  scheduledAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  stats?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
  parentId?: string | null;
  [key: string]: any;
}

export async function listCampaigns(workspaceId: string): Promise<Campaign[]> {
  const res = await apiFetch<any>(`/campaigns?workspaceId=${encodeURIComponent(workspaceId)}`);
  if (res.error) throw new Error(res.error);
  const data = res.data as Record<string, any> | undefined;
  if (Array.isArray(data)) return data;
  return data?.campaigns || [];
}

export async function createCampaign(workspaceId: string, payload: any): Promise<Campaign> {
  const res = await apiFetch<Campaign>(`/campaigns`, {
    method: 'POST',
    body: { workspaceId, ...payload },
  });
  if (res.error) throw new Error(res.error);
  return res.data as Campaign;
}

export async function launchCampaign(
  workspaceId: string,
  campaignId: string,
  opts?: { smartTime?: boolean },
): Promise<any> {
  const res = await apiFetch<any>(`/campaigns/${encodeURIComponent(campaignId)}/launch`, {
    method: 'POST',
    body: { workspaceId, smartTime: !!opts?.smartTime },
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function createCampaignVariants(
  workspaceId: string,
  campaignId: string,
  variants?: number,
): Promise<{ created: number; variantIds: string[] }> {
  const res = await apiFetch<{ created: number; variantIds: string[] }>(
    `/campaigns/${encodeURIComponent(campaignId)}/darwin/variants`,
    {
      method: 'POST',
      body: { workspaceId, variants },
    },
  );
  if (res.error) throw new Error(res.error);
  return res.data as { created: number; variantIds: string[] };
}

export async function evaluateCampaignDarwin(workspaceId: string, campaignId: string): Promise<any> {
  const res = await apiFetch<any>(`/campaigns/${encodeURIComponent(campaignId)}/darwin/evaluate`, {
    method: 'POST',
    body: { workspaceId },
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}
