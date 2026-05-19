import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

vi.mock('swr', () => ({
  default: vi.fn(() => ({
    data: undefined,
    error: undefined,
    isLoading: true,
    mutate: vi.fn(),
    isValidating: false,
  })),
}));

vi.mock('@/lib/fetcher', () => ({
  swrFetcher: vi.fn(),
}));

import { useAppleDiagnostic } from './useAppleDiagnostic';
import useSWR from 'swr';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function recentIso(offsetMs = 0): string {
  return new Date(Date.now() - offsetMs).toISOString();
}

describe('useAppleDiagnostic', () => {
  beforeEach(() => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
  });

  it('returns ready=false when SWR is loading (no data)', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useAppleDiagnostic());
    expect(result.current.ready).toBe(false);
    expect(result.current.configured).toBe(false);
    expect(result.current.lastProbeAt).toBeNull();
    expect(result.current.lastProbeResult).toBeNull();
  });

  it('returns ready=false when configured is false', async () => {
    vi.mocked(useSWR).mockReturnValue({
      data: {
        configured: false,
        lastProbe: { at: recentIso(), result: 'PASS' },
        configuredVars: [],
        missingVars: ['APPLE_TEAM_ID'],
      },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useAppleDiagnostic());
    await act(() => vi.advanceTimersByTime(0));
    expect(result.current.ready).toBe(false);
    expect(result.current.configured).toBe(false);
  });

  it('returns ready=false when lastProbe is FAIL', async () => {
    vi.mocked(useSWR).mockReturnValue({
      data: {
        configured: true,
        lastProbe: { at: recentIso(), result: 'FAIL', error: 'expired' },
        configuredVars: ['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY_P8', 'APPLE_SERVICE_ID', 'APPLE_REDIRECT_URI'],
        missingVars: [],
      },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useAppleDiagnostic());
    await act(() => vi.advanceTimersByTime(0));
    expect(result.current.ready).toBe(false);
    expect(result.current.lastProbeResult).toBe('FAIL');
  });

  it('returns ready=false when lastProbe is older than 7 days', async () => {
    const old = new Date(Date.now() - SEVEN_DAYS_MS - 1000).toISOString();

    vi.mocked(useSWR).mockReturnValue({
      data: {
        configured: true,
        lastProbe: { at: old, result: 'PASS' },
        configuredVars: ['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY_P8', 'APPLE_SERVICE_ID', 'APPLE_REDIRECT_URI'],
        missingVars: [],
      },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useAppleDiagnostic());
    await act(() => vi.advanceTimersByTime(0));
    expect(result.current.ready).toBe(false);
  });

  it('returns ready=true when configured, PASS, and within 7 days', async () => {
    vi.mocked(useSWR).mockReturnValue({
      data: {
        configured: true,
        lastProbe: { at: recentIso(), result: 'PASS' },
        configuredVars: ['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY_P8', 'APPLE_SERVICE_ID', 'APPLE_REDIRECT_URI'],
        missingVars: [],
      },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useAppleDiagnostic());
    await act(() => vi.advanceTimersByTime(0));
    expect(result.current.ready).toBe(true);
    expect(result.current.configured).toBe(true);
    expect(result.current.lastProbeResult).toBe('PASS');
    expect(result.current.lastProbeAt).toBeInstanceOf(Date);
  });

  it('returns ready=false when lastProbe is null', async () => {
    vi.mocked(useSWR).mockReturnValue({
      data: {
        configured: true,
        lastProbe: null,
        configuredVars: ['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY_P8', 'APPLE_SERVICE_ID', 'APPLE_REDIRECT_URI'],
        missingVars: [],
      },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useAppleDiagnostic());
    await act(() => vi.advanceTimersByTime(0));
    expect(result.current.ready).toBe(false);
    expect(result.current.lastProbeAt).toBeNull();
    expect(result.current.lastProbeResult).toBeNull();
  });

  it('handles edge case: probe just inside boundary is valid', async () => {
    // 1 second inside the 7-day boundary so the test is not racy against
    // Date.now() drift between the test setup and the hook's effect.
    const exact = new Date(Date.now() - SEVEN_DAYS_MS + 1000).toISOString();

    vi.mocked(useSWR).mockReturnValue({
      data: {
        configured: true,
        lastProbe: { at: exact, result: 'PASS' },
        configuredVars: ['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY_P8', 'APPLE_SERVICE_ID', 'APPLE_REDIRECT_URI'],
        missingVars: [],
      },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useAppleDiagnostic());
    await act(() => vi.advanceTimersByTime(0));
    expect(result.current.ready).toBe(true);
  });
});
