import {
  buildTreasuryPayoutFailedDetails,
  buildTreasuryPayoutRequestedDetails,
  buildTreasuryPayoutResponse,
  mapConnectAccount,
  type ConnectAccountBalanceLike,
  type ConnectBalanceSnapshotLike,
  type TreasuryPayoutLike,
} from './admin-carteira.controller.helpers';

describe('admin-carteira.controller.helpers — connect & treasury', () => {
  describe('mapConnectAccount', () => {
    it('stringifies every BigInt and inlines the onboarding blob', () => {
      const balance: ConnectAccountBalanceLike = {
        id: 'cab_seller',
        workspaceId: 'ws-1',
        stripeAccountId: 'acct_seller',
        accountType: 'SELLER',
      };
      const snapshot: ConnectBalanceSnapshotLike = {
        pendingCents: 100n,
        availableCents: 200n,
        lifetimeReceivedCents: 900n,
        lifetimePaidOutCents: 300n,
        lifetimeChargebacksCents: 0n,
      };
      const onboarding = { chargesEnabled: true };

      expect(mapConnectAccount(balance, snapshot, onboarding)).toEqual({
        accountBalanceId: 'cab_seller',
        workspaceId: 'ws-1',
        stripeAccountId: 'acct_seller',
        accountType: 'SELLER',
        pendingCents: '100',
        availableCents: '200',
        lifetimeReceivedCents: '900',
        lifetimePaidOutCents: '300',
        lifetimeChargebacksCents: '0',
        onboarding: { chargesEnabled: true },
      });
    });

    it('preserves a null onboarding blob', () => {
      const result = mapConnectAccount(
        {
          id: 'cab_seller',
          workspaceId: 'ws-1',
          stripeAccountId: 'acct_seller',
          accountType: 'SELLER',
        },
        {
          pendingCents: 0n,
          availableCents: 0n,
          lifetimeReceivedCents: 0n,
          lifetimePaidOutCents: 0n,
          lifetimeChargebacksCents: 0n,
        },
        null,
      );
      expect(result.onboarding).toBeNull();
    });
  });

  describe('buildTreasuryPayoutResponse', () => {
    it('shapes the success body with stringified amount', () => {
      const result: TreasuryPayoutLike = {
        payoutId: 'po_1',
        status: 'pending',
        amountCents: 5000n,
        currency: 'BRL',
      };
      expect(buildTreasuryPayoutResponse(result)).toEqual({
        success: true,
        payoutId: 'po_1',
        status: 'pending',
        amountCents: '5000',
        currency: 'BRL',
      });
    });
  });

  describe('buildTreasuryPayoutRequestedDetails', () => {
    it('echoes the request id and stringifies the BigInt amount', () => {
      const details = buildTreasuryPayoutRequestedDetails({
        requestId: 'req_1',
        result: {
          payoutId: 'po_1',
          status: 'pending',
          amountCents: 5000n,
          currency: 'BRL',
        },
      });
      expect(details).toEqual({
        requestId: 'req_1',
        payoutId: 'po_1',
        status: 'pending',
        amountCents: '5000',
      });
    });
  });

  describe('buildTreasuryPayoutFailedDetails', () => {
    it('captures an Error message verbatim', () => {
      const details = buildTreasuryPayoutFailedDetails({
        requestId: 'req_1',
        amountCents: 5000,
        currency: 'BRL',
        error: new Error('gateway down'),
      });
      expect(details).toEqual({
        requestId: 'req_1',
        amountCents: '5000',
        currency: 'BRL',
        error: 'gateway down',
      });
    });

    it('captures a non-Error value as a string', () => {
      const details = buildTreasuryPayoutFailedDetails({
        requestId: 'req_1',
        amountCents: 5000,
        currency: 'BRL',
        error: { code: 'timeout' },
      });
      expect(details.error).toBe('[object Object]');
    });
  });
});
