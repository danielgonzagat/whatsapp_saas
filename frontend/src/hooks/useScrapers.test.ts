import { renderHook } from '@testing-library/react';
import useSWR from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('swr', () => ({
  default: vi.fn(),
}));

vi.mock('@/lib/fetcher', () => ({
  swrFetcher: vi.fn(),
}));

vi.mock('@/lib/api/core', () => ({
  tokenStorage: {
    getWorkspaceId: vi.fn(() => 'workspace-1'),
  },
}));

vi.mock('@/lib/api/scrapers', () => ({
  scrapersApi: {
    createJob: vi.fn(),
    importResults: vi.fn(),
  },
}));

import { useScrapers } from './useScrapers';

const mutateMock = vi.fn();

function mockSwrData(data: unknown, error?: Error) {
  vi.mocked(useSWR).mockReturnValue({
    data,
    error,
    isLoading: false,
    mutate: mutateMock,
    isValidating: false,
  });
}

const job = {
  id: 'job-1',
  type: 'MAPS' as const,
  query: 'clinicas sao paulo',
  status: 'DONE',
  resultsCount: 12,
  createdAt: '2026-01-10T00:00:00.000Z',
};

beforeEach(() => {
  vi.mocked(useSWR).mockReset();
  mutateMock.mockReset();
});

describe('useScrapers', () => {
  it('surfaces invalid scraper job payloads instead of returning a fake empty job list', () => {
    mockSwrData({ jobs: { id: 'job-1' } });

    const { result } = renderHook(() => useScrapers());

    expect(result.current.jobs).toEqual([]);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Invalid scraper jobs payload');
  });

  it('loads valid raw job arrays', () => {
    mockSwrData([job]);

    const { result } = renderHook(() => useScrapers());

    expect(result.current.jobs).toEqual([job]);
    expect(result.current.error).toBeUndefined();
  });

  it('loads valid job envelopes', () => {
    mockSwrData({ jobs: [job] });

    const { result } = renderHook(() => useScrapers());

    expect(result.current.jobs).toEqual([job]);
    expect(result.current.error).toBeUndefined();
  });
});
