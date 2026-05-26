import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockWorkspaceId = vi.hoisted((): { value: string | undefined } => ({
  value: 'test-workspace-id',
}));

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
  useWorkspaceId: () => mockWorkspaceId.value,
}));

import { useWalletBalance, useWalletTransactions, useWalletChart, useWalletMonthly, useWalletWithdrawals, useBankAccounts, useWalletAnticipations } from '../useWallet';
import useSWR from 'swr';

beforeEach(() => {
  mockWorkspaceId.value = 'test-workspace-id';
});

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
  it('returns chart data when loaded', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: { chart: [10, 20, 30, 40, 50, 60, 70] },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useWalletChart());
    expect(result.current.chart).toEqual([10, 20, 30, 40, 50, 60, 70]);
    expect(result.current.isLoading).toBe(false);
  });
});

describe('useWalletMonthly', () => {
  it('returns undefined monthly when no data', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useWalletMonthly());
    expect(result.current.monthly).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
  });

  it('returns monthly data when loaded', () => {
    const monthlyData = {
      income: 5000,
      expense: 2000,
      balance: 3000,
      daily: [{ day: 1, income: 500, expense: 200 }],
    };
    vi.mocked(useSWR).mockReturnValue({
      data: monthlyData,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useWalletMonthly());
    expect(result.current.monthly).toEqual(monthlyData);
    expect(result.current.isLoading).toBe(false);
  });
});

describe('useWalletWithdrawals', () => {
  it('returns empty withdrawals array when no data', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useWalletWithdrawals());
    expect(result.current.withdrawals).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('returns withdrawals when loaded', () => {
    const withdrawals = [{ id: 'w1', amount: 1000, status: 'completed' }];
    vi.mocked(useSWR).mockReturnValue({
      data: { withdrawals },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useWalletWithdrawals());
    expect(result.current.withdrawals).toEqual(withdrawals);
  });
});

describe('useBankAccounts', () => {
  it('returns empty accounts array when no data', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useBankAccounts());
    expect(result.current.accounts).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('returns accounts when loaded', () => {
    const accounts = [{ id: 'ba1', bankName: 'Nubank', pixKey: 'key1' }];
    vi.mocked(useSWR).mockReturnValue({
      data: { accounts },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useBankAccounts());
    expect(result.current.accounts).toEqual(accounts);
  });

  it('returns null from addBankAccount when workspaceId is not available', async () => {
    mockWorkspaceId.value = undefined;
    const { result } = renderHook(() => useBankAccounts());
    await expect(result.current.addBankAccount({})).resolves.toBeNull();
  });

  it('does nothing from removeBankAccount when workspaceId is not available', async () => {
    mockWorkspaceId.value = undefined;
    const { result } = renderHook(() => useBankAccounts());
    await expect(result.current.removeBankAccount('id')).resolves.toBeUndefined();
  });
});

describe('useWalletAnticipations', () => {
  it('returns default anticipations structure when no data', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useWalletAnticipations());
    expect(result.current.anticipations).toEqual([]);
    expect(result.current.totals).toEqual({ totalAnticipated: 0, totalFees: 0, count: 0 });
    expect(result.current.isLoading).toBe(true);
  });

  it('returns anticipations data when loaded', () => {
    const data = {
      anticipations: [{ id: 'a1', amount: 500 }],
      totals: { totalAnticipated: 500, totalFees: 25, count: 1 },
    };
    vi.mocked(useSWR).mockReturnValue({
      data,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useWalletAnticipations());
    expect(result.current.anticipations).toEqual(data.anticipations);
    expect(result.current.totals).toEqual(data.totals);
  });
});

describe('useWalletTransactions — edge cases', () => {
  it('unwraps transactions from { data: [...] } shape', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: { data: [{ id: '3', amount: 200 }] },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useWalletTransactions());
    expect(result.current.transactions).toEqual([{ id: '3', amount: 200 }]);
  });

  it('uses items length as total when total field is absent', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: { transactions: [{ id: '1' }, { id: '2' }] },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useWalletTransactions());
    expect(result.current.total).toBe(2);
  });
});
