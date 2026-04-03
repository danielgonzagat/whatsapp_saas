'use client';

import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';
import { apiFetch } from '@/lib/api';
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

interface MercadoPagoConnectionStatus {
  connected: boolean;
  provider: 'mercado_pago';
  checkoutEnabled: boolean;
  platformManaged?: boolean;
  reason?: string;
  marketplaceFeePercent?: number;
  seller?: {
    id?: number | string;
    nickname?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    countryId?: string;
  } | null;
  publicKey?: string | null;
  liveMode?: boolean | null;
  connectedAt?: string | null;
  expiresAt?: string | null;
  integrationId?: string | null;
}

export function useWalletBalance() {
  const wsId = useWorkspaceId();
  const { data, error, isLoading, mutate } = useSWR(
    wsId ? `/kloel/wallet/${wsId}/balance` : null,
    swrFetcher,
    { keepPreviousData: true },
  );
  return { balance: data as WalletBalanceResponse | undefined, isLoading, error, mutate };
}

/* ── Mercado Pago connection ── */
export function useMercadoPagoConnection() {
  const wsId = useWorkspaceId();
  const { data, error, isLoading, mutate } = useSWR(
    wsId ? `/kloel/wallet/${wsId}/mercado-pago/status` : null,
    swrFetcher,
    { keepPreviousData: true },
  );

  const connect = async (returnUrl?: string) => {
    if (!wsId) return null;
    const res = await apiFetch<{ authUrl?: string }>(`/kloel/wallet/${wsId}/mercado-pago/connect`, {
      method: 'POST',
      body: returnUrl ? { returnUrl } : {},
    });
    if (res.error) throw new Error(res.error);
    return (res.data as { authUrl?: string } | undefined)?.authUrl || null;
  };

  const disconnect = async () => {
    if (!wsId) return null;
    const res = await apiFetch(`/kloel/wallet/${wsId}/mercado-pago/disconnect`, {
      method: 'DELETE',
    });
    if (res.error) throw new Error(res.error);
    await mutate();
    return res.data;
  };

  return {
    mercadoPago: (data as MercadoPagoConnectionStatus | undefined) || undefined,
    isLoading,
    error,
    mutate,
    connect,
    disconnect,
  };
}

/* ── Wallet transactions ── */
export function useWalletTransactions() {
  const wsId = useWorkspaceId();
  const { data, error, isLoading, mutate } = useSWR(
    wsId ? `/kloel/wallet/${wsId}/transactions` : null,
    swrFetcher,
    { keepPreviousData: true },
  );
  const d = data as WalletTransactionsResponse | WalletTransaction[] | undefined;
  const items: WalletTransaction[] =
    d && typeof d === 'object' && !Array.isArray(d) && 'transactions' in d
      ? d.transactions || []
      : d && typeof d === 'object' && !Array.isArray(d) && 'data' in d
        ? (d as WalletTransactionsResponse).data || []
        : Array.isArray(d)
          ? d
          : [];
  const total =
    d && typeof d === 'object' && !Array.isArray(d) && 'total' in d
      ? ((d as WalletTransactionsResponse).total ?? items.length)
      : items.length;
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
    ((data as Record<string, unknown>)?.accounts as Array<Record<string, unknown>>) || [];

  const addBankAccount = async (dto: Record<string, unknown>) => {
    if (!wsId) return null;
    const res = await apiFetch(`/kloel/wallet/${wsId}/bank-accounts`, {
      method: 'POST',
      body: dto,
    });
    await mutate();
    return res;
  };

  const removeBankAccount = async (id: string) => {
    if (!wsId) return;
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
