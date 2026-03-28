'use client';

import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';
import { useWorkspaceId } from './useWorkspaceId';

/* ── Response types ── */
interface WalletTransaction {
  id?: string;
  type?: string;
  amount?: number;
  status?: string;
  description?: string;
  category?: string;
  createdAt?: string;
}

interface WalletTransactionsResponse {
  transactions?: WalletTransaction[];
  data?: WalletTransaction[];
  total?: number;
}

/* ── Wallet balance ── */
interface WalletBalanceResponse {
  available?: number;
  balance?: number;
  amount?: number;
  pending?: number;
  blocked?: number;
  locked?: number;
  total?: number;
  anticipatable?: number;
  updatedAt?: string;
  currency?: string;
  accountId?: string;
  account?: string;
  accountType?: string;
  nextRelease?: string;
}

export function useWalletBalance() {
  const wsId = useWorkspaceId();
  const { data, error, isLoading, mutate } = useSWR(
    wsId ? `/kloel/wallet/${wsId}/balance` : null,
    swrFetcher,
    { keepPreviousData: true }
  );
  return { balance: data as WalletBalanceResponse | undefined, isLoading, error, mutate };
}

/* ── Wallet transactions ── */
export function useWalletTransactions() {
  const wsId = useWorkspaceId();
  const { data, error, isLoading, mutate } = useSWR(
    wsId ? `/kloel/wallet/${wsId}/transactions` : null,
    swrFetcher,
    { keepPreviousData: true }
  );
  const d = data as WalletTransactionsResponse | WalletTransaction[] | undefined;
  const items: WalletTransaction[] = (d && typeof d === 'object' && !Array.isArray(d) && 'transactions' in d)
    ? d.transactions || []
    : (d && typeof d === 'object' && !Array.isArray(d) && 'data' in d)
      ? (d as WalletTransactionsResponse).data || []
      : Array.isArray(d) ? d : [];
  const total = (d && typeof d === 'object' && !Array.isArray(d) && 'total' in d)
    ? (d as WalletTransactionsResponse).total ?? items.length
    : items.length;
  return { transactions: items, total, isLoading, error, mutate };
}

/* ── Wallet chart ── */
export function useWalletChart() {
  const wsId = useWorkspaceId();
  const { data, isLoading } = useSWR(
    wsId ? `/kloel/wallet/${wsId}/chart` : null, swrFetcher, { keepPreviousData: true }
  );
  return { chart: (data as Record<string, unknown>)?.data as number[] || Array(7).fill(0), isLoading };
}

/* ── Wallet monthly ── */
export function useWalletMonthly() {
  const wsId = useWorkspaceId();
  const { data, isLoading } = useSWR(
    wsId ? `/kloel/wallet/${wsId}/monthly` : null, swrFetcher, { keepPreviousData: true }
  );
  return { monthly: data as { income: number; expense: number; balance: number; daily: Array<{ day: number; income: number; expense: number }> } | null, isLoading };
}

/* ── Wallet withdrawals ── */
export function useWalletWithdrawals() {
  const wsId = useWorkspaceId();
  const { data, isLoading, mutate } = useSWR(
    wsId ? `/kloel/wallet/${wsId}/withdrawals` : null, swrFetcher, { keepPreviousData: true }
  );
  return { withdrawals: (data as Record<string, unknown>)?.withdrawals as Array<Record<string, unknown>> || [], isLoading, mutate };
}

/* ── Bank accounts ── */
export function useBankAccounts() {
  const wsId = useWorkspaceId();
  const { data, isLoading, mutate } = useSWR(
    wsId ? `/kloel/wallet/${wsId}/bank-accounts` : null, swrFetcher, { keepPreviousData: true }
  );
  return { accounts: (data as Record<string, unknown>)?.accounts as Array<Record<string, unknown>> || [], isLoading, mutate };
}

/* ── Wallet anticipations ── */
export function useWalletAnticipations() {
  const wsId = useWorkspaceId();
  const { data, isLoading, mutate } = useSWR(
    wsId ? `/kloel/wallet/${wsId}/anticipations` : null, swrFetcher, { keepPreviousData: true }
  );
  const d = data as Record<string, unknown> | undefined;
  return {
    anticipations: (d?.anticipations as Array<Record<string, unknown>>) || [],
    totals: (d?.totals as Record<string, number>) || { totalAnticipated: 0, totalFees: 0, count: 0 },
    isLoading,
    mutate
  };
}
