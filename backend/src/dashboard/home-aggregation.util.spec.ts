import {
  computeAverageResponseTimeSeconds,
  resolveDashboardHomeRange,
  sumByBuckets,
} from './home-aggregation.util';

describe('home-aggregation util', () => {
  it('builds a stable 7-day range with aligned previous period', () => {
    const now = new Date('2026-04-09T12:00:00.000Z');
    const range = resolveDashboardHomeRange({ period: '7d', now });

    expect(range.period).toBe('7d');
    expect(range.buckets).toHaveLength(7);
    expect(range.previousBuckets).toHaveLength(7);
    expect(range.start.getFullYear()).toBe(2026);
    expect(range.start.getMonth()).toBe(3);
    expect(range.start.getDate()).toBe(3);
    expect(range.label).toBe('Últimos 7 dias');
  });

  it('falls back safely when custom dates are inverted', () => {
    const range = resolveDashboardHomeRange({
      period: 'custom',
      startDate: '2026-04-09',
      endDate: '2026-04-01',
      now: new Date('2026-04-09T12:00:00.000Z'),
    });

    expect(range.period).toBe('custom');
    expect(range.start <= range.end).toBe(true);
    expect(range.label).toBe('01/04 até 09/04');
  });

  it('sums values by the generated buckets', () => {
    const range = resolveDashboardHomeRange({
      period: '7d',
      now: new Date('2026-04-09T12:00:00.000Z'),
    });

    const rows = [
      { createdAt: new Date('2026-04-03T10:00:00.000Z'), value: 100 },
      { createdAt: new Date('2026-04-03T12:00:00.000Z'), value: 200 },
      { createdAt: new Date('2026-04-09T09:00:00.000Z'), value: 50 },
    ];

    const result = sumByBuckets(
      rows,
      range.buckets,
      (row) => row.createdAt,
      (row) => row.value,
    );

    expect(result[0]).toBe(300);
    expect(result[result.length - 1]).toBe(50);
  });

  it('computes the average response time from inbound/outbound pairs', () => {
    const avg = computeAverageResponseTimeSeconds([
      {
        conversationId: 'conv_1',
        direction: 'INBOUND',
        createdAt: new Date('2026-04-09T10:00:00.000Z'),
      },
      {
        conversationId: 'conv_1',
        direction: 'OUTBOUND',
        createdAt: new Date('2026-04-09T10:02:00.000Z'),
      },
      {
        conversationId: 'conv_2',
        direction: 'INBOUND',
        createdAt: new Date('2026-04-09T10:05:00.000Z'),
      },
      {
        conversationId: 'conv_2',
        direction: 'OUTBOUND',
        createdAt: new Date('2026-04-09T10:08:00.000Z'),
      },
    ]);

    expect(avg).toBe(150);
  });
});
