import {
  buildConversationStatusFilter,
  buildContactSearchOr,
  buildProductSearchClause,
  buildRevenueWindow,
  computeRevenueSummary,
} from './mind-capability-executor.helpers';

describe('mind-capability-executor.helpers (prisma + revenue + search)', () => {
  describe('computeRevenueSummary', () => {
    it('derives totals, rounded ticket and conversion for a typical period', () => {
      expect(
        computeRevenueSummary({
          sumTotalInCents: 12_345,
          avgTotalInCents: 411.5,
          totalCount: 30,
          paidCount: 9,
          periodDays: 7,
        }),
      ).toEqual({
        totalRevenue: 12_345,
        ticketMedio: 412,
        totalCount: 30,
        paidCount: 9,
        conversao: 30,
        periodDays: 7,
      });
    });

    it('falls back to zero when Prisma returns null aggregates', () => {
      expect(
        computeRevenueSummary({
          sumTotalInCents: null,
          avgTotalInCents: null,
          totalCount: 0,
          paidCount: 0,
          periodDays: 30,
        }),
      ).toEqual({
        totalRevenue: 0,
        ticketMedio: 0,
        totalCount: 0,
        paidCount: 0,
        conversao: 0,
        periodDays: 30,
      });
    });

    it('rounds conversion to two decimals', () => {
      const summary = computeRevenueSummary({
        sumTotalInCents: 1000,
        avgTotalInCents: 100,
        totalCount: 3,
        paidCount: 1,
        periodDays: 1,
      });
      expect(summary.conversao).toBe(33.33);
    });
  });

  describe('buildRevenueWindow', () => {
    const now = new Date('2026-05-15T12:34:56.000Z');

    it('clamps absurd values within [1, 365] and normalises midnight', () => {
      const window = buildRevenueWindow(10_000, 30, 365, now);
      expect(window.days).toBe(365);
      expect(window.start.getHours()).toBe(0);
      expect(window.start.getMinutes()).toBe(0);
      expect(window.start.getSeconds()).toBe(0);
      expect(window.start.getMilliseconds()).toBe(0);
    });

    it('uses the default when the input is missing or invalid', () => {
      expect(buildRevenueWindow(undefined, 30, 365, now).days).toBe(30);
      expect(buildRevenueWindow('not-a-number', 30, 365, now).days).toBe(30);
      expect(buildRevenueWindow(-5, 30, 365, now).days).toBe(30);
    });

    it('honours small positive values', () => {
      expect(buildRevenueWindow(7, 30, 365, now).days).toBe(7);
    });
  });

  describe('buildProductSearchClause', () => {
    it('returns undefined when no search term is supplied', () => {
      expect(buildProductSearchClause(undefined)).toBeUndefined();
      expect(buildProductSearchClause('')).toBeUndefined();
    });

    it('builds a case-insensitive contains clause when a term is supplied', () => {
      expect(buildProductSearchClause('Curso')).toEqual({
        name: { contains: 'Curso', mode: 'insensitive' },
      });
    });
  });

  describe('buildContactSearchOr', () => {
    it('builds matchers for name, phone and email', () => {
      expect(buildContactSearchOr('joao')).toEqual([
        { name: { contains: 'joao', mode: 'insensitive' } },
        { phone: { contains: 'joao' } },
        { email: { contains: 'joao', mode: 'insensitive' } },
      ]);
    });
  });

  describe('buildConversationStatusFilter', () => {
    it('matches open conversations when "open"', () => {
      expect(buildConversationStatusFilter('open')).toEqual({ status: { not: 'closed' } });
    });

    it('matches closed conversations when "closed"', () => {
      expect(buildConversationStatusFilter('closed')).toEqual({ status: 'closed' });
    });

    it('returns an empty fragment for "all" or unknown values', () => {
      expect(buildConversationStatusFilter('all')).toEqual({});
      expect(buildConversationStatusFilter(undefined)).toEqual({});
      expect(buildConversationStatusFilter('mystery')).toEqual({});
    });
  });
});
