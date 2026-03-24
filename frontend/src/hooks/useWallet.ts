'use client';

import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';
import { unwrapArray } from '@/lib/normalizer';
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
  const items = unwrapArray(data, 'transactions');
  return { transactions: items, isLoading, error, mutate };
}
