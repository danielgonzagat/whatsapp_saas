import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('swr', () => ({
  default: vi.fn(() => ({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() })),
}));

vi.mock('@/lib/fetcher', () => ({
  swrFetcher: vi.fn(),
}));

import useSWR from 'swr';

import { useSales, useSalesStats, useSalesChart, useOrderAlerts } from './useSales';

describe('useSales', () => {
  beforeEach(() => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });
  });

  it('returns empty sales and isLoading while loading', () => {
    const { result } = renderHook(() => useSales());
    expect(result.current.sales).toEqual([]);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.total).toBe(0);
  });

  it('returns sales from data.sales', () => {
    const items = [{ id: 's1', amount: 100 }];
    vi.mocked(useSWR).mockReturnValue({
      data: { sales: items, count: 1 },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useSales());
    expect(result.current.sales).toEqual(items);
    expect(result.current.total).toBe(1);
    expect(result.current.isLoading).toBe(false);
  });

  it('returns error on SWR failure', () => {
    const err = new Error('fail');
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: err,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useSales());
    expect(result.current.error).toBe(err);
  });
});

describe('useSalesStats', () => {
  it('returns empty stats object while loading', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useSalesStats());
    expect(result.current.stats).toEqual({});
    expect(result.current.isLoading).toBe(true);
  });

  it('returns stats data when loaded', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: { totalRevenue: 5000, totalTransactions: 42 },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useSalesStats());
    expect(result.current.stats.totalRevenue).toBe(5000);
  });
});

describe('useSalesChart', () => {
  it('returns empty chart while loading', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useSalesChart());
    expect(result.current.chart).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('returns chart array when loaded', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: { chart: [10, 20, 30] },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useSalesChart());
    expect(result.current.chart).toEqual([10, 20, 30]);
  });
});

describe('useOrderAlerts', () => {
  it('returns empty alerts while loading', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useOrderAlerts());
    expect(result.current.alerts).toEqual([]);
    expect(result.current.counts).toEqual({});
    expect(result.current.isLoading).toBe(true);
  });

  it('returns alerts and counts when loaded', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: { alerts: [{ id: 'a1', severity: 'high' }], counts: { high: 1 } },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useOrderAlerts());
    expect(result.current.alerts).toHaveLength(1);
    expect(result.current.counts).toEqual({ high: 1 });
  });
});
