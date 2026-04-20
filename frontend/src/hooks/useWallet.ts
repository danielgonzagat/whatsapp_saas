'use client';

import { apiFetch } from '@/lib/api';
import { swrFetcher } from '@/lib/fetcher';
import useSWR from 'swr';
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

/** Wallet bank account shape. */
export interface WalletBankAccount {
  /** Id property. */
  id: string;
  /** Bank name property. */
  bankName?: string;
  /** Bank property. */
  bank?: string;
  /** Name property. */
  name?: string;
  /** Display account property. */
  displayAccount?: string;
  /** Account property. */
  account?: string;
  /** Pix key property. */
  pixKey?: string;
  /** Account type property. */
  accountType?: string;
  /** Bank code property. */
  bankCode?: string;
  /** Agency property. */
  agency?: string;
}

/** Use wallet balance. */
export function useWalletBalance() {
  const wsId = useWorkspaceId();
  const { data, error, isLoading, mutate } = useSWR(
    wsId ? `/kloel/wallet/${wsId}/balance` : null,
    swrFetcher,
    { keepPreviousData: true },
  );
  return { balance: data as WalletBalanceResponse | undefined, isLoading, error, mutate };
}

/* ── Wallet transactions ── */
type WalletTransactionsPayload = WalletTransactionsResponse | WalletTransaction[] | undefined;

function isWalletTransactionsResponse(
  value: WalletTransactionsPayload,
): value is WalletTransactionsResponse {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function extractTransactionItems(payload: WalletTransactionsPayload): WalletTransaction[] {
  if (isWalletTransactionsResponse(payload)) {
    if ('transactions' in payload) {
      return payload.transactions || [];
    }
    if ('data' in payload) {
      return payload.data || [];
    }
  }
  if (Array.isArray(payload)) {
    return payload;
  }
  return [];
}

function extractTransactionTotal(payload: WalletTransactionsPayload, fallback: number): number {
  if (isWalletTransactionsResponse(payload) && 'total' in payload) {
    return payload.total ?? fallback;
  }
  return fallback;
}

/** Use wallet transactions. */
export function useWalletTransactions() {
  const wsId = useWorkspaceId();
  const { data, error, isLoading, mutate } = useSWR(
    wsId ? `/kloel/wallet/${wsId}/transactions` : null,
    swrFetcher,
    { keepPreviousData: true },
  );
  const d = data as WalletTransactionsPayload;
  const items = extractTransactionItems(d);
  const total = extractTransactionTotal(d, items.length);
  return { transactions: items, total, isLoading, error, mutate };
}

/* ── Wallet chart ── */
export function useWalletChart() {
  const wsId = useWorkspaceId();
  const { data, isLoading } = useSWR(wsId ? `/kloel/wallet/${wsId}/chart` : null, swrFetcher, {
    keepPreviousData: true,
  });
  return {
    chart: ((data as Record<string, unknown>)?.chart as number[]) || Array(7).fill(0),
    isLoading,
  };
}

/* ── Wallet monthly ── */
export function useWalletMonthly() {
  const wsId = useWorkspaceId();
  const { data, isLoading } = useSWR(wsId ? `/kloel/wallet/${wsId}/monthly` : null, swrFetcher, {
    keepPreviousData: true,
  });
  return {
    monthly: data as {
      income: number;
      expense: number;
      balance: number;
      daily: Array<{ day: number; income: number; expense: number }>;
    } | null,
    isLoading,
  };
}

/* ── Wallet withdrawals ── */
export function useWalletWithdrawals() {
  const wsId = useWorkspaceId();
  const { data, isLoading, mutate } = useSWR(
    wsId ? `/kloel/wallet/${wsId}/withdrawals` : null,
    swrFetcher,
    { keepPreviousData: true },
  );
  return {
    withdrawals:
      ((data as Record<string, unknown>)?.withdrawals as Array<Record<string, unknown>>) || [],
    isLoading,
    mutate,
  };
}

/* ── Bank accounts ── */
export function useBankAccounts() {
  const wsId = useWorkspaceId();
  const { data, isLoading, mutate } = useSWR(
    wsId ? `/kloel/wallet/${wsId}/bank-accounts` : null,
    swrFetcher,
    { keepPreviousData: true },
  );
  const accounts =
    ((data as Record<string, unknown>)?.accounts as unknown as WalletBankAccount[]) || [];

  const addBankAccount = async (dto: Record<string, unknown>) => {
    if (!wsId) {
      return null;
    }
    const res = await apiFetch(`/kloel/wallet/${wsId}/bank-accounts`, {
      method: 'POST',
      body: dto,
    });
    await mutate();
    return res;
  };

  const removeBankAccount = async (id: string) => {
    if (!wsId) {
      return;
    }
    await apiFetch(`/kloel/wallet/${wsId}/bank-accounts/${id}`, { method: 'DELETE' });
    await mutate();
  };

  return { accounts, isLoading, mutate, addBankAccount, removeBankAccount };
}

/* ── Wallet anticipations ── */
export function useWalletAnticipations() {
  const wsId = useWorkspaceId();
  const { data, isLoading, mutate } = useSWR(
    wsId ? `/kloel/wallet/${wsId}/anticipations` : null,
    swrFetcher,
    { keepPreviousData: true },
  );
  const d = data as Record<string, unknown> | undefined;
  return {
    anticipations: (d?.anticipations as Array<Record<string, unknown>>) || [],
    totals: (d?.totals as Record<string, number>) || {
      totalAnticipated: 0,
      totalFees: 0,
      count: 0,
    },
    isLoading,
    mutate,
  };
}
