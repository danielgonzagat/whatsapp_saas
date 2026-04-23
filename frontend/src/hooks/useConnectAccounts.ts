'use client';

import { swrFetcher } from '@/lib/fetcher';
import useSWR from 'swr';

import { useWorkspaceId } from './useWorkspaceId';

/** Connect account role type. */
export type ConnectAccountRole = 'SELLER' | 'SUPPLIER' | 'AFFILIATE' | 'COPRODUCER' | 'MANAGER';

/** Connect onboarding status shape. */
export interface ConnectOnboardingStatus {
  /** Stripe account id property. */
  stripeAccountId: string;
  /** Charges enabled property. */
  chargesEnabled: boolean;
  /** Payouts enabled property. */
  payoutsEnabled: boolean;
  /** Details submitted property. */
  detailsSubmitted: boolean;
  /** Requirements currently due property. */
  requirementsCurrentlyDue: string[];
  /** Requirements past due property. */
  requirementsPastDue: string[];
  /** Requirements disabled reason property. */
  requirementsDisabledReason: string | null;
  /** Capabilities property. */
  capabilities: Record<string, string>;
}

/** Workspace connect account shape. */
export interface WorkspaceConnectAccount {
  /** Account balance id property. */
  accountBalanceId: string;
  /** Workspace id property. */
  workspaceId: string;
  /** Stripe account id property. */
  stripeAccountId: string;
  /** Account type property. */
  accountType: ConnectAccountRole;
  /** Pending cents property. */
  pendingCents: string;
  /** Available cents property. */
  availableCents: string;
  /** Lifetime received cents property. */
  lifetimeReceivedCents: string;
  /** Lifetime paid out cents property. */
  lifetimePaidOutCents: string;
  /** Lifetime chargebacks cents property. */
  lifetimeChargebacksCents: string;
  /** Onboarding property. */
  onboarding: ConnectOnboardingStatus | null;
}

interface WorkspaceConnectAccountsResponse {
  accounts?: WorkspaceConnectAccount[];
}

/** Use workspace connect accounts. */
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

/** Use seller connect account. */
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
