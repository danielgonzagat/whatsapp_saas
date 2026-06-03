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

function resolveWalletTransactionsPayload(
  payload: WalletTransactionsPayload,
  isEnabled: boolean,
  isLoading: boolean,
): { transactions: WalletTransaction[]; total: number; payloadError?: Error } {
  if (!isEnabled) {
    return { transactions: [], total: 0 };
  }

  if (payload === undefined) {
    return isLoading
      ? { transactions: [], total: 0 }
      : { transactions: [], total: 0, payloadError: new Error('Invalid wallet transactions payload') };
  }

  if (Array.isArray(payload)) {
    return { transactions: payload, total: payload.length };
  }

  if (isWalletTransactionsResponse(payload)) {
    const transactions = Array.isArray(payload.transactions)
      ? payload.transactions
      : Array.isArray(payload.data)
        ? payload.data
        : null;
    if (transactions) {
      const total = typeof payload.total === 'number' ? payload.total : transactions.length;
      return { transactions, total };
    }
  }

  return { transactions: [], total: 0, payloadError: new Error('Invalid wallet transactions payload') };
}

/** Use wallet transactions. */
export function useWalletTransactions() {
  const wsId = useWorkspaceId();
  const { data, error, isLoading, mutate } = useSWR(
    wsId ? `/kloel/wallet/${wsId}/transactions` : null,
    swrFetcher,
    { keepPreviousData: true },
  );
  const { transactions, total, payloadError } = resolveWalletTransactionsPayload(
    data as WalletTransactionsPayload,
    Boolean(wsId),
    isLoading,
  );
  return { transactions, total, isLoading, error: error ?? payloadError, mutate };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function resolveWalletArrayPayload<T>(
  payload: unknown,
  key: string,
  isEnabled: boolean,
  isLoading: boolean,
  invalidMessage: string,
): { items: T[]; payloadError?: Error } {
  if (!isEnabled) {
    return { items: [] };
  }

  if (payload === undefined) {
    return isLoading ? { items: [] } : { items: [], payloadError: new Error(invalidMessage) };
  }

  if (isRecord(payload) && Array.isArray(payload[key])) {
    return { items: payload[key] as T[] };
  }

  return { items: [], payloadError: new Error(invalidMessage) };
}

/* ── Wallet withdrawals ── */
export function useWalletWithdrawals() {
  const wsId = useWorkspaceId();
  const { data, error, isLoading, mutate } = useSWR(
    wsId ? `/kloel/wallet/${wsId}/withdrawals` : null,
    swrFetcher,
    { keepPreviousData: true },
  );
  const { items, payloadError } = resolveWalletArrayPayload<Record<string, unknown>>(
    data,
    'withdrawals',
    Boolean(wsId),
    isLoading,
    'Invalid wallet withdrawals payload',
  );
  return {
    withdrawals: items,
    isLoading,
    error: error ?? payloadError,
    mutate,
  };
}

/* ── Bank accounts ── */
export function useBankAccounts() {
  const wsId = useWorkspaceId();
  const { data, error, isLoading, mutate } = useSWR(
    wsId ? `/kloel/wallet/${wsId}/bank-accounts` : null,
    swrFetcher,
    { keepPreviousData: true },
  );
  const { items: accounts, payloadError } = resolveWalletArrayPayload<WalletBankAccount>(
    data,
    'accounts',
    Boolean(wsId),
    isLoading,
    'Invalid wallet bank accounts payload',
  );
  const requireWalletMutationSuccess = <T extends { error?: string }>(res: T, fallback: string) => {
    if (res.error) {
      throw new Error(res.error || fallback);
    }
    return res;
  };

  const addBankAccount = async (dto: Record<string, unknown>) => {
    if (!wsId) {
      return null;
    }
    const res = await apiFetch(`/kloel/wallet/${wsId}/bank-accounts`, {
      method: 'POST',
      body: dto,
    });
    requireWalletMutationSuccess(res, 'Erro ao cadastrar conta bancaria');
    await mutate();
    return res;
  };

  const removeBankAccount = async (id: string) => {
    if (!wsId) {
      return;
    }
    const res = await apiFetch(`/kloel/wallet/${wsId}/bank-accounts/${id}`, { method: 'DELETE' });
    requireWalletMutationSuccess(res, 'Erro ao remover conta bancaria');
    await mutate();
  };

  return { accounts, isLoading, error: error ?? payloadError, mutate, addBankAccount, removeBankAccount };
}

/* ── Wallet anticipations ── */
type WalletAnticipationTotals = {
  totalAnticipated: number;
  totalFees: number;
  count: number;
};

const DEFAULT_WALLET_ANTICIPATION_TOTALS: WalletAnticipationTotals = {
  totalAnticipated: 0,
  totalFees: 0,
  count: 0,
};

function isWalletAnticipationTotals(value: unknown): value is WalletAnticipationTotals {
  return (
    isRecord(value) &&
    typeof value.totalAnticipated === 'number' &&
    typeof value.totalFees === 'number' &&
    typeof value.count === 'number'
  );
}

export function useWalletAnticipations() {
  const wsId = useWorkspaceId();
  const { data, error, isLoading, mutate } = useSWR(
    wsId ? `/kloel/wallet/${wsId}/anticipations` : null,
    swrFetcher,
    { keepPreviousData: true },
  );
  const { items: anticipations, payloadError } = resolveWalletArrayPayload<Record<string, unknown>>(
    data,
    'anticipations',
    Boolean(wsId),
    isLoading,
    'Invalid wallet anticipations payload',
  );
  const totals = isRecord(data) && isWalletAnticipationTotals(data.totals)
    ? data.totals
    : DEFAULT_WALLET_ANTICIPATION_TOTALS;
  const totalsError =
    Boolean(wsId) && data !== undefined && !isLoading && !isWalletAnticipationTotals(isRecord(data) ? data.totals : undefined)
      ? new Error('Invalid wallet anticipations payload')
      : undefined;

  return {
    anticipations,
    totals,
    isLoading,
    error: error ?? payloadError ?? totalsError,
    mutate,
  };
}
