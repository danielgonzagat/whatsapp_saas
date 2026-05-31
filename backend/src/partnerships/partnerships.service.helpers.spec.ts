import { OrderStatus } from '@prisma/client';

import {
  ATTRIBUTED_ORDER_STATUSES,
  DEFAULT_PARTNER_COMMISSION_RATE,
  aggregateMonthlyPerformance,
  buildAttributedOrderFilters,
  buildListAffiliatesWhere,
  computeAffiliateStats,
  extractLastSaleAt,
  getCurrentYearStartUtc,
  normalizeCreatePartnerInput,
} from './partnerships.service.helpers';

describe('partnerships.service.helpers', () => {
  describe('normalizeCreatePartnerInput', () => {
    it('trims partnerName, lowercases email, and uppercases type', () => {
      expect(
        normalizeCreatePartnerInput({
          partnerName: '  Alice Producer  ',
          partnerEmail: '  Alice@Example.COM  ',
          type: '  affiliate  ',
        }),
      ).toEqual({
        partnerName: 'Alice Producer',
        partnerEmail: 'alice@example.com',
        partnerType: 'AFFILIATE',
      });
    });

    it('coerces missing fields to the empty string', () => {
      expect(
        normalizeCreatePartnerInput({
          partnerName: undefined as unknown as string,
          partnerEmail: undefined as unknown as string,
          type: undefined as unknown as string,
        }),
      ).toEqual({
        partnerName: '',
        partnerEmail: '',
        partnerType: '',
      });
    });

    it('passes through already-canonical values', () => {
      expect(
        normalizeCreatePartnerInput({
          partnerName: 'Bob',
          partnerEmail: 'bob@example.com',
          type: 'PRODUCER',
        }),
      ).toEqual({
        partnerName: 'Bob',
        partnerEmail: 'bob@example.com',
        partnerType: 'PRODUCER',
      });
    });
  });

  describe('buildListAffiliatesWhere', () => {
    it('returns only workspaceId when no params are provided', () => {
      expect(buildListAffiliatesWhere('ws-1')).toEqual({ workspaceId: 'ws-1' });
    });

    it('omits the type filter when the sentinel value "todos" is supplied', () => {
      expect(buildListAffiliatesWhere('ws-1', { type: 'todos' })).toEqual({
        workspaceId: 'ws-1',
      });
    });

    it('trims and uppercases the type filter', () => {
      expect(buildListAffiliatesWhere('ws-1', { type: '  affiliate  ' })).toEqual({
        workspaceId: 'ws-1',
        type: 'AFFILIATE',
      });
    });

    it('trims and uppercases the status filter', () => {
      expect(buildListAffiliatesWhere('ws-1', { status: ' active ' })).toEqual({
        workspaceId: 'ws-1',
        status: 'ACTIVE',
      });
    });

    it('emits a case-insensitive contains filter for search', () => {
      expect(buildListAffiliatesWhere('ws-1', { search: 'Alice' })).toEqual({
        workspaceId: 'ws-1',
        partnerName: { contains: 'Alice', mode: 'insensitive' },
      });
    });

    it('combines all filters when present', () => {
      expect(
        buildListAffiliatesWhere('ws-1', {
          type: 'affiliate',
          status: 'active',
          search: 'bob',
        }),
      ).toEqual({
        workspaceId: 'ws-1',
        type: 'AFFILIATE',
        status: 'ACTIVE',
        partnerName: { contains: 'bob', mode: 'insensitive' },
      });
    });
  });

  describe('computeAffiliateStats', () => {
    it('returns zero counts and null top partner for an empty list', () => {
      expect(computeAffiliateStats([])).toEqual({
        activeAffiliates: 0,
        producers: 0,
        totalRevenue: 0,
        totalCommissions: 0,
        topPartner: null,
      });
    });

    it('counts active affiliates and producers, and sums revenue/commission', () => {
      const partners = [
        {
          type: 'AFFILIATE',
          status: 'ACTIVE',
          totalRevenue: 100,
          totalCommission: 10,
          partnerName: 'Alice',
        },
        {
          type: 'AFFILIATE',
          status: 'PENDING',
          totalRevenue: 50,
          totalCommission: 5,
          partnerName: 'Bob',
        },
        {
          type: 'PRODUCER',
          status: 'ACTIVE',
          totalRevenue: 999,
          totalCommission: 1,
          partnerName: 'Carol',
        },
      ];

      const stats = computeAffiliateStats(partners);

      // only AFFILIATE+ACTIVE counts as active affiliate
      expect(stats.activeAffiliates).toBe(1);
      // PRODUCER count is type-only, status irrelevant
      expect(stats.producers).toBe(1);
      // totalRevenue sums AFFILIATE rows only (PRODUCER excluded)
      expect(stats.totalRevenue).toBe(150);
      // totalCommissions sums all rows
      expect(stats.totalCommissions).toBe(16);
      // top partner is highest revenue across all types
      expect(stats.topPartner).toEqual({ name: 'Carol', revenue: 999 });
    });

    it('does not mutate the input array when selecting the top partner', () => {
      const partners = [
        {
          type: 'AFFILIATE',
          status: 'ACTIVE',
          totalRevenue: 1,
          totalCommission: 0,
          partnerName: 'A',
        },
        {
          type: 'AFFILIATE',
          status: 'ACTIVE',
          totalRevenue: 100,
          totalCommission: 0,
          partnerName: 'B',
        },
      ];
      const snapshot = partners.map((p) => ({ ...p }));
      computeAffiliateStats(partners);
      expect(partners).toEqual(snapshot);
    });
  });

  describe('buildAttributedOrderFilters', () => {
    it('returns an empty array when the partner has neither code nor partnerWorkspaceId', () => {
      expect(
        buildAttributedOrderFilters({ affiliateCode: null, partnerWorkspaceId: null }),
      ).toEqual([]);
    });

    it('emits an affiliateCode metadata filter when code is present', () => {
      expect(
        buildAttributedOrderFilters({ affiliateCode: 'ABC', partnerWorkspaceId: null }),
      ).toEqual([{ metadata: { path: ['affiliateCode'], equals: 'ABC' } }]);
    });

    it('emits affiliateId and affiliateWorkspaceId filters when partnerWorkspaceId is present', () => {
      expect(
        buildAttributedOrderFilters({ affiliateCode: null, partnerWorkspaceId: 'ws-42' }),
      ).toEqual([
        { affiliateId: 'ws-42' },
        { metadata: { path: ['affiliateWorkspaceId'], equals: 'ws-42' } },
      ]);
    });

    it('combines all three filters when both fields are present', () => {
      expect(
        buildAttributedOrderFilters({ affiliateCode: 'ABC', partnerWorkspaceId: 'ws-42' }),
      ).toEqual([
        { metadata: { path: ['affiliateCode'], equals: 'ABC' } },
        { affiliateId: 'ws-42' },
        { metadata: { path: ['affiliateWorkspaceId'], equals: 'ws-42' } },
      ]);
    });
  });

  describe('aggregateMonthlyPerformance', () => {
    it('returns a 12-element zero array when no orders are passed', () => {
      const monthly = aggregateMonthlyPerformance([]);
      expect(monthly).toHaveLength(12);
      expect(monthly.every((n) => n === 0)).toBe(true);
    });

    it('buckets orders by UTC month using paidAt when available', () => {
      const monthly = aggregateMonthlyPerformance([
        { paidAt: new Date(Date.UTC(2026, 0, 15)), createdAt: new Date(Date.UTC(2026, 5, 1)) },
        { paidAt: new Date(Date.UTC(2026, 0, 20)), createdAt: null },
        { paidAt: new Date(Date.UTC(2026, 2, 5)), createdAt: null },
      ]);
      // 2 orders in January (idx 0), 1 in March (idx 2)
      expect(monthly[0]).toBe(2);
      expect(monthly[2]).toBe(1);
      expect(monthly[1]).toBe(0);
    });

    it('falls back to createdAt when paidAt is null', () => {
      const monthly = aggregateMonthlyPerformance([
        { paidAt: null, createdAt: new Date(Date.UTC(2026, 5, 10)) },
      ]);
      expect(monthly[5]).toBe(1);
    });

    it('skips orders without each usable date', () => {
      const monthly = aggregateMonthlyPerformance([{ paidAt: null, createdAt: null }]);
      expect(monthly.every((n) => n === 0)).toBe(true);
    });

    it('returns a fresh array each call (no shared state)', () => {
      const a = aggregateMonthlyPerformance([]);
      const b = aggregateMonthlyPerformance([]);
      a[0] = 42;
      expect(b[0]).toBe(0);
    });
  });

  describe('extractLastSaleAt', () => {
    it('returns undefined when no order is provided', () => {
      expect(extractLastSaleAt(null)).toBeUndefined();
      expect(extractLastSaleAt(undefined)).toBeUndefined();
    });

    it('returns undefined when both timestamps are null', () => {
      expect(extractLastSaleAt({ paidAt: null, createdAt: null })).toBeUndefined();
    });

    it('prefers paidAt when both are present', () => {
      const paid = new Date(Date.UTC(2026, 0, 1));
      const created = new Date(Date.UTC(2025, 11, 31));
      expect(extractLastSaleAt({ paidAt: paid, createdAt: created })).toBe(paid.toISOString());
    });

    it('falls back to createdAt when paidAt is null', () => {
      const created = new Date(Date.UTC(2026, 0, 1));
      expect(extractLastSaleAt({ paidAt: null, createdAt: created })).toBe(created.toISOString());
    });
  });

  describe('getCurrentYearStartUtc', () => {
    it('returns Jan 1st 00:00 UTC of the current UTC year', () => {
      const now = new Date(Date.UTC(2026, 5, 15, 12, 30, 0));
      const start = getCurrentYearStartUtc(now);
      expect(start.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    });

    it('defaults to the real current year when no argument is provided', () => {
      const start = getCurrentYearStartUtc();
      const expectedYear = new Date().getUTCFullYear();
      expect(start.getUTCFullYear()).toBe(expectedYear);
      expect(start.getUTCMonth()).toBe(0);
      expect(start.getUTCDate()).toBe(1);
    });
  });

  describe('constants', () => {
    it('exposes the canonical list of attributed order statuses', () => {
      expect([...ATTRIBUTED_ORDER_STATUSES]).toEqual([
        OrderStatus.PAID,
        OrderStatus.SHIPPED,
        OrderStatus.DELIVERED,
      ]);
    });

    it('exposes the default partner commission rate as 30', () => {
      expect(DEFAULT_PARTNER_COMMISSION_RATE).toBe(30);
    });
  });
});
