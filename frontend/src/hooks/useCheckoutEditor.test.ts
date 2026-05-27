import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('swr', () => ({
  default: vi.fn(() => ({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() })),
}));

vi.mock('@/lib/fetcher', () => ({
  swrFetcher: vi.fn(),
}));

import useSWR from 'swr';

import { useCheckoutEditor, DEFAULT_CONFIG } from './useCheckoutEditor';

describe('useCheckoutEditor', () => {
  beforeEach(() => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });
  });

  it('returns DEFAULT_CONFIG while loading (no planId)', () => {
    const { result } = renderHook(() => useCheckoutEditor(null));
    expect(result.current.config).toBe(DEFAULT_CONFIG);
    expect(result.current.isLoading).toBe(true);
  });

  it('returns DEFAULT_CONFIG while loading with planId', () => {
    const { result } = renderHook(() => useCheckoutEditor('plan-1'));
    expect(result.current.config).toBe(DEFAULT_CONFIG);
    expect(result.current.isLoading).toBe(true);
  });

  it('normalizes loaded config via normalizeConfigForEditor', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: {
        theme: 'BLANC',
        brandName: 'My Store',
        timerType: 'EVERGREEN',
      },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useCheckoutEditor('plan-1'));
    expect(result.current.config.theme).toBe('BLANC');
    expect(result.current.config.brandName).toBe('My Store');
    expect(result.current.config.timerType).toBe('countdown');
    expect(result.current.isLoading).toBe(false);
  });

  it('returns error on SWR failure', () => {
    const err = new Error('fetch failed');
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: err,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useCheckoutEditor('plan-1'));
    expect(result.current.error).toBe(err);
    expect(result.current.config).toBe(DEFAULT_CONFIG);
  });

  it('not call SWR when planId is null', () => {
    renderHook(() => useCheckoutEditor(null));
    expect(vi.mocked(useSWR)).toHaveBeenCalledWith(null, expect.any(Function));
  });
});
