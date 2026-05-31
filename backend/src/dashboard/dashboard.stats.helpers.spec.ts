import {
  aggregateStatusCounts,
  computeOutboundMessageRates,
  summarizeOperationalMetrics,
} from './dashboard.stats.helpers';

describe('aggregateStatusCounts', () => {
  it('returns {} for an empty input', () => {
    expect(aggregateStatusCounts([])).toEqual({});
  });

  it('maps each status to its count', () => {
    const result = aggregateStatusCounts([
      { status: 'SENT', _count: { status: 10 } },
      { status: 'DELIVERED', _count: { status: 30 } },
      { status: 'READ', _count: { status: 40 } },
      { status: 'FAILED', _count: { status: 20 } },
    ]);
    expect(result).toEqual({ SENT: 10, DELIVERED: 30, READ: 40, FAILED: 20 });
  });

  it('last entry wins when the same status appears twice', () => {
    const result = aggregateStatusCounts([
      { status: 'SENT', _count: { status: 1 } },
      { status: 'SENT', _count: { status: 99 } },
    ]);
    expect(result.SENT).toBe(99);
  });

  it('returns a fresh object — mutating it does not affect future calls', () => {
    const first = aggregateStatusCounts([{ status: 'SENT', _count: { status: 1 } }]);
    first.SENT = 999;
    const second = aggregateStatusCounts([{ status: 'SENT', _count: { status: 1 } }]);
    expect(second.SENT).toBe(1);
  });
});

describe('computeOutboundMessageRates', () => {
  it('returns all zeros when no statuses are present', () => {
    expect(computeOutboundMessageRates({})).toEqual({
      totalOutbound: 0,
      deliveryRatePct: 0,
      readRatePct: 0,
      errorRatePct: 0,
    });
  });

  it('returns all zeros when every count is zero', () => {
    expect(computeOutboundMessageRates({ SENT: 0, DELIVERED: 0, READ: 0, FAILED: 0 })).toEqual({
      totalOutbound: 0,
      deliveryRatePct: 0,
      readRatePct: 0,
      errorRatePct: 0,
    });
  });

  it('computes deliveryRate = (delivered+read)/total * 100', () => {
    const result = computeOutboundMessageRates({ SENT: 10, DELIVERED: 30, READ: 40, FAILED: 20 });
    expect(result.totalOutbound).toBe(100);
    expect(result.deliveryRatePct).toBe(70);
    expect(result.errorRatePct).toBe(20);
  });

  it('computes readRate = read / (delivered+read) * 100', () => {
    const result = computeOutboundMessageRates({ DELIVERED: 60, READ: 40 });
    expect(result.readRatePct).toBe(40);
  });

  it('readRate is 0 when neither DELIVERED nor READ exist (no engagement)', () => {
    const result = computeOutboundMessageRates({ SENT: 5, FAILED: 5 });
    expect(result.readRatePct).toBe(0);
    expect(result.deliveryRatePct).toBe(0);
    expect(result.errorRatePct).toBe(50);
  });

  it('rounds to 1 decimal place', () => {
    // 1 read of 3 delivered+read = 33.3...% → 33.3
    const result = computeOutboundMessageRates({ DELIVERED: 2, READ: 1 });
    expect(result.readRatePct).toBe(33.3);
  });

  it('ignores unknown statuses (no SUSPENDED contribution to total)', () => {
    const result = computeOutboundMessageRates({
      SENT: 10,
      DELIVERED: 0,
      READ: 0,
      FAILED: 0,
      SUSPENDED: 999,
    });
    expect(result.totalOutbound).toBe(10);
  });
});

describe('summarizeOperationalMetrics', () => {
  it('defaults to {healthScore: 100, avgLatencyMs: 0} when no events', () => {
    expect(summarizeOperationalMetrics([])).toEqual({ healthScore: 100, avgLatencyMs: 0 });
  });

  it('healthScore = (success / total) * 100, rounded', () => {
    // 3 of 4 are success = 75
    const result = summarizeOperationalMetrics(['1:100', '1:200', '0:0', '1:50']);
    expect(result.healthScore).toBe(75);
  });

  it('avgLatencyMs is the rounded mean across all events (including failures)', () => {
    // (100 + 200 + 0 + 50) / 4 = 87.5 → 88
    const result = summarizeOperationalMetrics(['1:100', '1:200', '0:0', '1:50']);
    expect(result.avgLatencyMs).toBe(88);
  });

  it('treats malformed latency as 0', () => {
    // Latencies: 100, NaN→0, 50  → mean = 50, success = 3/3
    const result = summarizeOperationalMetrics(['1:100', '1:not-a-number', '1:50']);
    expect(result.healthScore).toBe(100);
    expect(result.avgLatencyMs).toBe(50);
  });

  it('counts every non-"1" ok flag as failure (e.g. "0", "")', () => {
    const result = summarizeOperationalMetrics(['0:10', ':10', '1:10']);
    expect(result.healthScore).toBe(33); // round(1/3 * 100)
  });

  it('handles events without a colon (whole string treated as ok flag)', () => {
    // "1" with no latency → success, latency undefined → 0
    const result = summarizeOperationalMetrics(['1', '1']);
    expect(result.healthScore).toBe(100);
    expect(result.avgLatencyMs).toBe(0);
  });
});
