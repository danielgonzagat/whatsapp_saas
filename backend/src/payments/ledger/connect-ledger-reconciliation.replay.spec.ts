import { ConnectLedgerReconciliationService } from './connect-ledger-reconciliation.service';
import {
  makeFinancialAlertStub,
  makePrisma,
} from './connect-ledger-reconciliation.service.spec-helpers';

/**
 * ConnectLedgerReconciliationService — entry-type replay coverage.
 *
 * Each test exercises a specific kind of `ConnectLedgerEntry` so that the
 * replay-engine can be validated end-to-end:
 *   - DEBIT_CHARGEBACK with numeric vs string metadata,
 *   - DEBIT_REFUND replay,
 *   - unknown entry types should not produce drift.
 */

describe('ConnectLedgerReconciliationService — entry replay', () => {
  it('replays chargeback entries with numeric metadata absorption values', async () => {
    const prisma = makePrisma({
      balances: [
        {
          id: 'cab_num',
          workspaceId: 'ws_n',
          stripeAccountId: 'acct_num',
          accountType: 'SELLER',
          pendingBalanceCents: 0n,
          availableBalanceCents: 900n,
          lifetimeReceivedCents: 1000n,
          lifetimePaidOutCents: 0n,
          lifetimeChargebacksCents: 100n,
        },
      ],
      entries: [
        {
          id: 'e1',
          accountBalanceId: 'cab_num',
          type: 'CREDIT_PENDING',
          amountCents: 1000n,
          balanceAfterPendingCents: 1000n,
          balanceAfterAvailableCents: 0n,
          referenceType: 'sale',
          referenceId: 'pi_num',
          matured: true,
          metadata: null,
          createdAt: new Date('2026-04-19T00:00:00Z'),
        },
        {
          id: 'e2',
          accountBalanceId: 'cab_num',
          type: 'MATURE',
          amountCents: 1000n,
          balanceAfterPendingCents: 0n,
          balanceAfterAvailableCents: 1000n,
          referenceType: 'sale',
          referenceId: 'pi_num',
          metadata: null,
          createdAt: new Date('2026-04-20T00:00:00Z'),
        },
        {
          id: 'e3',
          accountBalanceId: 'cab_num',
          type: 'DEBIT_CHARGEBACK',
          amountCents: 100n,
          balanceAfterPendingCents: 0n,
          balanceAfterAvailableCents: 900n,
          referenceType: 'dispute',
          referenceId: 'dp_num',
          metadata: {
            absorbedFromPendingCents: 0,
            absorbedFromAvailableCents: 100,
          },
          createdAt: new Date('2026-04-21T00:00:00Z'),
        },
      ],
    });
    const financialAlert = makeFinancialAlertStub();

    const service = new ConnectLedgerReconciliationService(
      prisma as never,
      financialAlert as never,
    );
    const result = await service.reconcile();

    expect(result.drifts).toHaveLength(0);
  });

  it('replays chargeback entries with string metadata absorption values', async () => {
    const prisma = makePrisma({
      balances: [
        {
          id: 'cab_str',
          workspaceId: 'ws_s',
          stripeAccountId: 'acct_str',
          accountType: 'SELLER',
          pendingBalanceCents: 0n,
          availableBalanceCents: 900n,
          lifetimeReceivedCents: 1000n,
          lifetimePaidOutCents: 0n,
          lifetimeChargebacksCents: 100n,
        },
      ],
      entries: [
        {
          id: 'e1',
          accountBalanceId: 'cab_str',
          type: 'CREDIT_PENDING',
          amountCents: 1000n,
          balanceAfterPendingCents: 1000n,
          balanceAfterAvailableCents: 0n,
          referenceType: 'sale',
          referenceId: 'pi_str',
          matured: true,
          metadata: null,
          createdAt: new Date('2026-04-19T00:00:00Z'),
        },
        {
          id: 'e2',
          accountBalanceId: 'cab_str',
          type: 'MATURE',
          amountCents: 1000n,
          balanceAfterPendingCents: 0n,
          balanceAfterAvailableCents: 1000n,
          referenceType: 'sale',
          referenceId: 'pi_str',
          metadata: null,
          createdAt: new Date('2026-04-20T00:00:00Z'),
        },
        {
          id: 'e3',
          accountBalanceId: 'cab_str',
          type: 'DEBIT_CHARGEBACK',
          amountCents: 100n,
          balanceAfterPendingCents: 0n,
          balanceAfterAvailableCents: 900n,
          referenceType: 'dispute',
          referenceId: 'dp_str',
          metadata: {
            absorbedFromPendingCents: '0',
            absorbedFromAvailableCents: '100',
          },
          createdAt: new Date('2026-04-21T00:00:00Z'),
        },
      ],
    });
    const financialAlert = makeFinancialAlertStub();

    const service = new ConnectLedgerReconciliationService(
      prisma as never,
      financialAlert as never,
    );
    const result = await service.reconcile();

    expect(result.drifts).toHaveLength(0);
  });

  it('handles unknown entry types gracefully without drifting', async () => {
    const prisma = makePrisma({
      balances: [
        {
          id: 'cab_unk',
          workspaceId: 'ws_u',
          stripeAccountId: 'acct_unk',
          accountType: 'SELLER',
          pendingBalanceCents: 0n,
          availableBalanceCents: 0n,
          lifetimeReceivedCents: 0n,
          lifetimePaidOutCents: 0n,
          lifetimeChargebacksCents: 0n,
        },
      ],
      entries: [
        {
          id: 'e_unk',
          accountBalanceId: 'cab_unk',
          type: 'UNKNOWN_TYPE',
          amountCents: 100n,
          balanceAfterPendingCents: 0n,
          balanceAfterAvailableCents: 0n,
          referenceType: 'test',
          referenceId: 'test_1',
          metadata: null,
          createdAt: new Date('2026-04-19T00:00:00Z'),
        },
      ],
    });
    const financialAlert = makeFinancialAlertStub();

    const service = new ConnectLedgerReconciliationService(
      prisma as never,
      financialAlert as never,
    );
    const result = await service.reconcile();

    expect(result.drifts).toHaveLength(0);
  });

  it('replays DEBIT_REFUND entries correctly', async () => {
    const prisma = makePrisma({
      balances: [
        {
          id: 'cab_refund',
          workspaceId: 'ws_r',
          stripeAccountId: 'acct_r',
          accountType: 'SELLER',
          pendingBalanceCents: 0n,
          availableBalanceCents: 0n,
          lifetimeReceivedCents: 1000n,
          lifetimePaidOutCents: 0n,
          lifetimeChargebacksCents: 0n,
        },
      ],
      entries: [
        {
          id: 'e1',
          accountBalanceId: 'cab_refund',
          type: 'CREDIT_PENDING',
          amountCents: 1000n,
          balanceAfterPendingCents: 1000n,
          balanceAfterAvailableCents: 0n,
          referenceType: 'sale',
          referenceId: 'pi_r',
          matured: true,
          metadata: null,
          createdAt: new Date('2026-04-19T00:00:00Z'),
        },
        {
          id: 'e2',
          accountBalanceId: 'cab_refund',
          type: 'MATURE',
          amountCents: 1000n,
          balanceAfterPendingCents: 0n,
          balanceAfterAvailableCents: 1000n,
          referenceType: 'sale',
          referenceId: 'pi_r',
          metadata: null,
          createdAt: new Date('2026-04-20T00:00:00Z'),
        },
        {
          id: 'e3',
          accountBalanceId: 'cab_refund',
          type: 'DEBIT_REFUND',
          amountCents: 1000n,
          balanceAfterPendingCents: 0n,
          balanceAfterAvailableCents: 0n,
          referenceType: 'refund',
          referenceId: 're_r',
          metadata: {
            absorbedFromPendingCents: '0',
            absorbedFromAvailableCents: '1000',
          },
          createdAt: new Date('2026-04-21T00:00:00Z'),
        },
      ],
    });
    const financialAlert = makeFinancialAlertStub();

    const service = new ConnectLedgerReconciliationService(
      prisma as never,
      financialAlert as never,
    );
    const result = await service.reconcile();

    expect(result.drifts).toHaveLength(0);
  });

  it('replays chargeback entries with numeric metadata (toBigInt number branch)', async () => {
    const prisma = makePrisma({
      balances: [
        {
          id: 'cab_num_meta',
          workspaceId: 'ws_nm',
          stripeAccountId: 'acct_nm',
          accountType: 'SELLER',
          pendingBalanceCents: 0n,
          availableBalanceCents: 500n,
          lifetimeReceivedCents: 1000n,
          lifetimePaidOutCents: 0n,
          lifetimeChargebacksCents: 500n,
        },
      ],
      entries: [
        {
          id: 'e1',
          accountBalanceId: 'cab_num_meta',
          type: 'CREDIT_PENDING',
          amountCents: 1000n,
          balanceAfterPendingCents: 1000n,
          balanceAfterAvailableCents: 0n,
          referenceType: 'sale',
          referenceId: 'pi_nm',
          matured: true,
          metadata: null,
          createdAt: new Date('2026-04-19T00:00:00Z'),
        },
        {
          id: 'e2',
          accountBalanceId: 'cab_num_meta',
          type: 'MATURE',
          amountCents: 1000n,
          balanceAfterPendingCents: 0n,
          balanceAfterAvailableCents: 1000n,
          referenceType: 'sale',
          referenceId: 'pi_nm',
          metadata: null,
          createdAt: new Date('2026-04-20T00:00:00Z'),
        },
        {
          id: 'e3',
          accountBalanceId: 'cab_num_meta',
          type: 'DEBIT_CHARGEBACK',
          amountCents: 500n,
          balanceAfterPendingCents: 0n,
          balanceAfterAvailableCents: 500n,
          referenceType: 'dispute',
          referenceId: 'dp_nm',
          metadata: {
            absorbedFromPendingCents: 0,
            absorbedFromAvailableCents: 500,
          },
          createdAt: new Date('2026-04-21T00:00:00Z'),
        },
      ],
    });
    const financialAlert = makeFinancialAlertStub();

    const service = new ConnectLedgerReconciliationService(
      prisma as never,
      financialAlert as never,
    );
    const result = await service.reconcile();

    expect(result.drifts).toHaveLength(0);
  });
});
