import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('swr', () => ({
  default: vi.fn(() => ({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() })),
}));

vi.mock('@/lib/fetcher', () => ({
  swrFetcher: vi.fn(),
}));

import useSWR from 'swr';

import { useDashboardHome, useDashboardPostPayment } from './useDashboardHome';

describe('useDashboardHome', () => {
  beforeEach(() => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });
  });

  it('returns null home and isLoading=true when loading', () => {
    const { result } = renderHook(() => useDashboardHome());
    expect(result.current.home).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
  });

  it('returns home data when loaded', () => {
    const homeData = { kpi: { revenue: 1000 } };
    vi.mocked(useSWR).mockReturnValue({
      data: homeData,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useDashboardHome());
    expect(result.current.home).toBe(homeData);
    expect(result.current.isLoading).toBe(false);
  });

  it('passes period parameter to SWR key', () => {
    renderHook(() => useDashboardHome({ period: '30d' }));
    expect(vi.mocked(useSWR)).toHaveBeenCalledWith(
      '/dashboard/home?period=30d',
      expect.any(Function),
      expect.any(Object),
    );
  });

  it('returns error when SWR errors', () => {
    const err = new Error('network error');
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: err,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useDashboardHome());
    expect(result.current.error).toBe(err);
  });
});

describe('useDashboardPostPayment', () => {
  it('returns null postPayment while loading', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useDashboardPostPayment());
    expect(result.current.postPayment).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
  });

  it('returns postPayment data when loaded', () => {
    const data = { events: [] };
    vi.mocked(useSWR).mockReturnValue({
      data,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useDashboardPostPayment());
    expect(result.current.postPayment).toBe(data);
  });
});
