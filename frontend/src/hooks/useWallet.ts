'use client';

import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';
import { useWorkspaceId } from './useWorkspaceId';

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
  const items = (data as any)?.transactions ?? (data as any)?.data ?? (Array.isArray(data) ? data : []);
  return { transactions: items, total: (data as any)?.total ?? items.length, isLoading, error, mutate };
}
