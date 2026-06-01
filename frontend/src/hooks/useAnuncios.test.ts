import { renderHook } from '@testing-library/react';
import useSWR from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('swr', () => ({
  default: vi.fn(),
}));

vi.mock('@/lib/fetcher', () => ({
  swrFetcher: vi.fn(),
}));

import { useAnunciosCampaigns, useAnunciosStatus } from './useAnuncios';

function mockSWR(data: unknown) {
  vi.mocked(useSWR).mockReturnValue({
    data,
    error: undefined,
    isLoading: false,
    mutate: vi.fn(),
    isValidating: false,
  });
}

beforeEach(() => {
  vi.mocked(useSWR).mockReset();
});

describe('useAnunciosStatus', () => {
  it('surfaces malformed status list payloads instead of showing no connected ad platforms', () => {
    mockSWR({ data: { platform: 'meta', connected: true } });

    const { result } = renderHook(() => useAnunciosStatus());

    expect(result.current.statuses).toEqual([]);
    expect(result.current.error).toBeInstanceOf(Error);
    expect((result.current.error as Error).message).toBe('Invalid anuncios status payload');
  });
});

describe('useAnunciosCampaigns', () => {
  it('surfaces malformed campaign list payloads instead of showing no campaigns', () => {
    mockSWR({ data: { id: 'campaign-1' } });

    const { result } = renderHook(() => useAnunciosCampaigns('meta'));

    expect(result.current.campaigns).toEqual([]);
    expect(result.current.error).toBeInstanceOf(Error);
    expect((result.current.error as Error).message).toBe('Invalid anuncios campaigns payload');
  });
});
