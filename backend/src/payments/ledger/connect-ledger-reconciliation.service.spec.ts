import { ConnectLedgerReconciliationService } from './connect-ledger-reconciliation.service';
import {
  makeFinancialAlertStub,
  makePrisma,
} from './connect-ledger-reconciliation.service.spec-helpers';

/**
 * ConnectLedgerReconciliationService — primary lifecycle.
 *
 * Covers the cron entrypoint (success + failure) and the two main
 * reconciliation outcomes: healthy state and drift detection. Replays of
 * specific entry types and audit failure handling live in sibling spec
 * files (see connect-ledger-reconciliation.replay.spec.ts and
 * connect-ledger-reconciliation.audit.spec.ts).
 */

describe('ConnectLedgerReconciliationService — cron + core reconciliation', () => {
  it('runs the connect reconciliation cron without alerting on success', async () => {
    const prisma = makePrisma({ balances: [], entries: [] });
    const financialAlert = makeFinancialAlertStub();
    const service = new ConnectLedgerReconciliationService(
      prisma as never,
      financialAlert as never,
    );
    const reconcileSpy = jest.spyOn(service, 'reconcile').mockResolvedValue({
      scannedAccounts: 0,
      drifts: [],
      scannedAt: new Date().toISOString(),
    });

    await service.runCron();

    expect(reconcileSpy).toHaveBeenCalledWith();
    expect(financialAlert.reconciliationAlert).not.toHaveBeenCalled();
  });

  it('alerts when the connect reconciliation cron itself fails', async () => {
    const prisma = makePrisma({ balances: [], entries: [] });
    const financialAlert = makeFinancialAlertStub();
    const service = new ConnectLedgerReconciliationService(
      prisma as never,
      financialAlert as never,
    );
    jest.spyOn(service, 'reconcile').mockRejectedValue(new Error('connect cron boom'));

    await service.runCron();

    expect(financialAlert.reconciliationAlert).toHaveBeenCalledWith(
      'connect ledger reconciliation cron failed',
      {
        details: {
          error: 'connect cron boom',
        },
      },
    );
  });

  it('reports healthy state when ledger replay matches the materialised connect balances', async () => {
    const prisma = makePrisma({
      balances: [
        {
          id: 'cab_seller',
          workspaceId: 'ws_1',
          stripeAccountId: 'acct_seller',
          accountType: 'SELLER',
          pendingBalanceCents: 0n,
          availableBalanceCents: 750n,
          lifetimeReceivedCents: 1000n,
          lifetimePaidOutCents: 200n,
          lifetimeChargebacksCents: 50n,
        },
      ],
      entries: [
        {
          id: 'e1',
          accountBalanceId: 'cab_seller',
          type: 'CREDIT_PENDING',
          amountCents: 1000n,
          balanceAfterPendingCents: 1000n,
          balanceAfterAvailableCents: 0n,
          referenceType: 'sale',
          referenceId: 'pi_1',
          matured: true,
          metadata: null,
          createdAt: new Date('2026-04-19T00:00:00Z'),
        },
        {
          id: 'e2',
          accountBalanceId: 'cab_seller',
          type: 'MATURE',
          amountCents: 1000n,
          balanceAfterPendingCents: 0n,
          balanceAfterAvailableCents: 1000n,
          referenceType: 'sale',
          referenceId: 'pi_1',
          metadata: { promotedFromEntryId: 'e1' },
          createdAt: new Date('2026-04-20T00:00:00Z'),
        },
        {
          id: 'e3',
          accountBalanceId: 'cab_seller',
          type: 'DEBIT_PAYOUT',
          amountCents: 300n,
          balanceAfterPendingCents: 0n,
          balanceAfterAvailableCents: 700n,
          referenceType: 'payout',
          referenceId: 'po_1',
          metadata: null,
          createdAt: new Date('2026-04-21T00:00:00Z'),
        },
        {
          id: 'e4',
          accountBalanceId: 'cab_seller',
          type: 'ADJUSTMENT',
          amountCents: 100n,
          balanceAfterPendingCents: 0n,
          balanceAfterAvailableCents: 800n,
          referenceType: 'payout_failed',
          referenceId: 'po_1',
          metadata: null,
          createdAt: new Date('2026-04-22T00:00:00Z'),
        },
        {
          id: 'e5',
          accountBalanceId: 'cab_seller',
          type: 'DEBIT_CHARGEBACK',
          amountCents: 50n,
          balanceAfterPendingCents: 0n,
          balanceAfterAvailableCents: 750n,
          referenceType: 'dispute',
          referenceId: 'dp_1',
          metadata: {
            absorbedFromPendingCents: '0',
            absorbedFromAvailableCents: '50',
          },
          createdAt: new Date('2026-04-23T00:00:00Z'),
        },
      ],
    });
    const financialAlert = makeFinancialAlertStub();

    const service = new ConnectLedgerReconciliationService(
      prisma as never,
      financialAlert as never,
    );
    const result = await service.reconcile();

    expect(result.scannedAccounts).toBe(1);
    expect(result.drifts).toHaveLength(0);
    expect(financialAlert.reconciliationAlert).not.toHaveBeenCalled();
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it('flags drift when a stored connect balance diverges from the replayed ledger state', async () => {
    const prisma = makePrisma({
      balances: [
        {
          id: 'cab_affiliate',
          workspaceId: 'ws_2',
          stripeAccountId: 'acct_affiliate',
          accountType: 'AFFILIATE',
          pendingBalanceCents: 0n,
          availableBalanceCents: 999n,
          lifetimeReceivedCents: 1500n,
          lifetimePaidOutCents: 400n,
          lifetimeChargebacksCents: 0n,
        },
      ],
      entries: [
        {
          id: 'e1',
          accountBalanceId: 'cab_affiliate',
          type: 'CREDIT_PENDING',
          amountCents: 1500n,
          balanceAfterPendingCents: 1500n,
          balanceAfterAvailableCents: 0n,
          referenceType: 'sale',
          referenceId: 'pi_aff_1',
          matured: true,
          metadata: null,
          createdAt: new Date('2026-04-19T00:00:00Z'),
        },
        {
          id: 'e2',
          accountBalanceId: 'cab_affiliate',
          type: 'MATURE',
          amountCents: 1500n,
          balanceAfterPendingCents: 0n,
          balanceAfterAvailableCents: 1500n,
          referenceType: 'sale',
          referenceId: 'pi_aff_1',
          metadata: null,
          createdAt: new Date('2026-04-20T00:00:00Z'),
        },
        {
          id: 'e3',
          accountBalanceId: 'cab_affiliate',
          type: 'DEBIT_PAYOUT',
          amountCents: 250n,
          balanceAfterPendingCents: 0n,
          balanceAfterAvailableCents: 1250n,
          referenceType: 'payout',
          referenceId: 'po_aff_1',
          metadata: null,
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

    expect(result.scannedAccounts).toBe(1);
    expect(result.drifts).toHaveLength(1);
    expect(result.drifts[0]).toEqual({
      accountBalanceId: 'cab_affiliate',
      workspaceId: 'ws_2',
      stripeAccountId: 'acct_affiliate',
      accountType: 'AFFILIATE',
      kind: 'connect_balance_ledger_mismatch',
      details: {
        pending: { stored: '0', ledger: '0' },
        available: { stored: '999', ledger: '1250' },
        lifetimeReceived: { stored: '1500', ledger: '1500' },
        lifetimePaidOut: { stored: '400', ledger: '250' },
        lifetimeChargebacks: { stored: '0', ledger: '0' },
        entryCount: 3,
      },
    });
    expect(financialAlert.reconciliationAlert).toHaveBeenCalledWith(
      'connect ledger reconciliation drift detected',
      {
        details: {
          scannedAccounts: 1,
          driftCount: 1,
        },
      },
    );
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: {
        action: 'system.connect.reconcile_drift',
        entityType: 'connect_account_balance',
        details: {
          scannedAccounts: 1,
          driftCount: 1,
          sampleDrifts: [
            {
              accountBalanceId: 'cab_affiliate',
              workspaceId: 'ws_2',
              stripeAccountId: 'acct_affiliate',
              accountType: 'AFFILIATE',
              kind: 'connect_balance_ledger_mismatch',
              details: {
                pending: { stored: '0', ledger: '0' },
                available: { stored: '999', ledger: '1250' },
                lifetimeReceived: { stored: '1500', ledger: '1500' },
                lifetimePaidOut: { stored: '400', ledger: '250' },
                lifetimeChargebacks: { stored: '0', ledger: '0' },
                entryCount: 3,
              },
            },
          ],
        },
      },
    });
  });

  it('supports workspace-scoped reconciliation without scanning other workspaces', async () => {
    const prisma = makePrisma({
      balances: [
        {
          id: 'cab_ws_1',
          workspaceId: 'ws_1',
          stripeAccountId: 'acct_1',
          accountType: 'SELLER',
          pendingBalanceCents: 0n,
          availableBalanceCents: 500n,
          lifetimeReceivedCents: 500n,
          lifetimePaidOutCents: 0n,
          lifetimeChargebacksCents: 0n,
        },
        {
          id: 'cab_ws_2',
          workspaceId: 'ws_2',
          stripeAccountId: 'acct_2',
          accountType: 'AFFILIATE',
          pendingBalanceCents: 0n,
          availableBalanceCents: 999n,
          lifetimeReceivedCents: 500n,
          lifetimePaidOutCents: 0n,
          lifetimeChargebacksCents: 0n,
        },
      ],
      entries: [
        {
          id: 'e1',
          accountBalanceId: 'cab_ws_1',
          type: 'CREDIT_PENDING',
          amountCents: 500n,
          balanceAfterPendingCents: 500n,
          balanceAfterAvailableCents: 0n,
          referenceType: 'sale',
          referenceId: 'pi_1',
          matured: true,
          metadata: null,
          createdAt: new Date('2026-04-19T00:00:00Z'),
        },
        {
          id: 'e2',
          accountBalanceId: 'cab_ws_1',
          type: 'MATURE',
          amountCents: 500n,
          balanceAfterPendingCents: 0n,
          balanceAfterAvailableCents: 500n,
          referenceType: 'sale',
          referenceId: 'pi_1',
          metadata: null,
          createdAt: new Date('2026-04-20T00:00:00Z'),
        },
        {
          id: 'e3',
          accountBalanceId: 'cab_ws_2',
          type: 'CREDIT_PENDING',
          amountCents: 500n,
          balanceAfterPendingCents: 500n,
          balanceAfterAvailableCents: 0n,
          referenceType: 'sale',
          referenceId: 'pi_2',
          matured: true,
          metadata: null,
          createdAt: new Date('2026-04-19T00:00:00Z'),
        },
        {
          id: 'e4',
          accountBalanceId: 'cab_ws_2',
          type: 'MATURE',
          amountCents: 500n,
          balanceAfterPendingCents: 0n,
          balanceAfterAvailableCents: 500n,
          referenceType: 'sale',
          referenceId: 'pi_2',
          metadata: null,
          createdAt: new Date('2026-04-20T00:00:00Z'),
        },
      ],
    });
    const financialAlert = makeFinancialAlertStub();

    const service = new ConnectLedgerReconciliationService(
      prisma as never,
      financialAlert as never,
    );
    const result = await service.reconcile({ workspaceId: 'ws_1' });

    expect(result.scannedAccounts).toBe(1);
    expect(result.drifts).toHaveLength(0);
    expect(prisma.connectAccountBalance.findMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws_1' },
      orderBy: [{ workspaceId: 'asc' }, { accountType: 'asc' }, { createdAt: 'asc' }],
      take: 5000,
    });
  });
});
