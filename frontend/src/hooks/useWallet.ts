'use client';

import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';
import { useWorkspaceId } from './useWorkspaceId';

/* ── Response types ── */
interface WalletTransactionsResponse {
  transactions?: unknown[];
  data?: unknown[];
  total?: number;
}

/* ── Wallet balance ── */
export function useWalletBalance() {
  const wsId = useWorkspaceId();
  const { data, error, isLoading, mutate } = useSWR(
    wsId ? `/kloel/wallet/${wsId}/balance` : null,
    swrFetcher
  );
  return { balance: data, isLoading, error, mutate };
}

/* ── Wallet transactions ── */
export function useWalletTransactions() {
  const wsId = useWorkspaceId();
  const { data, error, isLoading, mutate } = useSWR(
    wsId ? `/kloel/wallet/${wsId}/transactions` : null,
    swrFetcher
  );
  const d = data as WalletTransactionsResponse | unknown[] | undefined;
  const items = (d && typeof d === 'object' && 'transactions' in d)
    ? d.transactions
    : (d && typeof d === 'object' && 'data' in d)
      ? (d as WalletTransactionsResponse).data
      : Array.isArray(d) ? d : [];
  const total = (d && typeof d === 'object' && 'total' in d)
    ? (d as WalletTransactionsResponse).total ?? (items as unknown[]).length
    : (items as unknown[]).length;
  return { transactions: items, total, isLoading, error, mutate };
}
