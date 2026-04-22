import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('swr', () => ({
  default: vi.fn(() => ({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() })),
}));

vi.mock('@/lib/fetcher', () => ({
  swrFetcher: vi.fn(),
}));

vi.mock('@/hooks/useWorkspaceId', () => ({
  useWorkspaceId: () => 'test-workspace-id',
}));

import useSWR from 'swr';

import { useSellerConnectAccount, useWorkspaceConnectAccounts } from '../useConnectAccounts';

describe('useWorkspaceConnectAccounts', () => {
  beforeEach(() => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });
  });

  it('returns an empty list while loading', () => {
    const { result } = renderHook(() => useWorkspaceConnectAccounts());

    expect(result.current.accounts).toEqual([]);
    expect(result.current.isLoading).toBe(true);
    expect(vi.mocked(useSWR)).toHaveBeenCalledWith(
      '/payments/connect/test-workspace-id/accounts',
      expect.any(Function),
      expect.objectContaining({
        dedupingInterval: 30000,
        keepPreviousData: true,
        revalidateOnFocus: false,
      }),
    );
  });

  it('unwraps accounts from the backend payload', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: {
        accounts: [
          {
            accountBalanceId: 'cab_1',
            workspaceId: 'ws_1',
            stripeAccountId: 'acct_1',
            accountType: 'SELLER',
            pendingCents: '1000',
            availableCents: '500',
            lifetimeReceivedCents: '1500',
            lifetimePaidOutCents: '0',
            lifetimeChargebacksCents: '0',
            onboarding: null,
          },
        ],
      },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useWorkspaceConnectAccounts());

    expect(result.current.accounts).toHaveLength(1);
    expect(result.current.accounts[0]?.accountType).toBe('SELLER');
    expect(result.current.isLoading).toBe(false);
  });
});

describe('useSellerConnectAccount', () => {
  it('returns only the seller account when multiple roles exist', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: {
        accounts: [
          {
            accountBalanceId: 'cab_aff',
            workspaceId: 'ws_1',
            stripeAccountId: 'acct_aff',
            accountType: 'AFFILIATE',
            pendingCents: '0',
            availableCents: '0',
            lifetimeReceivedCents: '0',
            lifetimePaidOutCents: '0',
            lifetimeChargebacksCents: '0',
            onboarding: null,
          },
          {
            accountBalanceId: 'cab_seller',
            workspaceId: 'ws_1',
            stripeAccountId: 'acct_seller',
            accountType: 'SELLER',
            pendingCents: '0',
            availableCents: '0',
            lifetimeReceivedCents: '0',
            lifetimePaidOutCents: '0',
            lifetimeChargebacksCents: '0',
            onboarding: {
              stripeAccountId: 'acct_seller',
              chargesEnabled: true,
              payoutsEnabled: true,
              detailsSubmitted: true,
              requirementsCurrentlyDue: [],
              requirementsPastDue: [],
              requirementsDisabledReason: null,
              capabilities: {},
            },
          },
        ],
      },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useSellerConnectAccount());

    expect(result.current.sellerAccount?.accountBalanceId).toBe('cab_seller');
    expect(result.current.accounts).toHaveLength(2);
  });
});
