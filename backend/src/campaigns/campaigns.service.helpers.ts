/**
 * @cluster whatsapp_saas/backend/campaigns
 * Pure service helpers extracted from CampaignsService.
 *
 * These helpers are DI-free and side-effect-free: they take plain inputs
 * and return plain outputs, so they can be unit-tested in isolation.
 */

import { scoreCampaignStats } from './campaigns.helpers';

/** Campaign status values used in this service's transition logic. */
export const CAMPAIGN_STATUS = {
  DRAFT: 'DRAFT',
  SCHEDULED: 'SCHEDULED',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  PAUSED: 'PAUSED',
} as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUS)[keyof typeof CAMPAIGN_STATUS];

/**
 * Return the default (zeroed) stats payload for a newly-created campaign.
 * Used by `create()` so the DRAFT row always starts with a known shape.
 */
export function buildCampaignDefaultStats(): {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
} {
  return { sent: 0, delivered: 0, read: 0, failed: 0 };
}

/**
 * Returns `true` when the given campaign status allows pausing.
 *
 * Only RUNNING and SCHEDULED campaigns can be paused; DRAFT and COMPLETED
 * campaigns should throw `BadRequestException`.
 */
export function isCampaignPausable(status: string): boolean {
  return status === CAMPAIGN_STATUS.RUNNING || status === CAMPAIGN_STATUS.SCHEDULED;
}

/**
 * Returns `true` when the campaign has already been processed (RUNNING or
 * COMPLETED) and therefore cannot be launched again.
 */
export function isCampaignAlreadyProcessed(status: string): boolean {
  return status === CAMPAIGN_STATUS.RUNNING || status === CAMPAIGN_STATUS.COMPLETED;
}

/**
 * Extract a conversion score from a campaign-like row via
 * `scoreCampaignStats`. Thin wrapper so callers access the `stats` field
 * once, consistently.
 */
export function scoreCampaignRow(row: { stats?: unknown }): number {
  return scoreCampaignStats(row?.stats);
}