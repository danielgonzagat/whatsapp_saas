import { DealStatus, Prisma } from '@prisma/client';

import type { SegmentationContact, SegmentCriteria } from './segmentation.types';

/**
 * @cluster whatsapp_saas/backend/autopilot
 * Pure helpers extracted from SegmentationService.
 *
 * These helpers are deliberately Prisma-client-free (they only use Prisma TS
 * types) so they can be unit-tested in isolation and reused across services
 * without dragging in DI.
 *
 * The public type surface (`SegmentCriteria`, `SegmentResult`,
 * `SegmentationContact`, `SegmentationDeal`) lives in `./segmentation.types`
 * and the preset catalog lives in `./segmentation.presets`. Both are
 * re-exported here so callers can keep importing from this module
 * (Gate-fix2-D, 2026-05-28).
 */

export type {
  PurchaseHistoryAll,
  PurchaseHistoryFilter,
  SegmentationContact,
  SegmentationDeal,
  SegmentCriteria,
  SegmentResult,
} from './segmentation.types';
export { PURCHASE_HISTORY_ALL } from './segmentation.types';
export { AVAILABLE_PRESETS, PRESET_SEGMENTS } from './segmentation.presets';

import { PURCHASE_HISTORY_ALL as PURCHASE_HISTORY_ALL_TOKEN } from './segmentation.types';
import type { PurchaseHistoryFilter } from './segmentation.types';

const DEAL_STATUS_VALUES = new Set<string>(Object.values(DealStatus));

/** Type guard: does `value` match a Prisma `DealStatus` enum member? */
export const isDealStatus = (value: string): value is DealStatus =>
  DEAL_STATUS_VALUES.has(value);

/**
 * Mutate the `where` clause in-place with tag/exclude-tag filters.
 */
export function applyTagFilters(
  where: Prisma.ContactWhereInput,
  criteria: SegmentCriteria,
): void {
  if (criteria.tags && criteria.tags.length > 0) {
    where.tags = { some: { name: { in: criteria.tags } } };
  }
  if (criteria.excludeTags && criteria.excludeTags.length > 0) {
    where.NOT = { tags: { some: { name: { in: criteria.excludeTags } } } };
  }
}

/**
 * Mutate the `where` clause in-place with time-window filters
 * (lastMessageDays / noMessageDays / createdAfter / createdBefore).
 */
export function applyActivityWindowFilters(
  where: Prisma.ContactWhereInput,
  criteria: SegmentCriteria,
  now: Date,
): void {
  const updatedAtFilter: Prisma.DateTimeFilter<'Contact'> = {};
  if (criteria.lastMessageDays) {
    const since = new Date(now);
    since.setDate(since.getDate() - criteria.lastMessageDays);
    updatedAtFilter.gte = since;
  }
  if (criteria.noMessageDays) {
    const before = new Date(now);
    before.setDate(before.getDate() - criteria.noMessageDays);
    updatedAtFilter.lte = before;
  }
  if (updatedAtFilter.gte !== undefined || updatedAtFilter.lte !== undefined) {
    where.updatedAt = updatedAtFilter;
  }

  const createdAtFilter: Prisma.DateTimeFilter<'Contact'> = {};
  if (criteria.createdAfter) {
    createdAtFilter.gte = criteria.createdAfter;
  }
  if (criteria.createdBefore) {
    createdAtFilter.lte = criteria.createdBefore;
  }
  if (createdAtFilter.gte !== undefined || createdAtFilter.lte !== undefined) {
    where.createdAt = createdAtFilter;
  }
}

/**
 * Mutate the `where` clause in-place with pipeline/stage/dealStatus filters.
 */
export function applyPipelineFilters(
  where: Prisma.ContactWhereInput,
  criteria: SegmentCriteria,
): void {
  if (criteria.stageIds && criteria.stageIds.length > 0) {
    where.deals = { some: { stageId: { in: criteria.stageIds } } };
  }
  if (criteria.pipelineIds && criteria.pipelineIds.length > 0) {
    where.deals = {
      some: { stage: { pipelineId: { in: criteria.pipelineIds } } },
    };
  }
  if (criteria.dealStatus) {
    const statusMap: Record<'open' | 'won' | 'lost', string[]> = {
      open: ['OPEN', 'NEGOTIATION'],
      won: ['WON'],
      lost: ['LOST'],
    };
    const validStatuses: DealStatus[] = (statusMap[criteria.dealStatus] || []).filter(
      isDealStatus,
    );
    where.deals = { some: { status: { in: validStatuses } } };
  }
}

/** Engagement score factor: recency of last contact update. */
export function computeRecencyFactor(contact: { updatedAt: Date; createdAt: Date }): number {
  const referenceDate =
    contact.updatedAt instanceof Date
      ? contact.updatedAt
      : contact.createdAt instanceof Date
        ? contact.createdAt
        : new Date();
  const daysSinceUpdate = Math.floor((Date.now() - referenceDate.getTime()) / 86400000);
  return Math.max(0, 30 - daysSinceUpdate);
}

/** Engagement score factor: message frequency in the last 30 days. */
export function computeFrequencyFactor(messages: Array<{ createdAt: Date }>): number {
  const recentMessages = messages.filter((m) => {
    const daysAgo = (Date.now() - m.createdAt.getTime()) / 86400000;
    return daysAgo <= 30;
  });
  return Math.min(25, recentMessages.length * 2);
}

/** Engagement score factor: ratio of inbound to outbound messages. */
export function computeResponseRateFactor(messages: Array<{ direction: string }>): number {
  const outbound = messages.filter((m) => m.direction === 'OUTBOUND').length;
  const inbound = messages.filter((m) => m.direction === 'INBOUND').length;
  const responseRate = outbound > 0 ? inbound / outbound : 0;
  return Math.min(25, responseRate * 25);
}

/** Engagement score factor: total purchase value across WON deals. */
export function computePurchaseValueFactor(
  deals: Array<{ status: string; value: number | null }>,
): number {
  const totalPurchased = deals
    .filter((d) => d.status === 'WON')
    .reduce((sum, d) => sum + (d.value || 0), 0);
  return Math.min(20, totalPurchased / 100);
}

/** Map a numeric engagement score onto a categorical level. */
export function getEngagementLevel(score: number): 'hot' | 'warm' | 'cold' | 'ghost' {
  if (score >= 60) {
    return 'hot';
  }
  if (score >= 35) {
    return 'warm';
  }
  if (score >= 15) {
    return 'cold';
  }
  return 'ghost';
}

/** Filter contacts by purchase-history class (all/none/recent). */
export function filterByPurchaseHistory(
  contacts: SegmentationContact[],
  history: PurchaseHistoryFilter,
): SegmentationContact[] {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  return contacts.filter((c) => {
    const wonDeals = (c.deals ?? []).filter((d) => d.status === DealStatus.WON);

    switch (history) {
      case PURCHASE_HISTORY_ALL_TOKEN:
        return wonDeals.length > 0;
      case 'none':
        return wonDeals.length === 0;
      case 'recent':
        return wonDeals.some((d) => new Date(d.createdAt) >= thirtyDaysAgo);
      default:
        return true;
    }
  });
}

/** Filter contacts by total WON-deal value bounds. */
export function filterByPurchaseValue(
  contacts: SegmentationContact[],
  minValue?: number,
  maxValue?: number,
): SegmentationContact[] {
  return contacts.filter((c) => {
    const totalValue = (c.deals ?? [])
      .filter((d) => d.status === DealStatus.WON)
      .reduce((sum, d) => sum + (d.value || 0), 0);

    if (minValue !== undefined && totalValue < minValue) {
      return false;
    }
    if (maxValue !== undefined && totalValue > maxValue) {
      return false;
    }
    return true;
  });
}

/** Filter contacts by inferred engagement level using days-since-update. */
export function filterByEngagement(
  contacts: SegmentationContact[],
  engagement: 'hot' | 'warm' | 'cold' | 'ghost',
): SegmentationContact[] {
  const now = Date.now();

  return contacts.filter((c) => {
    const lastActivity = c.updatedAt ? new Date(c.updatedAt).getTime() : 0;
    const daysSince = Math.floor((now - lastActivity) / (1000 * 60 * 60 * 24));

    switch (engagement) {
      case 'hot':
        return daysSince <= 3;
      case 'warm':
        return daysSince > 3 && daysSince <= 14;
      case 'cold':
        return daysSince > 14 && daysSince <= 60;
      case 'ghost':
        return daysSince > 60;
      default:
        return true;
    }
  });
}
