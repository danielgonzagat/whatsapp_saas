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
  if (res.status >= 400) {
    throw new Error('Failed to list campaigns');
  }
  const data = res.data;
  if (Array.isArray(data)) {
    return data;
  }
  if (data && Array.isArray(data.campaigns)) {
    return data.campaigns;
  }
  throw new Error('Campaign list did not return a confirmed payload');
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
  if (res.error || res.status >= 400) {
    throw new Error(res.error || 'Failed to create campaign');
  }
  if (!res.data) {
    throw new Error('Campaign creation did not return a confirmed payload');
  }
  invalidateCampaigns();
  return res.data;
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
  if (res.error || res.status >= 400) {
    throw new Error(res.error || 'Failed to launch campaign');
  }
  if (!res.data) {
    throw new Error('Campaign launch did not return a confirmed payload');
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
  if (res.error || res.status >= 400) {
    throw new Error(res.error || 'Failed to pause campaign');
  }
  if (!res.data) {
    throw new Error('Campaign pause did not return a confirmed payload');
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
  if (res.error || res.status >= 400) {
    throw new Error(res.error || 'Failed to create campaign variants');
  }
  if (!res.data) {
    throw new Error('Campaign variant creation did not return a confirmed payload');
  }
  invalidateCampaigns();
  return res.data;
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
  if (res.error || res.status >= 400) {
    throw new Error(res.error || 'Failed to evaluate campaign Darwin');
  }
  if (!res.data) {
    throw new Error('Campaign Darwin evaluation did not return a confirmed payload');
  }
  invalidateCampaigns();
  return res.data;
}
