import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('swr', () => ({
  default: vi.fn(() => ({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() })),
}));

vi.mock('@/lib/fetcher', () => ({
  swrFetcher: vi.fn(),
}));

import useSWR from 'swr';

import { useReports, useSmartTime, useAnalyticsStats } from './useReports';

describe('useReports', () => {
  beforeEach(() => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });
  });

  it('returns null report while loading', () => {
    const { result } = renderHook(() => useReports());
    expect(result.current.report).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });

  it('maps FullReportResponse to legacy report shape', () => {
    const full = {
      kpi: { totalRevenue: 50000, totalLeads: 120, totalSales: 30, revenueTrend: 5, salesTrend: 3, leadsTrend: 10, conversionRate: 25, avgTicket: 1667, totalPending: 5, adSpend: 1000, roas: 50 },
      aiPerformance: { totalMessages: 500, aiMessages: 450 },
    };
    vi.mocked(useSWR).mockReturnValue({
      data: full,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useReports());
    expect(result.current.report).toEqual({
      messages: { total: 500, inbound: 0, outbound: 450 },
      leads: { newContacts: 120 },
      flows: { executions: 0, completed: 0 },
      sales: { revenue: 50000 },
    });
    expect(result.current.isLoading).toBe(false);
  });

  it('returns null report when kpi is not in data', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: {},
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useReports());
    expect(result.current.report).toBeNull();
  });
});

describe('useSmartTime', () => {
  it('returns null while loading', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useSmartTime());
    expect(result.current.smartTime).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });

  it('returns smartTime data when loaded', () => {
    const data = { bestHours: [9, 14], bestDays: ['tue'], peakHour: 14, peakDay: 'tue', heatmap: [] };
    vi.mocked(useSWR).mockReturnValue({
      data,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useSmartTime());
    expect(result.current.smartTime).toBe(data);
  });
});

describe('useAnalyticsStats', () => {
  it('returns empty stats object while loading', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useAnalyticsStats());
    expect(result.current.stats).toEqual({});
    expect(result.current.isLoading).toBe(true);
  });

  it('returns stats when loaded', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: { messages: 100, contacts: 50 },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useAnalyticsStats());
    expect(result.current.stats.messages).toBe(100);
  });
});
