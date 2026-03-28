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
    swrFetcher
  );
  return { balance: data as WalletBalanceResponse | undefined, isLoading, error, mutate };
}

/* ── Wallet transactions ── */
export function useWalletTransactions() {
  const wsId = useWorkspaceId();
  const { data, error, isLoading, mutate } = useSWR(
    wsId ? `/kloel/wallet/${wsId}/transactions` : null,
    swrFetcher
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
