import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.fn();
const globalMutateMock = vi.fn();

vi.mock('swr', () => ({
  default: vi.fn(() => ({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() })),
  useSWRConfig: () => ({ mutate: globalMutateMock }),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock('@/lib/fetcher', () => ({
  swrFetcher: vi.fn(),
}));

import useSWR from 'swr';

import { useContacts, useContact, usePipelines, useDeals, useCRMMutations } from './useCRM';

beforeEach(() => {
  apiFetchMock.mockReset();
  globalMutateMock.mockReset();
});

describe('useContacts', () => {
  beforeEach(() => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });
  });

  it('returns empty contacts and isLoading while loading', () => {
    const { result } = renderHook(() => useContacts());
    expect(result.current.contacts).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('unwraps paginated contacts from data', () => {
    const items = [{ id: '1', name: 'Joao' }];
    vi.mocked(useSWR).mockReturnValue({
      data: { data: items, meta: { total: 1, page: 1 } },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useContacts());
    expect(result.current.contacts).toEqual(items);
    expect(result.current.total).toBe(1);
    expect(result.current.isLoading).toBe(false);
  });

  it('returns empty contacts on SWR error', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: new Error('fail'),
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useContacts());
    expect(result.current.contacts).toEqual([]);
    expect(result.current.error).toBeTruthy();
  });
});

describe('useContact', () => {
  beforeEach(() => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });
  });

  it('returns undefined contact while loading', () => {
    const { result } = renderHook(() => useContact('551199999999'));
    expect(result.current.contact).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
  });

  it('returns contact data when loaded', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: { contact: { phone: '551199999999', name: 'Maria' } },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useContact('551199999999'));
    expect(result.current.contact).toEqual({ phone: '551199999999', name: 'Maria' });
  });
});

describe('usePipelines', () => {
  it('returns empty pipelines while loading', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => usePipelines());
    expect(result.current.pipelines).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('returns unwrapped pipelines', () => {
    const pipes = [{ id: 'p1', name: 'Vendas' }];
    vi.mocked(useSWR).mockReturnValue({
      data: { pipelines: pipes },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => usePipelines());
    expect(result.current.pipelines).toEqual(pipes);
  });
});

describe('useDeals', () => {
  it('returns empty deals while loading', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useDeals());
    expect(result.current.deals).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('returns deals with count from response', () => {
    const deals = [{ id: 'd1', title: 'Deal 1' }];
    vi.mocked(useSWR).mockReturnValue({
      data: { deals, count: 1 },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useDeals());
    expect(result.current.deals).toEqual(deals);
    expect(result.current.total).toBe(1);
  });
});

describe('useCRMMutations', () => {
  it('does not invalidate contacts when create contact returns an API error envelope', async () => {
    apiFetchMock.mockResolvedValueOnce({ error: 'Invalid contact', status: 400 });

    const { result } = renderHook(() => useCRMMutations());

    await expect(result.current.createContact({ name: 'Ana' })).rejects.toThrow('Invalid contact');
    expect(globalMutateMock).not.toHaveBeenCalled();
  });

  it('invalidates deals after a successful deal update', async () => {
    apiFetchMock.mockResolvedValueOnce({ data: { id: 'deal-1' }, status: 200 });

    const { result } = renderHook(() => useCRMMutations());

    const response = await result.current.updateDeal('deal-1', { title: 'Novo' });

    expect(response).toEqual({ data: { id: 'deal-1' }, status: 200 });
    expect(globalMutateMock).toHaveBeenCalledWith(expect.any(Function));
  });
});
