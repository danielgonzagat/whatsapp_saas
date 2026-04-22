'use client';

import { swrFetcher } from '@/lib/fetcher';
import useSWR from 'swr';

import { useWorkspaceId } from './useWorkspaceId';

export type ConnectAccountRole = 'SELLER' | 'SUPPLIER' | 'AFFILIATE' | 'COPRODUCER' | 'MANAGER';

export interface ConnectOnboardingStatus {
  stripeAccountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsCurrentlyDue: string[];
  requirementsPastDue: string[];
  requirementsDisabledReason: string | null;
  capabilities: Record<string, string>;
}

export interface WorkspaceConnectAccount {
  accountBalanceId: string;
  workspaceId: string;
  stripeAccountId: string;
  accountType: ConnectAccountRole;
  pendingCents: string;
  availableCents: string;
  lifetimeReceivedCents: string;
  lifetimePaidOutCents: string;
  lifetimeChargebacksCents: string;
  onboarding: ConnectOnboardingStatus | null;
}

interface WorkspaceConnectAccountsResponse {
  accounts?: WorkspaceConnectAccount[];
}

export function useWorkspaceConnectAccounts() {
  const workspaceId = useWorkspaceId();
  const { data, error, isLoading, mutate } = useSWR<WorkspaceConnectAccountsResponse>(
    workspaceId ? `/payments/connect/${workspaceId}/accounts` : null,
    swrFetcher,
    {
      keepPreviousData: true,
      dedupingInterval: 30000,
      revalidateOnFocus: false,
    },
  );

  return {
    accounts: data?.accounts || [],
    isLoading,
    error,
    mutate,
  };
}

export function useSellerConnectAccount() {
  const { accounts, isLoading, error, mutate } = useWorkspaceConnectAccounts();

  return {
    sellerAccount: accounts.find((account) => account.accountType === 'SELLER') || null,
    accounts,
    isLoading,
    error,
    mutate,
  };
}
