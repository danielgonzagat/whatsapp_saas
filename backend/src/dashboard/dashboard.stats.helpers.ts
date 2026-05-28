/**
 * Pure helpers extracted from {@link ../dashboard/dashboard.service.ts}'s
 * `getStats()` flow. These helpers keep the dashboard service thin and let
 * the numeric/aggregation logic be unit-tested without booting Nest / Redis /
 * Prisma. Every helper is deterministic and side-effect free.
 *
 * Wave 115 (Claude-w115) — `refactor(dashboard): extract dashboard.service helpers`.
 */

/**
 * A single row from a Prisma `.groupBy({ by: ['status'], _count: { status } })`
 * call. The dashboard `getStats` flow uses this shape twice — once for
 * outbound messages and once for today's flow executions.
 */
export interface StatusGroupRow {
  status: string;
  _count: { status: number };
}

/**
 * Collapse a Prisma `groupBy` result into a plain `status → count` map.
 * Used by both the message and flow-execution branches of `getStats`. Returns
 * a fresh object — callers may mutate the result without affecting the input.
 */
export function aggregateStatusCounts(rows: StatusGroupRow[]): Record<string, number> {
  return rows.reduce(
    (acc, curr) => {
      acc[curr.status] = curr._count.status;
      return acc;
    },
    {} as Record<string, number>,
  );
}

/** Outbound message rate bundle returned by {@link computeOutboundMessageRates}. */
export interface OutboundMessageRates {
  /** Sum of SENT + DELIVERED + READ + FAILED. */
  totalOutbound: number;
  /** `(DELIVERED + READ) / total * 100`, rounded to 1 decimal. */
  deliveryRatePct: number;
  /** `READ / (DELIVERED + READ) * 100`, rounded to 1 decimal. */
  readRatePct: number;
  /** `FAILED / total * 100`, rounded to 1 decimal. */
  errorRatePct: number;
}

/**
 * Compute the outbound delivery / read / error rates from an aggregated
 * `status → count` map. Mirrors the contract of `dashboard.service.spec.ts`:
 * - All rates are 0 when no outbound message exists.
 * - `readRatePct` is 0 when neither DELIVERED nor READ exists (avoids the
 *   divide-by-zero that would otherwise mask the "no engagement yet" state).
 * - Rates are rounded to 1 decimal place via `Number(x.toFixed(1))` so the
 *   payload stays JSON-stable.
 */
export function computeOutboundMessageRates(
  statsMap: Record<string, number>,
): OutboundMessageRates {
  const sent = statsMap.SENT || 0;
  const delivered = statsMap.DELIVERED || 0;
  const read = statsMap.READ || 0;
  const failed = statsMap.FAILED || 0;
  const totalOutbound = sent + delivered + read + failed;
  if (totalOutbound === 0) {
    return { totalOutbound: 0, deliveryRatePct: 0, readRatePct: 0, errorRatePct: 0 };
  }
  const deliveredOrRead = delivered + read;
  const deliveryRatePct = Number((((delivered + read) / totalOutbound) * 100).toFixed(1));
  const readRatePct =
    deliveredOrRead > 0 ? Number(((read / deliveredOrRead) * 100).toFixed(1)) : 0;
  const errorRatePct = Number(((failed / totalOutbound) * 100).toFixed(1));
  return { totalOutbound, deliveryRatePct, readRatePct, errorRatePct };
}

/** Operational metrics summary derived from the Redis event log. */
export interface OperationalMetricsSummary {
  /** Percentage of events that reported success (`ok === '1'`), 0-100. */
  healthScore: number;
  /** Mean latency across all events, rounded to the nearest whole number. */
  avgLatencyMs: number;
}

/**
 * Parse the Redis `metrics:<workspaceId>` list into a summary. Each event is
 * a string of the form `"<ok>:<latencyMs>"` where `<ok>` is `'1'` for success
 * and any other value for failure. Latency is summed numerically and averaged.
 *
 * Contract (asserted by `dashboard.service.spec.ts`):
 * - Empty input → `healthScore = 100`, `avgLatencyMs = 0` (treated as "no
 *   data yet, assume healthy" so a fresh workspace doesn't render a red dot).
 * - Malformed entries silently contribute latency 0 and are counted as
 *   failures — keeps the dashboard rendering when a producer is buggy.
 */
export function summarizeOperationalMetrics(events: string[]): OperationalMetricsSummary {
  if (events.length === 0) {
    return { healthScore: 100, avgLatencyMs: 0 };
  }
  let success = 0;
  let totalLatency = 0;
  for (const event of events) {
    const [ok, lat] = event.split(':');
    if (ok === '1') {
      success += 1;
    }
    const parsedLat = Number(lat || 0);
    totalLatency += Number.isFinite(parsedLat) ? parsedLat : 0;
  }
  return {
    healthScore: Math.round((success / events.length) * 100),
    avgLatencyMs: Math.round(totalLatency / events.length),
  };
}
