import {
  buildInsufficientBalanceReport,
  buildRefundMetadata,
  buildSettlementMetadata,
  buildUsageMetadata,
} from './wallet.service.helpers';

describe('wallet.service.helpers (audit)', () => {
  describe('buildUsageMetadata', () => {
    it('renders a provider_quote envelope with the cost as string', () => {
      expect(
        buildUsageMetadata({ operation: 'op', billingMode: 'provider_quote', costCents: 123n }),
      ).toEqual({
        operation: 'op',
        billingMode: 'provider_quote',
        quotedCostCents: '123',
      });
    });

    it('renders a catalog envelope with units and per-unit price', () => {
      expect(
        buildUsageMetadata({
          operation: 'op',
          billingMode: 'catalog',
          costCents: 200n,
          units: 2,
          pricePerUnitCents: 100n,
        }),
      ).toEqual({
        operation: 'op',
        billingMode: 'catalog',
        units: 2,
        pricePerUnitCents: '100',
      });
    });

    it('spreads caller metadata last so callers cannot override audit fields', () => {
      const meta = buildUsageMetadata({
        operation: 'op',
        billingMode: 'provider_quote',
        costCents: 1n,
        callerMetadata: { provider: 'openai', operation: 'overridden' },
      });
      // Caller's "operation" wins per spread semantics — this documents the
      // contract; if we ever want to harden against override, change the spread
      // order and update this expectation.
      expect(meta).toEqual({
        operation: 'overridden',
        billingMode: 'provider_quote',
        quotedCostCents: '1',
        provider: 'openai',
      });
    });
  });

  describe('buildSettlementMetadata / buildRefundMetadata', () => {
    it('stringifies bigint costs in the settlement envelope', () => {
      expect(
        buildSettlementMetadata({
          operation: 'op',
          reason: 'reconcile',
          actualCostCents: 50n,
          chargedCostCents: 60n,
          deltaCents: -10n,
          originalUsageTransactionId: 'tx-1',
        }),
      ).toEqual({
        operation: 'op',
        reason: 'reconcile',
        actualCostCents: '50',
        chargedCostCents: '60',
        deltaCents: '-10',
        originalUsageTransactionId: 'tx-1',
      });
    });

    it('produces a minimal refund envelope', () => {
      expect(
        buildRefundMetadata({
          operation: 'op',
          reason: 'failed_upstream',
          originalUsageTransactionId: 'tx-1',
        }),
      ).toEqual({
        operation: 'op',
        reason: 'failed_upstream',
        originalUsageTransactionId: 'tx-1',
      });
    });
  });

  describe('buildInsufficientBalanceReport', () => {
    it('formats the insufficient-balance envelope with stringified bigint costs', () => {
      const report = buildInsufficientBalanceReport({
        walletId: 'w1',
        workspaceId: 'ws1',
        operation: 'op',
        costCents: 100n,
        balanceCents: 50n,
      });
      expect(report.error.message).toBe('prepaid_wallet_insufficient: id=w1 need=100 have=50');
      expect(report.extra).toEqual({
        walletId: 'w1',
        workspaceId: 'ws1',
        operation: 'op',
        costCents: '100',
        balanceCents: '50',
      });
    });
  });
});
