import { queryRevenueKloelDailySeries } from './series.query';

describe('queryRevenueKloelDailySeries', () => {
  it('returns net daily Kloel revenue including reversal debits', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        { day: new Date('2026-04-10T00:00:00Z'), revenue: 4_980n, count: 3n },
        { day: new Date('2026-04-11T00:00:00Z'), revenue: -4_980n, count: 1n },
      ]),
    };

    const points = await queryRevenueKloelDailySeries(
      prisma as never,
      new Date('2026-04-01T00:00:00Z'),
      new Date('2026-04-30T23:59:59Z'),
    );

    expect(points).toEqual([
      { date: '2026-04-10', revenueInCents: 4_980, count: 3 },
      { date: '2026-04-11', revenueInCents: -4_980, count: 1 },
    ]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const sql = prisma.$queryRaw.mock.calls[0][0] as { strings: string[] };
    const text = sql.strings.join(' ');
    expect(text).toContain('PLATFORM_FEE_CREDIT');
    expect(text).toContain('REFUND_DEBIT');
    expect(text).toContain('CHARGEBACK_DEBIT');
  });
});
