/**
 * Pure helpers extracted from `analytics.service.ts`.
 *
 * Every export here is side-effect free: no Prisma, no `this`, no IO, no
 * logger. Each function takes plain input and returns plain output, which
 * makes them trivially unit-testable and lets the service file stay focused
 * on data fetching + orchestration.
 */

const HOUR_SECONDS = 3600;
const SCORE_HIGH_THRESHOLD = 70;
const SCORE_MEDIUM_THRESHOLD = 30;

/** Daily inbound/outbound message bucket keyed by `YYYY-MM-DD`. */
export interface DailyActivityBucket {
  inbound: number;
  outbound: number;
}

/** Sentiment aggregation produced by `processSentimentStats`. */
export interface SentimentStats {
  positive: number;
  negative: number;
  neutral: number;
}

/** Lead-score bucket counts produced by `processLeadScoreStats`. */
export interface LeadScoreStats {
  high: number;
  medium: number;
  low: number;
}

/** Delivery-rate envelope produced by `processOutboundDeliveryStats`. */
export interface OutboundDeliveryStats {
  deliveryRate: number;
  readRate: number;
  errorRate: number;
}

/** Flow-execution status summary produced by `processFlowExecutionStats`. */
export interface FlowExecutionStats {
  flows: number;
  flowCompleted: number;
  flowFailed: number;
  flowRunning: number;
}

/**
 * Convert a `groupBy({ by: ['sentiment'] })` rowset into a stable
 * positive/negative/neutral envelope. POSITIVE and NEGATIVE map straight; any
 * other label (including null, NEUTRAL, unknown future labels) accumulates
 * into `neutral` so callers never see undefined buckets.
 */
export function processSentimentStats(
  rows: ReadonlyArray<{ sentiment?: string | null; _count: { sentiment: number } }>,
): SentimentStats {
  const stats: SentimentStats = { positive: 0, negative: 0, neutral: 0 };
  rows.forEach((row) => {
    const count = row._count.sentiment;
    if (row.sentiment === 'POSITIVE') {
      stats.positive = count;
    } else if (row.sentiment === 'NEGATIVE') {
      stats.negative = count;
    } else {
      stats.neutral += count;
    }
  });
  return stats;
}

/**
 * Bucket lead scores into high/medium/low. Thresholds match the
 * legacy inline logic exactly so dashboards keep historical comparability.
 */
export function processLeadScoreStats(rows: ReadonlyArray<{ leadScore: number }>): LeadScoreStats {
  const stats: LeadScoreStats = { high: 0, medium: 0, low: 0 };
  rows.forEach((row) => {
    if (row.leadScore > SCORE_HIGH_THRESHOLD) {
      stats.high += 1;
    } else if (row.leadScore > SCORE_MEDIUM_THRESHOLD) {
      stats.medium += 1;
    } else {
      stats.low += 1;
    }
  });
  return stats;
}

/**
 * Convert a `groupBy({ by: ['status'] })` rowset (outbound messages) into a
 * key-uppercased map. UNKNOWN absorbs nullish statuses so callers always
 * read from a stable namespace.
 */
export function buildOutboundStatusMap(
  rows: ReadonlyArray<{ status?: string | null; _count: { status: number } }>,
): Record<string, number> {
  const statusMap: Record<string, number> = {};
  rows.forEach((row) => {
    const key = (row.status || 'UNKNOWN').toUpperCase();
    statusMap[key] = row._count.status;
  });
  return statusMap;
}

/**
 * Compute delivery/read/error rates (0-100, integer %) from an outbound
 * status map. SENT counts as delivered to avoid zeroed dashboards in
 * environments without provider read-receipts (existing product contract).
 */
export function processOutboundDeliveryStats(
  statusMap: Readonly<Record<string, number>>,
): OutboundDeliveryStats {
  const delivered = (statusMap.DELIVERED || 0) + (statusMap.SENT || 0);
  const read = statusMap.READ || 0;
  const failed = statusMap.FAILED || 0;
  const totalOutbound = Object.values(statusMap).reduce((acc, value) => acc + value, 0);
  const toPct = (value: number) =>
    totalOutbound > 0 ? Math.round((value / totalOutbound) * 100) : 0;
  return {
    deliveryRate: toPct(delivered),
    readRate: toPct(read),
    errorRate: toPct(failed),
  };
}

/**
 * Summarize a `flowExecution.groupBy({ by: ['status'] })` rowset into a flat
 * `{ flows, flowCompleted, flowFailed, flowRunning }` envelope. Unknown
 * statuses count toward total but do not get a dedicated field — matches
 * the legacy dashboard contract.
 */
export function processFlowExecutionStats(
  rows: ReadonlyArray<{ status?: string | null; _count: { status: number } }>,
): FlowExecutionStats {
  const statusMap: Record<string, number> = {};
  rows.forEach((row) => {
    statusMap[row.status || 'UNKNOWN'] = row._count.status;
  });
  const total = Object.values(statusMap).reduce((acc, value) => acc + value, 0);
  return {
    flows: total,
    flowCompleted: statusMap.COMPLETED || 0,
    flowFailed: statusMap.FAILED || 0,
    flowRunning: statusMap.RUNNING || 0,
  };
}

/**
 * Initialize a rolling 7-day activity map (`YYYY-MM-DD` → zeroed bucket),
 * relative to the supplied reference `now`. Keys are written in
 * `today, today-1, …, today-6` order — callers should `.sort()` before
 * presenting if chronological order matters.
 */
export function initializeDailyActivityMap(
  now: Date = new Date(),
): Record<string, DailyActivityBucket> {
  const activity: Record<string, DailyActivityBucket> = {};
  for (let i = 0; i < 7; i += 1) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const key = date.toISOString().slice(0, 10);
    activity[key] = { inbound: 0, outbound: 0 };
  }
  return activity;
}

/**
 * Increment inbound/outbound counters in `activity` for each message,
 * keyed by the `YYYY-MM-DD` portion of `createdAt`. Messages whose date is
 * outside the pre-seeded window are ignored (caller decides the window via
 * `initializeDailyActivityMap`).
 */
export function aggregateMessagesByDay(
  messages: ReadonlyArray<{ createdAt: Date; direction: string }>,
  activity: Record<string, DailyActivityBucket>,
): void {
  messages.forEach((message) => {
    const key = message.createdAt.toISOString().split('T')[0];
    if (!key) {
      return;
    }
    const bucket = activity[key];
    if (!bucket) {
      return;
    }
    if (message.direction === 'INBOUND') {
      bucket.inbound += 1;
    } else {
      bucket.outbound += 1;
    }
  });
}

/**
 * Convert an activity map into a chronologically-sorted array suitable for
 * the dashboard charting layer. Pure transform — no clock dependency.
 */
export function flattenDailyActivity(
  activity: Readonly<Record<string, DailyActivityBucket>>,
): Array<{ date: string; inbound: number; outbound: number }> {
  return Object.entries(activity)
    .map(([date, counts]) => ({ date, inbound: counts.inbound, outbound: counts.outbound }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

interface FlowExecutionLogEntry {
  nodeId?: unknown;
  [key: string]: unknown;
}

interface FlowExecutionRecord {
  status: string | null;
  logs: unknown;
}

/**
 * Count, per node id, how many executions visited that node at least once.
 * `logs` may be any Prisma JSON value — non-array values are skipped and
 * non-string/non-number `nodeId` entries are ignored to stay defensive
 * against historic schema drift.
 */
export function aggregateNodeVisits(
  executions: ReadonlyArray<{ logs: unknown }>,
): Record<string, number> {
  const nodeVisits: Record<string, number> = {};
  executions.forEach((exec) => {
    if (!Array.isArray(exec.logs)) {
      return;
    }
    const logs = exec.logs as FlowExecutionLogEntry[];
    const visited = new Set<string>();
    logs.forEach((log) => {
      if (typeof log.nodeId === 'string') {
        visited.add(log.nodeId);
        return;
      }
      if (typeof log.nodeId === 'number') {
        visited.add(String(log.nodeId));
      }
    });
    visited.forEach((nodeId) => {
      nodeVisits[nodeId] = (nodeVisits[nodeId] || 0) + 1;
    });
  });
  return nodeVisits;
}

/**
 * Drop-off summary: total / completed / failed / conversion-rate + per-node
 * visit counts. Conversion rate is `completed / total * 100` (matches the
 * legacy contract — caller decides if it wants to round).
 */
export function summarizeFlowExecutions(executions: ReadonlyArray<FlowExecutionRecord>): {
  total: number;
  completed: number;
  failed: number;
  conversionRate: number;
  nodeVisits: Record<string, number>;
} {
  const total = executions.length;
  const completed = executions.filter((e) => e.status === 'COMPLETED').length;
  const failed = executions.filter((e) => e.status === 'FAILED').length;
  return {
    total,
    completed,
    failed,
    conversionRate: total > 0 ? (completed / total) * 100 : 0,
    nodeVisits: aggregateNodeVisits(executions),
  };
}

/**
 * Mean interval (seconds, rounded to one decimal) between consecutive
 * outbound messages, after pruning intervals that are not 0 < delta < 1h
 * (the same heuristic the legacy report used to discard chat-session
 * boundaries). Returns `null` when fewer than two messages exist or when no
 * intervals survive the filter.
 */
export function computeAvgResponseTimeSeconds(
  messages: ReadonlyArray<{ createdAt: Date }>,
): number | null {
  if (messages.length < 2) {
    return null;
  }
  const sortedTimestamps = messages.map((m) => m.createdAt.getTime()).sort((a, b) => a - b);
  const intervals: number[] = [];
  for (let i = 1; i < sortedTimestamps.length; i += 1) {
    const curr = sortedTimestamps[i];
    const prev = sortedTimestamps[i - 1];
    if (curr === undefined || prev === undefined) {
      continue;
    }
    const deltaSeconds = (curr - prev) / 1000;
    if (deltaSeconds > 0 && deltaSeconds < HOUR_SECONDS) {
      intervals.push(deltaSeconds);
    }
  }
  if (intervals.length === 0) {
    return null;
  }
  const sum = intervals.reduce((acc, value) => acc + value, 0);
  return Math.round((sum / intervals.length) * 10) / 10;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Bucket dated `amount` rows into a fixed-size daily array of length `days`,
 * indexed so that `result[days - 1]` is the most recent day. Rows outside
 * the window are silently dropped — matches legacy behaviour.
 */
export function groupSalesByDay(
  sales: ReadonlyArray<{ createdAt: Date | string; amount: number }>,
  days: number,
  now: number = Date.now(),
): number[] {
  const result = new Array<number>(days).fill(0);
  sales.forEach((sale) => {
    const createdMs = new Date(sale.createdAt).getTime();
    const daysAgo = Math.floor((now - createdMs) / DAY_MS);
    const idx = days - 1 - daysAgo;
    if (idx >= 0 && idx < days) {
      result[idx] = (result[idx] ?? 0) + sale.amount;
    }
  });
  return result;
}
