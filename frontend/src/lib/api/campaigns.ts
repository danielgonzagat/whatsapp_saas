// Campaign interfaces and functions
import { mutate } from 'swr';
import { apiFetch } from './core';

const invalidateCampaigns = () =>
  mutate((key: string) => typeof key === 'string' && key.startsWith('/campaigns'));

/** Campaign shape. */
export interface Campaign {
  /** Id property. */
  id: string;
  /** Name property. */
  name: string;
  /** Description property. */
  description?: string;
  /** Status property. */
  status?: string;
  /** Type property. */
  type?: string;
  /** Target audience property. */
  targetAudience?: string;
  /** Message template property. */
  messageTemplate?: string;
  /** Scheduled at property. */
  scheduledAt?: string | null;
  /** Started at property. */
  startedAt?: string | null;
  /** Completed at property. */
  completedAt?: string | null;
  /** Stats property. */
  stats?: Record<string, unknown>;
  /** Created at property. */
  createdAt?: string;
  /** Updated at property. */
  updatedAt?: string;
  /** Parent id property. */
  parentId?: string | null;
  [key: string]: unknown;
}

/** List campaigns. */
export async function listCampaigns(workspaceId: string): Promise<Campaign[]> {
  const res = await apiFetch<Campaign[] | { campaigns: Campaign[] }>(
    `/campaigns?workspaceId=${encodeURIComponent(workspaceId)}`,
  );
  if (res.error) {
    throw new Error(res.error);
  }
  const data = res.data;
  if (Array.isArray(data)) {
    return data;
  }
  return (data as { campaigns: Campaign[] } | undefined)?.campaigns || [];
}

/** Create campaign. */
export async function createCampaign(
  workspaceId: string,
  payload: Record<string, unknown>,
): Promise<Campaign> {
  const res = await apiFetch<Campaign>(`/campaigns`, {
    method: 'POST',
    body: { workspaceId, ...payload },
  });
  if (res.error) {
    throw new Error(res.error);
  }
  invalidateCampaigns();
  return res.data as Campaign;
}

/** Launch campaign. */
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
  if (res.error) {
    throw new Error(res.error);
  }
  invalidateCampaigns();
  return res.data;
}

/** Pause campaign. */
export async function pauseCampaign(workspaceId: string, campaignId: string): Promise<unknown> {
  const res = await apiFetch<Record<string, unknown>>(
    `/campaigns/${encodeURIComponent(campaignId)}/pause`,
    {
      method: 'POST',
      body: { workspaceId },
    },
  );
  if (res.error) {
    throw new Error(res.error);
  }
  invalidateCampaigns();
  return res.data;
}

/** Create campaign variants. */
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
  if (res.error) {
    throw new Error(res.error);
  }
  invalidateCampaigns();
  return res.data as { created: number; variantIds: string[] };
}

/** Evaluate campaign darwin. */
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
  if (res.error) {
    throw new Error(res.error);
  }
  invalidateCampaigns();
  return res.data;
}
