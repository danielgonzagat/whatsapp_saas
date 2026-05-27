import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('swr', () => ({
  default: vi.fn(() => ({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() })),
}));

import useSWR from 'swr';

import { useSites, useSite, useSiteDomains, useSiteApps } from './useSites';

describe('useSites', () => {
  beforeEach(() => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });
  });

  it('returns empty sites and isLoading=true when SWR is loading', () => {
    const { result } = renderHook(() => useSites('ws1'));
    expect(result.current.sites).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('returns sites when SWR has data', () => {
    const items = [{ id: 's1', name: 'Site A', slug: 'a', status: 'DRAFT' }];
    vi.mocked(useSWR).mockReturnValue({
      data: items,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useSites('ws1'));
    expect(result.current.sites).toEqual(items);
    expect(result.current.isLoading).toBe(false);
  });

  it('returns error when SWR errors', () => {
    const err = new Error('fetch failed');
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: err,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useSites('ws1'));
    expect(result.current.error).toBe(err);
    expect(result.current.sites).toEqual([]);
  });

  it('uses params in SWR key', () => {
    renderHook(() => useSites('ws1', { status: 'PUBLISHED' }));
    const calls = vi.mocked(useSWR).mock.calls;
    const lastCallKey = calls.at(-1)?.[0];
    expect(lastCallKey).toContain('sites:list:ws1');
    expect(lastCallKey).toContain('PUBLISHED');
  });
});

describe('useSite', () => {
  beforeEach(() => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });
  });

  it('returns null site while loading', () => {
    const { result } = renderHook(() => useSite('ws1', 'site-1'));
    expect(result.current.site).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });

  it('returns site when loaded', () => {
    const item = { id: 'site-1', name: 'Detail', slug: 'd', status: 'PUBLISHED' };
    vi.mocked(useSWR).mockReturnValue({
      data: item,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useSite('ws1', 'site-1'));
    expect(result.current.site).toEqual(item);
    expect(result.current.isLoading).toBe(false);
  });

  it('returns null when id is null', () => {
    const { result } = renderHook(() => useSite('ws1', null));
    expect(result.current.site).toBeNull();
  });
});

describe('useSiteDomains', () => {
  it('returns empty domains while loading', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useSiteDomains('ws1', 'site-1'));
    expect(result.current.domains).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });
});

describe('useSiteApps', () => {
  it('returns empty apps while loading', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useSiteApps('ws1', 'site-1'));
    expect(result.current.apps).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });
});
