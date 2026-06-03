import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSitesApi, mockApiFetch } = vi.hoisted(() => ({
  mockSitesApi: {
    listSites: vi.fn(),
    getSite: vi.fn(),
    listDomains: vi.fn(),
    listApps: vi.fn(),
    createSite: vi.fn(),
    updateSite: vi.fn(),
    deleteSite: vi.fn(),
    publishSite: vi.fn(),
    unpublishSite: vi.fn(),
    addDomain: vi.fn(),
    deleteDomain: vi.fn(),
    upsertApp: vi.fn(),
  },
  mockApiFetch: vi.fn(),
}));

vi.mock('swr', () => ({
  default: vi.fn(() => ({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() })),
}));

vi.mock('@/lib/api/sites', () => ({
  sitesApi: mockSitesApi,
}));
vi.mock('@/lib/api/core', () => ({
  apiFetch: mockApiFetch,
}));

import useSWR from 'swr';

import { useSites, useSite, useSiteDomains, useSiteApps } from './useSites';

describe('useSites', () => {
  beforeEach(() => {
    Object.values(mockSitesApi).forEach((fn) => fn.mockReset());
    mockApiFetch.mockReset();
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

  it('surfaces malformed site list envelopes instead of returning a false empty site list', async () => {
    mockApiFetch.mockResolvedValue({ data: { sites: { id: 'site-1' } } });
    renderHook(() => useSites('ws1'));

    const fetcher = vi.mocked(useSWR).mock.calls.at(-1)?.[1] as (() => Promise<unknown>) | undefined;
    if (!fetcher) {
      throw new Error('Missing useSites SWR fetcher');
    }

    await expect(fetcher()).rejects.toThrow('Invalid sites list payload');
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
  beforeEach(() => {
    Object.values(mockSitesApi).forEach((fn) => fn.mockReset());
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });
  });

  it('returns empty domains while loading', () => {
    const { result } = renderHook(() => useSiteDomains('ws1', 'site-1'));
    expect(result.current.domains).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('surfaces malformed domain list envelopes instead of returning a false empty domain list', async () => {
    mockSitesApi.listDomains.mockResolvedValue({ data: { data: { id: 'domain-1' } } });
    renderHook(() => useSiteDomains('ws1', 'site-1'));

    const fetcher = vi.mocked(useSWR).mock.calls.at(-1)?.[1] as (() => Promise<unknown>) | undefined;
    if (!fetcher) {
      throw new Error('Missing useSiteDomains SWR fetcher');
    }

    await expect(fetcher()).rejects.toThrow('Invalid site domains payload');
  });
});

describe('useSiteApps', () => {
  beforeEach(() => {
    Object.values(mockSitesApi).forEach((fn) => fn.mockReset());
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });
  });

  it('returns empty apps while loading', () => {
    const { result } = renderHook(() => useSiteApps('ws1', 'site-1'));
    expect(result.current.apps).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('surfaces malformed app list envelopes instead of returning a false empty app list', async () => {
    mockSitesApi.listApps.mockResolvedValue({ data: { data: { id: 'app-1' } } });
    renderHook(() => useSiteApps('ws1', 'site-1'));

    const fetcher = vi.mocked(useSWR).mock.calls.at(-1)?.[1] as (() => Promise<unknown>) | undefined;
    if (!fetcher) {
      throw new Error('Missing useSiteApps SWR fetcher');
    }

    await expect(fetcher()).rejects.toThrow('Invalid site apps payload');
  });
});
