import { ConnectLedgerReconciliationService } from './connect-ledger-reconciliation.service';
import {
  makeFinancialAlertStub,
  makePrisma,
} from './connect-ledger-reconciliation.service.spec-helpers';

/**
 * ConnectLedgerReconciliationService — audit + zero-state behaviours.
 *
 * Covers:
 *   - graceful handling of audit-log persistence failure (drift still
 *     reported, alert raised),
 *   - empty-input fast path returns zero-state without alerting or
 *     persisting an audit row.
 */

describe('ConnectLedgerReconciliationService — audit & zero-state', () => {
  it('handles appendAuditSummary failure gracefully', async () => {
    const prisma = makePrisma({
      balances: [
        {
          id: 'cab_audit_fail',
          workspaceId: 'ws_af',
          stripeAccountId: 'acct_af',
          accountType: 'SELLER',
          pendingBalanceCents: 0n,
          availableBalanceCents: 999n,
          lifetimeReceivedCents: 0n,
          lifetimePaidOutCents: 0n,
          lifetimeChargebacksCents: 0n,
        },
      ],
      entries: [],
    });
    prisma.adminAuditLog.create = jest.fn().mockRejectedValue(new Error('audit boom'));
    const financialAlert = makeFinancialAlertStub();

    const service = new ConnectLedgerReconciliationService(
      prisma as never,
      financialAlert as never,
    );
    const result = await service.reconcile();

    expect(result.drifts).toHaveLength(1);
    expect(financialAlert.reconciliationAlert).toHaveBeenCalledWith(
      'connect ledger reconciliation audit failed',
      expect.objectContaining({
        details: expect.objectContaining({
          error: 'audit boom',
        }),
      }),
    );
  });

  it('returns zero-state when no connect balances exist in scope', async () => {
    const prisma = makePrisma({ balances: [], entries: [] });
    const financialAlert = makeFinancialAlertStub();

    const service = new ConnectLedgerReconciliationService(
      prisma as never,
      financialAlert as never,
    );
    const result = await service.reconcile();

    expect(result.scannedAccounts).toBe(0);
    expect(result.drifts).toHaveLength(0);
    expect(financialAlert.reconciliationAlert).not.toHaveBeenCalled();
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });
});
