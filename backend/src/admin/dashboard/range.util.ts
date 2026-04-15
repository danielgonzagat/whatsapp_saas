/**
 * Period resolver for the God View dashboard.
 *
 * Each operator-facing period (TODAY / 7D / 30D / 90D / 12M / CUSTOM) maps
 * to a canonical [from, to] pair in UTC, plus an optional comparison range
 * (previous-period or year-over-year).
 *
 * Intentional decisions:
 *   - All ranges are UTC. The frontend is responsible for labelling with
 *     America/Sao_Paulo when it renders.
 *   - `to` is the END of the resolved day (23:59:59.999). Queries use
 *     `createdAt <= to` so same-day activity is included.
 *   - TODAY is [today 00:00:00, today 23:59:59.999] — not the last 24h.
 *     That matches Stripe/Hotmart operator mental model.
 *   - 7D / 30D / 90D are "last N days including today", so their previous
 *     period is "the N days before that". 12M is "last 12 months", and its
 *     YoY comparison is "the same 12-month window one year earlier".
 *   - CUSTOM requires both `from` and `to` as inputs; the previous period
 *     is symmetric (same length backward from `from`). YoY subtracts 1y
 *     from both.
 */

export type AdminHomePeriod = 'TODAY' | '7D' | '30D' | '90D' | '12M' | 'CUSTOM';
export type AdminHomeCompare = 'PREVIOUS' | 'YOY' | 'NONE';

export interface ResolvedAdminHomeRange {
  period: AdminHomePeriod;
  compare: AdminHomeCompare;
  from: Date;
  to: Date;
  label: string;
  previous: { from: Date; to: Date } | null;
}

const MS_IN_DAY = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  const out = new Date(d.getTime());
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

function endOfDay(d: Date): Date {
  const out = new Date(d.getTime());
  out.setUTCHours(23, 59, 59, 999);
  return out;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * MS_IN_DAY);
}

function subtractMonths(d: Date, months: number): Date {
  const out = new Date(d.getTime());
  out.setUTCMonth(out.getUTCMonth() - months);
  return out;
}

function previousWindowOf(from: Date, to: Date): { from: Date; to: Date } {
  const spanMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - spanMs);
  return { from: prevFrom, to: prevTo };
}

function yoyWindowOf(from: Date, to: Date): { from: Date; to: Date } {
  const prevFrom = new Date(from.getTime());
  prevFrom.setUTCFullYear(prevFrom.getUTCFullYear() - 1);
  const prevTo = new Date(to.getTime());
  prevTo.setUTCFullYear(prevTo.getUTCFullYear() - 1);
  return { from: prevFrom, to: prevTo };
}

const LABELS: Record<AdminHomePeriod, string> = {
  TODAY: 'Hoje',
  '7D': 'Últimos 7 dias',
  '30D': 'Últimos 30 dias',
  '90D': 'Últimos 90 dias',
  '12M': 'Últimos 12 meses',
  CUSTOM: 'Período personalizado',
};

interface ResolveAdminHomeRangeInput {
  period: AdminHomePeriod;
  compare?: AdminHomeCompare;
  from?: Date;
  to?: Date;
  /** Anchor used to compute "now" — injected for testability. Defaults to `new Date()`. */
  now?: Date;
}

export function resolveAdminHomeRange(input: ResolveAdminHomeRangeInput): ResolvedAdminHomeRange {
  const now = input.now ?? new Date();
  const compare: AdminHomeCompare = input.compare ?? 'PREVIOUS';

  let from: Date;
  let to: Date;

  switch (input.period) {
    case 'TODAY':
      from = startOfDay(now);
      to = endOfDay(now);
      break;
    case '7D':
      from = startOfDay(addDays(now, -6));
      to = endOfDay(now);
      break;
    case '30D':
      from = startOfDay(addDays(now, -29));
      to = endOfDay(now);
      break;
    case '90D':
      from = startOfDay(addDays(now, -89));
      to = endOfDay(now);
      break;
    case '12M':
      from = startOfDay(subtractMonths(now, 12));
      to = endOfDay(now);
      break;
    case 'CUSTOM':
      if (!input.from || !input.to) {
        throw new Error('CUSTOM period requires both `from` and `to`');
      }
      if (input.from.getTime() > input.to.getTime()) {
        throw new Error('CUSTOM period requires `from` <= `to`');
      }
      from = startOfDay(input.from);
      to = endOfDay(input.to);
      break;
    default: {
      const exhaustive: never = input.period;
      throw new Error(`Unhandled period: ${String(exhaustive)}`);
    }
  }

  let previous: { from: Date; to: Date } | null = null;
  if (compare === 'PREVIOUS') previous = previousWindowOf(from, to);
  else if (compare === 'YOY') previous = yoyWindowOf(from, to);

  return { period: input.period, compare, from, to, label: LABELS[input.period], previous };
}
