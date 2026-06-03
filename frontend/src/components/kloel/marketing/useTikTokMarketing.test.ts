import { renderHook } from '@testing-library/react';
import useSWR from 'swr';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('swr', () => ({
  default: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('@/lib/fetcher', () => ({
  swrFetcher: vi.fn(),
}));

import { apiFetch } from '@/lib/api';

import { useTikTokMarketing } from './useTikTokMarketing';

const apiFetchMock = vi.mocked(apiFetch);
const useSWRMock = vi.mocked(useSWR);

describe('useTikTokMarketing', () => {
  const originalLocation = window.location;
  let assignMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    apiFetchMock.mockReset();
    useSWRMock.mockReset();
    useSWRMock.mockReturnValue({
      data: null,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    assignMock = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        assign: assignMock,
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('surfaces backend OAuth errors and does not redirect', async () => {
    apiFetchMock.mockResolvedValue({ error: 'TikTok OAuth disabled', status: 503 });

    const { result } = renderHook(() => useTikTokMarketing());

    await expect(result.current.openTikTokConnect('advertiser')).rejects.toThrow(
      'TikTok OAuth disabled',
    );
    expect(assignMock).not.toHaveBeenCalled();
  });

  it('redirects only to trusted official TikTok OAuth URLs', async () => {
    apiFetchMock.mockResolvedValue({
      data: { url: 'https://www.tiktok.com/v2/auth/authorize/?client_key=abc' },
      status: 200,
    });

    const { result } = renderHook(() => useTikTokMarketing());

    await expect(result.current.openTikTokConnect('creator')).resolves.toBeUndefined();
    expect(apiFetchMock).toHaveBeenCalledWith('/marketing/connect/tiktok/url?kind=creator');
    expect(assignMock).toHaveBeenCalledWith('https://www.tiktok.com/v2/auth/authorize/?client_key=abc');
  });

  it('rejects unsafe redirect URLs from malformed provider responses', async () => {
    apiFetchMock.mockResolvedValue({
      data: { url: 'https://evil.example/oauth' },
      status: 200,
    });

    const { result } = renderHook(() => useTikTokMarketing());

    await expect(result.current.openTikTokConnect('advertiser')).rejects.toThrow(
      'URL oficial do TikTok indisponivel.',
    );
    expect(assignMock).not.toHaveBeenCalled();
  });
});
