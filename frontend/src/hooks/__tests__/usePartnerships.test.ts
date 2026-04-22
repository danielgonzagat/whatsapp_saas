import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('swr', () => ({
  default: vi.fn(() => ({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() })),
  mutate: vi.fn(),
}));

vi.mock('@/lib/fetcher', () => ({
  swrFetcher: vi.fn(),
}));

import useSWR from 'swr';

import { useAffiliateStats, useAffiliates } from '../usePartnerships';

describe('useAffiliates', () => {
  beforeEach(() => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });
  });

  it('normalizes backend affiliate records into the UI shape', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: {
        affiliates: [
          {
            id: 'partner-1',
            partnerName: 'Ana',
            partnerEmail: 'ana@example.com',
            type: 'AFFILIATE',
            status: 'PENDING',
            totalRevenue: 1250,
            commissionRate: 30,
            temperature: 72,
            totalSales: 9,
            productIds: ['prod_1'],
            createdAt: '2026-04-22T00:00:00.000Z',
          },
        ],
      },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useAffiliates());

    expect(result.current.affiliates).toEqual([
      {
        id: 'partner-1',
        name: 'Ana',
        email: 'ana@example.com',
        type: 'affiliate',
        status: 'pending',
        revenue: 1250,
        commission: 30,
        temperature: 72,
        totalSales: 9,
        products: ['prod_1'],
        joined: '2026-04-22T00:00:00.000Z',
      },
    ]);
  });
});

describe('useAffiliateStats', () => {
  it('normalizes the topPartner object into a string label', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: {
        activeAffiliates: 3,
        producers: 1,
        totalRevenue: 8000,
        totalCommissions: 2400,
        topPartner: { name: 'Ana', revenue: 5000 },
      },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useAffiliateStats());

    expect(result.current.stats).toEqual({
      activeAffiliates: 3,
      producers: 1,
      totalRevenue: 8000,
      totalCommissions: 2400,
      topPartner: 'Ana',
    });
  });
});
