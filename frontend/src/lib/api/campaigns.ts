// Campaign interfaces and functions
import { mutate } from 'swr';
import { apiFetch } from './core';

const invalidateCampaigns = () =>
  mutate((key: string) => typeof key === 'string' && key.startsWith('/campaigns'));

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
  stats?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  parentId?: string | null;
  [key: string]: unknown;
}

export async function listCampaigns(workspaceId: string): Promise<Campaign[]> {
  const res = await apiFetch<Campaign[] | { campaigns: Campaign[] }>(
    `/campaigns?workspaceId=${encodeURIComponent(workspaceId)}`,
  );
  if (res.error) throw new Error(res.error);
  const data = res.data;
  if (Array.isArray(data)) return data;
  return (data as { campaigns: Campaign[] } | undefined)?.campaigns || [];
}

export async function createCampaign(
  workspaceId: string,
  payload: Record<string, unknown>,
): Promise<Campaign> {
  const res = await apiFetch<Campaign>(`/campaigns`, {
    method: 'POST',
    body: { workspaceId, ...payload },
  });
  if (res.error) throw new Error(res.error);
  invalidateCampaigns();
  return res.data as Campaign;
}

export async function launchCampaign(
  workspaceId: string,
  campaignId: string,
  opts?: { smartTime?: boolean },
): Promise<unknown> {
  const res = await apiFetch<Record<string, unknown>>(
    `/campaigns/${encodeURIComponent(campaignId)}/launch`,
    {
      method: 'POST',
      body: { workspaceId, smartTime: Boolean(opts?.smartTime) },
    },
  );
  if (res.error) throw new Error(res.error);
  invalidateCampaigns();
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
  invalidateCampaigns();
  return res.data as { created: number; variantIds: string[] };
}

export async function evaluateCampaignDarwin(
  workspaceId: string,
  campaignId: string,
): Promise<unknown> {
  const res = await apiFetch<Record<string, unknown>>(
    `/campaigns/${encodeURIComponent(campaignId)}/darwin/evaluate`,
    {
      method: 'POST',
      body: { workspaceId },
    },
  );
  if (res.error) throw new Error(res.error);
  invalidateCampaigns();
  return res.data;
}
