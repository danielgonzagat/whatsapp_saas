import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('swr', () => ({
  default: vi.fn(() => ({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() })),
}));

vi.mock('@/lib/fetcher', () => ({
  swrFetcher: vi.fn(),
}));

vi.mock('@/lib/api/core', () => ({
  api: {
    post: vi.fn().mockResolvedValue({ data: {} }),
    get: vi.fn().mockResolvedValue({ data: {} }),
  },
  tokenStorage: {
    getToken: vi.fn(() => 'mock-token'),
    getWorkspaceId: vi.fn(() => 'test-ws'),
  },
}));

vi.mock('@/hooks/useWorkspaceId', () => ({
  useWorkspaceId: () => 'test-ws',
}));

import useSWR from 'swr';

import {
  useMindNarrate,
  useMindBeliefs,
  useMindLift,
  useMindAllBeliefs,
  useMindAllLifts,
} from '../useMind';

describe('useMindNarrate', () => {
  it('passes the correct SWR key', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useMindNarrate());

    expect(result.current.isLoading).toBe(true);
    const call = vi.mocked(useSWR).mock.calls.at(-1);
    expect(call?.[0]).toBe('/mind/test-ws/narrate');
    expect(typeof call?.[1]).toBe('function');
    expect(call?.[2]).toEqual(expect.objectContaining({ refreshInterval: 120_000 }));
  });

  it('unwraps the briefing string', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: { briefing: 'Mente calibrada com 142 crencas ativas.' },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useMindNarrate());

    expect(result.current.narrate?.briefing).toBe('Mente calibrada com 142 crencas ativas.');
    expect(result.current.isLoading).toBe(false);
  });
});

describe('useMindBeliefs', () => {
  it('includes predicate in the SWR key', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: [],
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });

    renderHook(() => useMindBeliefs('P(reply|template,hour,channel)'));

    const call = vi.mocked(useSWR).mock.calls.at(-1);
    expect(call?.[0]).toBe(
      '/mind/test-ws/beliefs?predicate=P%28reply%7Ctemplate%2Chour%2Cchannel%29',
    );
    expect(typeof call?.[1]).toBe('function');
    expect(call?.[2]).toEqual(expect.objectContaining({ refreshInterval: 60000 }));
  });

  it('returns beliefs as an array when the backend responds', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: [
        {
          workspaceId: 'test-ws',
          subject: 'contact:abc',
          predicate: 'P(reply|template,hour,channel)',
          context: { channel: 'whatsapp' },
          mean: 0.62,
          variance: 0.04,
          samples: 18,
          alpha: 12,
          beta: 7,
        },
      ],
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useMindBeliefs('P(reply|template,hour,channel)'));

    expect(result.current.beliefs).toHaveLength(1);
    expect(result.current.beliefs[0]?.mean).toBe(0.62);
  });
});

describe('useMindLift', () => {
  it('constructs the lift key with decision type and default window', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });

    renderHook(() => useMindLift('followup_timing'));

    const call = vi.mocked(useSWR).mock.calls.at(-1);
    expect(call?.[0]).toBe('/mind/test-ws/lift/followup_timing?sinceDays=14');
    expect(typeof call?.[1]).toBe('function');
    expect(call?.[2]).toEqual(expect.objectContaining({ refreshInterval: 120_000 }));
  });

  it('unwraps lift metrics', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: { n: 84, mindMean: 0.57, baselineMean: 0.42, lift: 0.357, pZScore: 2.1 },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useMindLift('followup_timing'));

    expect(result.current.lift?.lift).toBe(0.357);
    expect(result.current.lift?.n).toBe(84);
    expect(result.current.isLoading).toBe(false);
  });
});

describe('useMindAllBeliefs', () => {
  it('calls useSWR with belief predicate keys', () => {
    const mockReturn = {
      data: [],
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    };
    vi.mocked(useSWR).mockReturnValue(mockReturn);

    renderHook(() => useMindAllBeliefs());

    const call = vi.mocked(useSWR).mock.calls.at(-1);
    expect(String(call?.[0])).toContain('/mind/test-ws/beliefs');
    expect(typeof call?.[1]).toBe('function');
    expect(call?.[2]).toBeTruthy();
  });
});

describe('useMindAllLifts', () => {
  it('calls useSWR with lift decision type keys', () => {
    const mockReturn = {
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    };
    vi.mocked(useSWR).mockReturnValue(mockReturn);

    renderHook(() => useMindAllLifts());

    const call = vi.mocked(useSWR).mock.calls.at(-1);
    expect(String(call?.[0])).toContain('/mind/test-ws/lift/');
    expect(typeof call?.[1]).toBe('function');
    expect(call?.[2]).toBeTruthy();
  });
});
