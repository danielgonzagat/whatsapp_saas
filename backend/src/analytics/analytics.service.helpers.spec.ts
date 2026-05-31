import {
  aggregateMessagesByDay,
  aggregateNodeVisits,
  buildOutboundStatusMap,
  computeAvgResponseTimeSeconds,
  flattenDailyActivity,
  groupSalesByDay,
  initializeDailyActivityMap,
  processFlowExecutionStats,
  processLeadScoreStats,
  processOutboundDeliveryStats,
  processSentimentStats,
  summarizeFlowExecutions,
} from './analytics.service.helpers';

describe('analytics.service.helpers', () => {
  describe('processSentimentStats', () => {
    it('maps POSITIVE/NEGATIVE labels and folds anything else into neutral', () => {
      expect(
        processSentimentStats([
          { sentiment: 'POSITIVE', _count: { sentiment: 4 } },
          { sentiment: 'NEGATIVE', _count: { sentiment: 2 } },
          { sentiment: 'NEUTRAL', _count: { sentiment: 1 } },
          { sentiment: null, _count: { sentiment: 3 } },
        ]),
      ).toEqual({ positive: 4, negative: 2, neutral: 4 });
    });

    it('returns zeroed stats when no rows are provided', () => {
      expect(processSentimentStats([])).toEqual({ positive: 0, negative: 0, neutral: 0 });
    });
  });

  describe('processLeadScoreStats', () => {
    it('buckets scores above 70 as high and 30-70 as medium', () => {
      const rows = [
        { leadScore: 95 },
        { leadScore: 71 },
        { leadScore: 70 },
        { leadScore: 50 },
        { leadScore: 31 },
        { leadScore: 30 },
        { leadScore: 0 },
      ];
      expect(processLeadScoreStats(rows)).toEqual({ high: 2, medium: 3, low: 2 });
    });
  });

  describe('buildOutboundStatusMap + processOutboundDeliveryStats', () => {
    it('uppercases status keys and replaces nullish with UNKNOWN', () => {
      const rows = [
        { status: 'delivered', _count: { status: 5 } },
        { status: null, _count: { status: 2 } },
        { status: 'READ', _count: { status: 3 } },
      ];
      const statusMap = buildOutboundStatusMap(rows);
      expect(statusMap).toEqual({ DELIVERED: 5, UNKNOWN: 2, READ: 3 });
    });

    it('treats SENT as delivered and computes rates rounded to whole %', () => {
      const statusMap = { DELIVERED: 5, SENT: 5, READ: 4, FAILED: 2, PENDING: 4 };
      expect(processOutboundDeliveryStats(statusMap)).toEqual({
        deliveryRate: 50, // (5+5)/20 = 50%
        readRate: 20, // 4/20
        errorRate: 10, // 2/20
      });
    });

    it('returns zeroed rates for empty status maps', () => {
      expect(processOutboundDeliveryStats({})).toEqual({
        deliveryRate: 0,
        readRate: 0,
        errorRate: 0,
      });
    });
  });

  describe('processFlowExecutionStats', () => {
    it('counts known statuses and total, ignores nullish status field', () => {
      const rows = [
        { status: 'COMPLETED', _count: { status: 3 } },
        { status: 'FAILED', _count: { status: 1 } },
        { status: 'RUNNING', _count: { status: 2 } },
        { status: null, _count: { status: 4 } },
      ];
      expect(processFlowExecutionStats(rows)).toEqual({
        flows: 10,
        flowCompleted: 3,
        flowFailed: 1,
        flowRunning: 2,
      });
    });
  });

  describe('daily activity map', () => {
    it('initializes 7 contiguous days relative to `now`', () => {
      const now = new Date('2026-05-28T12:00:00.000Z');
      const activity = initializeDailyActivityMap(now);
      const keys = Object.keys(activity).sort();
      expect(keys).toHaveLength(7);
      expect(keys[0]).toBe('2026-05-22');
      expect(keys[6]).toBe('2026-05-28');
      Object.values(activity).forEach((bucket) => {
        expect(bucket).toEqual({ inbound: 0, outbound: 0 });
      });
    });

    it('aggregates inbound/outbound messages into pre-seeded buckets only', () => {
      const now = new Date('2026-05-28T12:00:00.000Z');
      const activity = initializeDailyActivityMap(now);
      aggregateMessagesByDay(
        [
          { createdAt: new Date('2026-05-28T09:30:00.000Z'), direction: 'INBOUND' },
          { createdAt: new Date('2026-05-28T10:00:00.000Z'), direction: 'OUTBOUND' },
          { createdAt: new Date('2026-05-28T10:30:00.000Z'), direction: 'OUTBOUND' },
          // out-of-window message — should be dropped
          { createdAt: new Date('2026-04-01T00:00:00.000Z'), direction: 'INBOUND' },
        ],
        activity,
      );
      expect(activity['2026-05-28']).toEqual({ inbound: 1, outbound: 2 });
    });

    it('flattens the map into a chronologically-sorted array', () => {
      const activity = {
        '2026-05-26': { inbound: 1, outbound: 2 },
        '2026-05-25': { inbound: 0, outbound: 0 },
        '2026-05-27': { inbound: 3, outbound: 4 },
      };
      expect(flattenDailyActivity(activity)).toEqual([
        { date: '2026-05-25', inbound: 0, outbound: 0 },
        { date: '2026-05-26', inbound: 1, outbound: 2 },
        { date: '2026-05-27', inbound: 3, outbound: 4 },
      ]);
    });
  });

  describe('aggregateNodeVisits + summarizeFlowExecutions', () => {
    it('counts unique node visits per execution', () => {
      const visits = aggregateNodeVisits([
        { logs: [{ nodeId: 'a' }, { nodeId: 'a' }, { nodeId: 'b' }] },
        { logs: [{ nodeId: 'a' }, { nodeId: 'c' }] },
        // non-array logs are skipped
        { logs: { not: 'an array' } },
        // numeric ids coerce to strings
        { logs: [{ nodeId: 42 }, { nodeId: 42 }, { nodeId: 'a' }] },
      ]);
      expect(visits).toEqual({ a: 3, b: 1, c: 1, '42': 1 });
    });

    it('returns total/completed/failed/conversionRate envelope', () => {
      expect(
        summarizeFlowExecutions([
          { status: 'COMPLETED', logs: [{ nodeId: 'start' }] },
          { status: 'COMPLETED', logs: [] },
          { status: 'FAILED', logs: [] },
          { status: 'RUNNING', logs: [] },
        ]),
      ).toEqual({
        total: 4,
        completed: 2,
        failed: 1,
        conversionRate: 50,
        nodeVisits: { start: 1 },
      });
    });
  });

  describe('computeAvgResponseTimeSeconds', () => {
    it('returns null for fewer than two messages', () => {
      expect(computeAvgResponseTimeSeconds([])).toBeNull();
      expect(computeAvgResponseTimeSeconds([{ createdAt: new Date() }])).toBeNull();
    });

    it('drops zero and ≥1h intervals, then returns the mean rounded to 1 decimal', () => {
      const base = new Date('2026-05-28T10:00:00.000Z').getTime();
      const messages = [
        { createdAt: new Date(base) },
        { createdAt: new Date(base + 10_000) }, // +10s
        { createdAt: new Date(base + 30_000) }, // +20s
        { createdAt: new Date(base + 30_000) }, // +0s (dropped)
        { createdAt: new Date(base + 30_000 + 3_700_000) }, // +3700s (dropped, ≥1h)
      ];
      expect(computeAvgResponseTimeSeconds(messages)).toBe(15);
    });

    it('returns null when every interval is filtered out', () => {
      const base = new Date('2026-05-28T10:00:00.000Z').getTime();
      const messages = [
        { createdAt: new Date(base) },
        { createdAt: new Date(base) }, // identical → 0s delta, filtered
      ];
      expect(computeAvgResponseTimeSeconds(messages)).toBeNull();
    });
  });

  describe('groupSalesByDay', () => {
    it('buckets sales into a fixed-size array with most-recent day at the end', () => {
      const now = new Date('2026-05-28T12:00:00.000Z').getTime();
      const sales = [
        { createdAt: new Date('2026-05-28T01:00:00.000Z'), amount: 50 },
        { createdAt: new Date('2026-05-28T11:00:00.000Z'), amount: 25 },
        { createdAt: new Date('2026-05-27T11:00:00.000Z'), amount: 10 },
        { createdAt: new Date('2026-05-26T11:00:00.000Z'), amount: 5 },
        // out of 3-day window — dropped
        { createdAt: new Date('2026-05-20T11:00:00.000Z'), amount: 999 },
      ];
      expect(groupSalesByDay(sales, 3, now)).toEqual([5, 10, 75]);
    });

    it('returns a zeroed array when no sales fall in the window', () => {
      expect(groupSalesByDay([], 5, Date.now())).toEqual([0, 0, 0, 0, 0]);
    });
  });
});
