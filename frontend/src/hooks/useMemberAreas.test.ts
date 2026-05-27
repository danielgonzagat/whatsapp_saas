import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('swr', () => ({
  default: vi.fn(() => ({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() })),
}));

vi.mock('@/lib/fetcher', () => ({
  swrFetcher: vi.fn(),
}));

import useSWR from 'swr';

import { useMemberAreas, useMemberAreaStats } from './useMemberAreas';

describe('useMemberAreas', () => {
  beforeEach(() => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });
  });

  it('returns empty areas and isLoading while loading', () => {
    const { result } = renderHook(() => useMemberAreas());
    expect(result.current.areas).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('returns areas from data.areas', () => {
    const items = [{ id: 'a1', name: 'Area 1' }];
    vi.mocked(useSWR).mockReturnValue({
      data: { areas: items },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useMemberAreas());
    expect(result.current.areas).toEqual(items);
    expect(result.current.isLoading).toBe(false);
  });

  it('handles array response directly', () => {
    const items = [{ id: 'a2' }];
    vi.mocked(useSWR).mockReturnValue({
      data: items,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useMemberAreas());
    expect(result.current.areas).toEqual(items);
  });

  it('returns error on failure', () => {
    const err = new Error('fail');
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: err,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useMemberAreas());
    expect(result.current.error).toBe(err);
  });
});

describe('useMemberAreaStats', () => {
  it('returns default stats while loading', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useMemberAreaStats());
    expect(result.current.stats).toEqual({
      totalAreas: 0,
      totalStudents: 0,
      avgCompletion: 0,
      avgRating: 0,
    });
    expect(result.current.isLoading).toBe(true);
  });

  it('returns loaded stats', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: { totalAreas: 5, totalStudents: 100, avgCompletion: 80, avgRating: 4.5 },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useMemberAreaStats());
    expect(result.current.stats.totalAreas).toBe(5);
    expect(result.current.stats.totalStudents).toBe(100);
  });
});
