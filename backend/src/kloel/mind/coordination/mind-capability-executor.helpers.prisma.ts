/**
 * Prisma-derivation helpers extracted from `mind-capability-executor.service.ts`.
 * Pure, side-effect-free filter/clause builders and aggregate projections used
 * by the capability executor's read-only queries (revenue summary, product
 * search, contact search, conversation status).
 */
import { readOptionalNum } from './mind-capability-executor.helpers.cognitive';

/**
 * Inputs to the revenue-summary helper — already-aggregated Prisma values.
 * Keeping the math here ensures the rounding contract (whole cents,
 * conversion rounded to two decimals) is unit-testable without Prisma.
 */
export interface RevenueSummaryInput {
  readonly sumTotalInCents: number | null;
  readonly avgTotalInCents: number | null;
  readonly totalCount: number;
  readonly paidCount: number;
  readonly periodDays: number;
}

/** Canonical revenue summary surfaced by `query_revenue_summary`. */
export interface RevenueSummary {
  readonly totalRevenue: number;
  readonly ticketMedio: number;
  readonly totalCount: number;
  readonly paidCount: number;
  readonly conversao: number;
  readonly periodDays: number;
}

/**
 * Derive the canonical revenue summary from raw Prisma aggregate counts.
 * `ticketMedio` is rounded to a whole cent; `conversao` is the paid/total
 * ratio expressed as a percentage with two decimals, or `0` when there
 * are no orders. Both totals fall back to `0` when Prisma returns `null`.
 */
export function computeRevenueSummary(input: RevenueSummaryInput): RevenueSummary {
  const totalRevenue = input.sumTotalInCents ?? 0;
  const ticketMedio = Math.round(input.avgTotalInCents ?? 0);
  const conversao =
    input.totalCount > 0 ? Math.round((input.paidCount / input.totalCount) * 10000) / 100 : 0;
  return {
    totalRevenue,
    ticketMedio,
    totalCount: input.totalCount,
    paidCount: input.paidCount,
    conversao,
    periodDays: input.periodDays,
  };
}

/**
 * Build the `[startDate, days]` window used by `query_revenue_summary`.
 * The number of days is clamped to `[1, 365]` and the start date is
 * normalised to midnight local time. Returns both the clamped days
 * value and the resolved start `Date` so callers can reuse them for
 * Prisma filters and the response shape.
 */
export function buildRevenueWindow(
  rawDays: unknown,
  defaultDays = 30,
  maxDays = 365,
  now: Date = new Date(),
): { days: number; start: Date } {
  const days = Math.min(readOptionalNum(rawDays, defaultDays), maxDays);
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);
  return { days, start };
}

/**
 * Optional case-insensitive `name`-contains clause for product listings.
 * Returns `undefined` when no usable search term is supplied so callers
 * can spread the result into a Prisma `where` without polluting it with
 * empty filters.
 */
export function buildProductSearchClause(
  search: string | undefined,
): { name: { contains: string; mode: 'insensitive' } } | undefined {
  if (!search) {
    return undefined;
  }
  return { name: { contains: search, mode: 'insensitive' } };
}

/**
 * Build the OR clause used by `search_contact`. Matches name and email
 * case-insensitively and phone case-sensitively (phones never have
 * casing). The shape mirrors the inline Prisma filter so the service
 * can keep its `select` and `orderBy` clauses unchanged.
 */
export function buildContactSearchOr(query: string): Array<Record<string, unknown>> {
  return [
    { name: { contains: query, mode: 'insensitive' } },
    { phone: { contains: query } },
    { email: { contains: query, mode: 'insensitive' } },
  ];
}

/**
 * Translate the `status` argument accepted by `list_conversations` into
 * the matching Prisma `status` filter. `'open'` excludes closed
 * conversations; `'closed'` matches only closed; anything else (the
 * default `'all'`) returns an empty fragment so the service spreads it
 * harmlessly.
 */
export function buildConversationStatusFilter(
  statusFilter: string | undefined,
): { status: { not: 'closed' } } | { status: 'closed' } | Record<string, never> {
  if (statusFilter === 'open') {
    return { status: { not: 'closed' } };
  }
  if (statusFilter === 'closed') {
    return { status: 'closed' };
  }
  return {};
}
