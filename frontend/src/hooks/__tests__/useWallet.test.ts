import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Mock SWR before importing hooks
vi.mock('swr', () => ({
  default: vi.fn(() => ({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() })),
}));

// Mock the fetcher
vi.mock('@/lib/fetcher', () => ({
  swrFetcher: vi.fn(),
}));

// Mock useWorkspaceId
vi.mock('@/hooks/useWorkspaceId', () => ({
  useWorkspaceId: () => 'test-workspace-id',
}));

import { useWalletBalance, useWalletTransactions, useWalletChart } from '../useWallet';
import useSWR from 'swr';

describe('useWalletBalance', () => {
  beforeEach(() => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });
  });

  it('returns undefined balance and isLoading=true when loading', () => {
    const { result } = renderHook(() => useWalletBalance());
    expect(result.current.balance).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
  });

  it('returns balance data when loaded', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: { available: 1000, pending: 200 },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useWalletBalance());
    expect(result.current.balance).toEqual({ available: 1000, pending: 200 });
    expect(result.current.isLoading).toBe(false);
  });
});

describe('useWalletTransactions', () => {
  it('returns empty transactions when no data', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useWalletTransactions());
    expect(result.current.transactions).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('unwraps transactions from { transactions: [...] } shape', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: { transactions: [{ id: '1', amount: 50 }], total: 1 },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useWalletTransactions());
    expect(result.current.transactions).toEqual([{ id: '1', amount: 50 }]);
    expect(result.current.total).toBe(1);
  });

  it('handles direct array response', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: [{ id: '2', amount: 100 }],
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useWalletTransactions());
    expect(result.current.transactions).toEqual([{ id: '2', amount: 100 }]);
  });
});

describe('useWalletChart', () => {
  it('returns array of zeros when no data', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useWalletChart());
    expect(result.current.chart).toEqual(Array(7).fill(0));
    expect(result.current.isLoading).toBe(true);
  });
});
