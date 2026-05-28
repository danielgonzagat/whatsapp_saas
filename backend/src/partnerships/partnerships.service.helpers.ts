/**
 * Pure helpers extracted from PartnershipsService.
 *
 * These functions hold the DTO-building, where-clause-building, and statistics
 * aggregation logic that previously lived inline in the service. Keeping them
 * here lets us unit-test the rules directly without spinning up Nest's DI
 * graph or stubbing Prisma. The service stays thin and delegates to these
 * helpers; behaviour is preserved verbatim.
 */

import { OrderStatus } from '@prisma/client';

export interface CreatePartnerInputDto {
  partnerName: string;
  partnerEmail: string;
  partnerPhone?: string;
  type: string;
  commissionRate?: number;
  productIds?: string[];
}

export interface NormalizedCreatePartnerInput {
  partnerName: string;
  partnerEmail: string;
  partnerType: string;
}

/**
 * Normalizes the free-form fields of the create-partner DTO.
 *
 * Trims the partner name, lowercases the email, and uppercases the partner
 * type code. Coerces `null`/`undefined` to the empty string so downstream
 * conflict checks can compare against existing partners safely.
 */
export function normalizeCreatePartnerInput(
  data: CreatePartnerInputDto,
): NormalizedCreatePartnerInput {
  return {
    partnerName: String(data.partnerName || '').trim(),
    partnerEmail: String(data.partnerEmail || '')
      .trim()
      .toLowerCase(),
    partnerType: String(data.type || '')
      .trim()
      .toUpperCase(),
  };
}

export interface ListAffiliatesParams {
  type?: string;
  status?: string;
  search?: string;
}

/**
 * Builds the Prisma `where` clause for the affiliate listing query.
 *
 * Mirrors the previous in-service behaviour:
 *   * the `workspaceId` is always present.
 *   * `type === 'todos'` is treated as "no type filter".
 *   * Both `type` and `status` are trimmed and uppercased.
 *   * `search` becomes a case-insensitive `contains` filter on `partnerName`.
 */
export function buildListAffiliatesWhere(
  workspaceId: string,
  params?: ListAffiliatesParams,
): Record<string, unknown> {
  const where: Record<string, unknown> = { workspaceId };
  if (params?.type && params.type !== 'todos') {
    where.type = params.type.trim().toUpperCase();
  }
  if (params?.status) {
    where.status = params.status.trim().toUpperCase();
  }
  if (params?.search) {
    where.partnerName = { contains: params.search, mode: 'insensitive' };
  }
  return where;
}

export interface AffiliateStatsPartner {
  type: string;
  status: string;
  totalRevenue: number;
  totalCommission: number;
  partnerName: string;
}

export interface AffiliateStatsResult {
  activeAffiliates: number;
  producers: number;
  totalRevenue: number;
  totalCommissions: number;
  topPartner: { name: string; revenue: number } | null;
}

/**
 * Aggregates the affiliate-stats payload from a flat list of partners.
 *
 * `activeAffiliates` and `producers` use the canonical uppercase type/status
 * codes. Revenue totals only consider AFFILIATE partners; commission totals
 * sum across all partner types. The top partner is the one with the highest
 * revenue regardless of type, matching the previous service behaviour.
 */
export function computeAffiliateStats(
  partners: ReadonlyArray<AffiliateStatsPartner>,
): AffiliateStatsResult {
  const activeAffiliates = partners.filter(
    (p) => p.type === 'AFFILIATE' && p.status === 'ACTIVE',
  ).length;
  const producers = partners.filter((p) => p.type === 'PRODUCER').length;
  const totalRevenue = partners
    .filter((p) => p.type === 'AFFILIATE')
    .reduce((s, p) => s + p.totalRevenue, 0);
  const totalCommissions = partners.reduce((s, p) => s + p.totalCommission, 0);
  const top = [...partners].sort((a, b) => b.totalRevenue - a.totalRevenue)[0];
  return {
    activeAffiliates,
    producers,
    totalRevenue,
    totalCommissions,
    topPartner: top ? { name: top.partnerName, revenue: top.totalRevenue } : null,
  };
}

export interface AttributedOrderPartner {
  affiliateCode: string | null;
  partnerWorkspaceId: string | null;
}

/**
 * Builds the OR-list of Prisma filters used to find checkout orders
 * attributed to a partner.
 *
 * Returns an empty array when the partner has neither an `affiliateCode` nor
 * a `partnerWorkspaceId` — caller should short-circuit the query in that
 * case to avoid scanning all orders for the workspace.
 */
export function buildAttributedOrderFilters(
  partner: AttributedOrderPartner,
): Record<string, unknown>[] {
  const filters: Record<string, unknown>[] = [];
  if (partner.affiliateCode) {
    filters.push({
      metadata: { path: ['affiliateCode'], equals: partner.affiliateCode },
    });
  }
  if (partner.partnerWorkspaceId) {
    filters.push({ affiliateId: partner.partnerWorkspaceId });
    filters.push({
      metadata: { path: ['affiliateWorkspaceId'], equals: partner.partnerWorkspaceId },
    });
  }
  return filters;
}

/**
 * Canonical list of order statuses considered "attributed" for partner
 * performance reporting. Mirrors the inline list previously kept in the
 * service.
 */
export const ATTRIBUTED_ORDER_STATUSES = [
  OrderStatus.PAID,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
] as const;

export interface AttributedOrderSlice {
  createdAt: Date | null;
  paidAt: Date | null;
}

/**
 * Buckets attributed orders into a 12-element monthly array indexed by UTC
 * month (Jan = 0). Each entry counts how many orders fell in that month
 * using the paid-at date when available, otherwise the created-at date.
 *
 * Orders without a valid date are silently skipped, matching the previous
 * service behaviour. Returns a fresh array each call.
 */
export function aggregateMonthlyPerformance(
  orders: ReadonlyArray<AttributedOrderSlice>,
): number[] {
  const monthlyPerformance = new Array<number>(12).fill(0);
  for (const order of orders) {
    const saleDate = order.paidAt ?? order.createdAt;
    if (saleDate instanceof Date) {
      const idx = saleDate.getUTCMonth();
      monthlyPerformance[idx] = (monthlyPerformance[idx] ?? 0) + 1;
    }
  }
  return monthlyPerformance;
}

/**
 * Extracts the ISO-string timestamp of the latest attributed order, falling
 * back to `createdAt` when `paidAt` is null. Returns `undefined` when no
 * usable timestamp is present so callers can omit the field from the
 * response payload.
 */
export function extractLastSaleAt(
  order: AttributedOrderSlice | null | undefined,
): string | undefined {
  if (!order) {
    return undefined;
  }
  const ts = order.paidAt ?? order.createdAt;
  if (!ts) {
    return undefined;
  }
  return ts.toISOString();
}

/**
 * Returns the UTC `Date` for January 1st of the current year — matches the
 * previous in-service window used to scope the partner-performance query.
 */
export function getCurrentYearStartUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
}

/**
 * Default commission rate (percentage points) applied when the create-partner
 * DTO omits an explicit value. Mirrors the previous in-service literal.
 */
export const DEFAULT_PARTNER_COMMISSION_RATE = 30;
