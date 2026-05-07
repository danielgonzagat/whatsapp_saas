/**
 * Period resolver for the God View dashboard.
 *
 * Each operator-facing period (TODAY / 30D / CUSTOM) maps
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
 *   - 30D is "last 30 days including today", so the previous period is
 *     "the 30 days before that".
 *   - CUSTOM requires both `from` and `to` as inputs; the previous period
 *     is symmetric (same length backward from `from`). YoY subtracts 1y
 *     from both.
 */

export type AdminHomePeriod = 'TODAY' | '30D' | 'CUSTOM';
/** Admin home compare type. */
export type AdminHomeCompare = 'PREVIOUS' | 'YOY' | 'NONE';

/** Resolved admin home range shape. */
export interface ResolvedAdminHomeRange {
  /** Period property. */
  period: AdminHomePeriod;
  /** Compare property. */
  compare: AdminHomeCompare;
  /** From property. */
  from: Date;
  /** To property. */
  to: Date;
  /** Label property. */
  label: string;
  /** Previous property. */
  previous: { from: Date; to: Date } | null;
}

const MS_IN_DAY = 24 * 60 * 60 * 1000;

// PULSE_OK: all new Date() calls are arithmetic on Date objects (getTime + offset) or cloning — no string parsing

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
  '30D': 'Últimos 30 dias',
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

function resolveCustomRange(
  inputFrom: Date | undefined,
  inputTo: Date | undefined,
): { from: Date; to: Date } {
  if (!inputFrom || !inputTo) {
    throw new Error('CUSTOM period requires both `from` and `to`');
  }
  if (inputFrom.getTime() > inputTo.getTime()) {
    throw new Error('CUSTOM period requires `from` <= `to`');
  }
  return { from: startOfDay(inputFrom), to: endOfDay(inputTo) };
}

function resolvePeriodRange(
  input: ResolveAdminHomeRangeInput,
  now: Date,
): { from: Date; to: Date } {
  switch (input.period) {
    case 'TODAY':
      return { from: startOfDay(now), to: endOfDay(now) };
    case '30D':
      return { from: startOfDay(addDays(now, -29)), to: endOfDay(now) };
    case 'CUSTOM':
      return resolveCustomRange(input.from, input.to);
    default: {
      const exhaustive: never = input.period;
      throw new Error(`Unhandled period: ${String(exhaustive)}`);
    }
  }
}

function resolveComparisonWindow(
  compare: AdminHomeCompare,
  from: Date,
  to: Date,
): { from: Date; to: Date } | null {
  if (compare === 'PREVIOUS') {
    return previousWindowOf(from, to);
  }
  if (compare === 'YOY') {
    return yoyWindowOf(from, to);
  }
  return null;
}

/** Resolve admin home range. */
export function resolveAdminHomeRange(input: ResolveAdminHomeRangeInput): ResolvedAdminHomeRange {
  const now = input.now ?? new Date();
  const compare: AdminHomeCompare = input.compare ?? 'PREVIOUS';

  const { from, to } = resolvePeriodRange(input, now);
  const previous = resolveComparisonWindow(compare, from, to);

  return { period: input.period, compare, from, to, label: LABELS[input.period], previous };
}
