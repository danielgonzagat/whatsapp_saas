const D_4_____D_2_____D_2_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export type DashboardHomePeriod = 'today' | '7d' | '30d' | '90d' | 'custom';

export interface DashboardHomeBucket {
  label: string;
  start: Date;
  end: Date;
}

export interface DashboardHomeRange {
  period: DashboardHomePeriod;
  start: Date;
  end: Date;
  previousStart: Date;
  previousEnd: Date;
  label: string;
  buckets: DashboardHomeBucket[];
  previousBuckets: DashboardHomeBucket[];
}

export interface DashboardOperationalHealth {
  operationalScorePct: number;
  activeCheckpoints: number;
  totalCheckpoints: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_SEGMENT_COUNT = 8;

function startOfDay(value: Date) {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(value: Date) {
  const next = new Date(value);
  next.setHours(23, 59, 59, 999);
  return next;
}

function addMs(value: Date, amount: number) {
  return new Date(value.getTime() + amount);
}

function addDays(value: Date, amount: number) {
  return addMs(value, amount * DAY_MS);
}

function isValidDate(value: Date | null | undefined): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function parseInputDate(raw: string | undefined, fallback: Date) {
  if (!raw) return fallback;
  const isoDateMatch = raw.trim().match(D_4_____D_2_____D_2_RE);
  if (isoDateMatch) {
    const [, year, month, day] = isoDateMatch;
    return new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);
  }
  const parsed = new Date(raw);
  return isValidDate(parsed) ? parsed : fallback;
}

function formatShortDate(value: Date) {
  return value.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  });
}

function formatWeekday(value: Date) {
  return value.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').slice(0, 3);
}

function buildFixedDailyBuckets(start: Date, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const bucketStart = startOfDay(addDays(start, index));
    const bucketEnd = endOfDay(bucketStart);
    return {
      label: formatWeekday(bucketStart),
      start: bucketStart,
      end: bucketEnd,
    };
  });
}

function buildHourlyBuckets(start: Date, hourSteps: number[]) {
  return hourSteps.map((hour, index) => {
    const bucketStart = new Date(start);
    bucketStart.setHours(hour, 0, 0, 0);
    const nextHour = hourSteps[index + 1];
    const bucketEnd =
      typeof nextHour === 'number'
        ? new Date(new Date(start).setHours(nextHour, 0, 0, 0) - 1)
        : endOfDay(start);

    return {
      label: `${String(hour).padStart(2, '0')}h`,
      start: bucketStart,
      end: bucketEnd,
    };
  });
}

function buildSegmentedBuckets(start: Date, end: Date, count: number) {
  const totalMs = Math.max(end.getTime() - start.getTime(), 1);
  return Array.from({ length: count }, (_, index) => {
    const bucketStart = addMs(start, Math.floor((totalMs * index) / count));
    const bucketEnd =
      index === count - 1 ? end : addMs(start, Math.floor((totalMs * (index + 1)) / count) - 1);

    return {
      label: formatShortDate(bucketStart),
      start: bucketStart,
      end: bucketEnd,
    };
  });
}

function buildBucketsForRange(period: DashboardHomePeriod, start: Date, end: Date) {
  switch (period) {
    case 'today':
      return buildHourlyBuckets(start, [0, 4, 8, 12, 16, 20]);
    case '7d':
      return buildFixedDailyBuckets(start, 7);
    case '30d':
      return buildSegmentedBuckets(start, end, 6);
    case '90d':
      return buildSegmentedBuckets(start, end, 8);
    case 'custom': {
      const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / DAY_MS));
      const segmentCount = Math.min(10, Math.max(2, Math.ceil(totalDays / 4)));
      return buildSegmentedBuckets(start, end, segmentCount);
    }
    default:
      return buildSegmentedBuckets(start, end, DEFAULT_SEGMENT_COUNT);
  }
}

function buildLabel(period: DashboardHomePeriod, start: Date, end: Date) {
  switch (period) {
    case 'today':
      return 'Hoje';
    case '7d':
      return 'Últimos 7 dias';
    case '30d':
      return 'Últimos 30 dias';
    case '90d':
      return 'Últimos 90 dias';
    case 'custom':
      return `${formatShortDate(start)} até ${formatShortDate(end)}`;
    default:
      return 'Último período';
  }
}

export function resolveDashboardHomeRange(input?: {
  period?: string;
  startDate?: string;
  endDate?: string;
  now?: Date;
}): DashboardHomeRange {
  const now = isValidDate(input?.now) ? input.now : new Date();
  const requestedPeriod = String(input?.period || '30d').toLowerCase();
  const period: DashboardHomePeriod =
    requestedPeriod === 'today' ||
    requestedPeriod === '7d' ||
    requestedPeriod === '30d' ||
    requestedPeriod === '90d' ||
    requestedPeriod === 'custom'
      ? requestedPeriod
      : '30d';

  let start: Date;
  let end: Date;

  switch (period) {
    case 'today':
      start = startOfDay(now);
      end = now;
      break;
    case '7d':
      start = startOfDay(addDays(now, -29));
      end = now;
      break;
    case '30d':
      start = startOfDay(addDays(now, -29));
      end = now;
      break;
    case '90d':
      start = startOfDay(addDays(now, -89));
      end = now;
      break;
    case 'custom': {
      const fallbackStart = startOfDay(addDays(now, -29));
      const fallbackEnd = now;
      const parsedStart = parseInputDate(input?.startDate, fallbackStart);
      const parsedEnd = parseInputDate(input?.endDate, fallbackEnd);
      start = startOfDay(parsedStart <= parsedEnd ? parsedStart : parsedEnd);
      end = endOfDay(parsedStart <= parsedEnd ? parsedEnd : parsedStart);
      break;
    }
    default:
      start = startOfDay(addDays(now, -6));
      end = now;
      break;
  }

  const durationMs = Math.max(end.getTime() - start.getTime(), HOUR_MS);
  const previousEnd = addMs(start, -1);
  const previousStart = addMs(previousEnd, -durationMs);

  return {
    period,
    start,
    end,
    previousStart,
    previousEnd,
    label: buildLabel(period, start, end),
    buckets: buildBucketsForRange(period, start, end),
    previousBuckets: buildBucketsForRange(period, previousStart, previousEnd),
  };
}

export function sumByBuckets<T>(
  rows: T[],
  buckets: DashboardHomeBucket[],
  getDate: (row: T) => Date | null | undefined,
  getValue: (row: T) => number,
) {
  const result = buckets.map(() => 0);

  rows.forEach((row) => {
    const date = getDate(row);
    if (!isValidDate(date)) return;
    const value = Number(getValue(row) || 0);
    const bucketIndex = buckets.findIndex(
      (bucket) =>
        date.getTime() >= bucket.start.getTime() && date.getTime() <= bucket.end.getTime(),
    );
    if (bucketIndex >= 0) {
      result[bucketIndex] += value;
    }
  });

  return result;
}

export function countByBuckets<T>(
  rows: T[],
  buckets: DashboardHomeBucket[],
  getDate: (row: T) => Date | null | undefined,
) {
  return sumByBuckets(rows, buckets, getDate, () => 1);
}

type ResponseTimeRow = {
  conversationId?: string | null;
  direction?: string | null;
  createdAt?: Date | null;
};

type NormalizedResponseTimeRow = {
  conversationId: string;
  direction: 'INBOUND' | 'OUTBOUND' | 'OTHER';
  createdAt: Date;
};

function normalizeResponseTimeRow(row: ResponseTimeRow): NormalizedResponseTimeRow | null {
  const conversationId = String(row.conversationId || '').trim();
  const createdAt = row.createdAt;
  if (!conversationId || !isValidDate(createdAt)) return null;

  const rawDirection = String(row.direction || '').toUpperCase();
  const direction: NormalizedResponseTimeRow['direction'] =
    rawDirection === 'INBOUND' || rawDirection === 'OUTBOUND' ? rawDirection : 'OTHER';

  return { conversationId, direction, createdAt };
}

function measureOutboundResponseWindow(
  pendingInbound: Map<string, Date>,
  conversationId: string,
  outboundAt: Date,
): number | null {
  const inboundAt = pendingInbound.get(conversationId);
  if (!inboundAt) return null;

  pendingInbound.delete(conversationId);
  const diffMs = outboundAt.getTime() - inboundAt.getTime();
  if (diffMs < 0 || diffMs > 7 * DAY_MS) return null;
  return diffMs;
}

export function computeAverageResponseTimeSeconds(rows: ResponseTimeRow[]) {
  const pendingInbound = new Map<string, Date>();
  let diffMsTotal = 0;
  let pairs = 0;

  for (const rawRow of rows) {
    const row = normalizeResponseTimeRow(rawRow);
    if (!row) continue;

    if (row.direction === 'INBOUND') {
      pendingInbound.set(row.conversationId, row.createdAt);
      continue;
    }

    if (row.direction !== 'OUTBOUND') continue;

    const diffMs = measureOutboundResponseWindow(pendingInbound, row.conversationId, row.createdAt);
    if (diffMs === null) continue;

    diffMsTotal += diffMs;
    pairs += 1;
  }

  return pairs > 0 ? Math.round(diffMsTotal / pairs / 1000) : 0;
}

export function computeOperationalHealth(checkpoints: boolean[]): DashboardOperationalHealth {
  const totalCheckpoints = checkpoints.length;
  const activeCheckpoints = checkpoints.filter(Boolean).length;
  const operationalScorePct =
    totalCheckpoints > 0 ? Math.round((activeCheckpoints / totalCheckpoints) * 100) : 0;

  return {
    operationalScorePct,
    activeCheckpoints,
    totalCheckpoints,
  };
}
