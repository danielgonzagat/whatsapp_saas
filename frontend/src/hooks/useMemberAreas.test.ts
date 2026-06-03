import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  globalMutate: vi.fn(),
}));

vi.mock('swr', () => ({
  default: vi.fn(() => ({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() })),
  useSWRConfig: vi.fn(() => ({ mutate: mocks.globalMutate })),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: mocks.apiFetch,
}));

vi.mock('@/lib/fetcher', () => ({
  swrFetcher: vi.fn(),
}));

import useSWR from 'swr';

import {
  useMemberAreaMutations,
  useMemberAreas,
  useMemberAreaStats,
  useMemberAreaStudents,
} from './useMemberAreas';

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

  it('surfaces malformed area payload instead of a fake empty list', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: {},
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useMemberAreas());

    expect(result.current.areas).toEqual([]);
    expect((result.current.error as Error).message).toBe('Invalid member areas payload');
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

describe('useMemberAreaStudents', () => {
  it('returns students from data.students', () => {
    const students = [{ id: 's1', studentEmail: 'aula@example.com' }];
    vi.mocked(useSWR).mockReturnValue({
      data: { students },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useMemberAreaStudents('area-1'));

    expect(result.current.students).toEqual(students);
    expect(result.current.error).toBeUndefined();
  });

  it('surfaces malformed student payload instead of a fake empty list', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: {},
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useMemberAreaStudents('area-1'));

    expect(result.current.students).toEqual([]);
    expect((result.current.error as Error).message).toBe('Invalid member area students payload');
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

describe('useMemberAreaMutations', () => {
  beforeEach(() => {
    mocks.apiFetch.mockReset();
    mocks.globalMutate.mockReset();
  });

  it('rejects backend error envelopes when creating an area without invalidating cache', async () => {
    mocks.apiFetch.mockResolvedValueOnce({ error: 'Area invalida' });

    const { result } = renderHook(() => useMemberAreaMutations());

    await expect(result.current.createArea({ name: 'Curso' })).rejects.toThrow('Area invalida');
    expect(mocks.globalMutate).not.toHaveBeenCalled();
  });
});
