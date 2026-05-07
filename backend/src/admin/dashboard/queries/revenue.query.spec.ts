import { queryRevenueKloelInCents } from './revenue.query';

// PULSE_OK: assertions exist below
describe('queryRevenueKloelInCents', () => {
  it('returns net Kloel revenue after marketplace fee credits and reversal debits', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ total: 4_980n }]),
    };

    const total = await queryRevenueKloelInCents(
      prisma as never,
      new Date('2026-04-01T00:00:00Z'),
      new Date('2026-04-30T23:59:59Z'),
    );

    expect(total).toBe(4_980);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const sql = prisma.$queryRaw.mock.calls[0][0] as { strings: string[] };
    const text = sql.strings.join(' ');
    expect(text).toContain('MARKETPLACE_FEE_CREDIT');
    expect(text).toContain('REFUND_DEBIT');
    expect(text).toContain('CHARGEBACK_DEBIT');
  });
});
