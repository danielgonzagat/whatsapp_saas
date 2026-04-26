import { ConnectLedgerReconciliationService } from './connect-ledger-reconciliation.service';

type StubBalance = {
  id: string;
  workspaceId: string;
  stripeAccountId: string;
  accountType: string;
  pendingBalanceCents: bigint;
  availableBalanceCents: bigint;
  lifetimeReceivedCents: bigint;
  lifetimePaidOutCents: bigint;
  lifetimeChargebacksCents: bigint;
};

type StubEntry = {
  id: string;
  accountBalanceId: string;
  type: string;
  amountCents: bigint;
  balanceAfterPendingCents: bigint;
  balanceAfterAvailableCents: bigint;
  referenceType: string;
  referenceId: string;
  matured?: boolean;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
};

function makePrisma({ balances, entries }: { balances: StubBalance[]; entries: StubEntry[] }) {
  return {
    connectAccountBalance: {
      findMany: jest
        .fn()
        .mockImplementation(async ({ where }: { where?: { workspaceId?: string } }) =>
          where?.workspaceId
            ? balances.filter((balance) => balance.workspaceId === where.workspaceId)
            : balances,
        ),
    },
    connectLedgerEntry: {
      findMany: jest
        .fn()
        .mockImplementation(async ({ where }: { where: { accountBalanceId: string } }) =>
          entries
            .filter((entry) => entry.accountBalanceId === where.accountBalanceId)
            .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime()),
        ),
    },
    adminAuditLog: {
      create: jest.fn().mockResolvedValue({ id: 'audit_1' }),
    },
  };
}

describe('ConnectLedgerReconciliationService', () => {
  it('runs the connect reconciliation cron without alerting on success', async () => {
    const prisma = makePrisma({ balances: [], entries: [] });
    const financialAlert = {
      reconciliationAlert: jest.fn(),
    };
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
    const financialAlert = {
      reconciliationAlert: jest.fn(),
    };
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
    const financialAlert = {
      reconciliationAlert: jest.fn(),
    };

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
    const financialAlert = {
      reconciliationAlert: jest.fn(),
    };

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
    const financialAlert = {
      reconciliationAlert: jest.fn(),
    };

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
    const financialAlert = {
      reconciliationAlert: jest.fn(),
    };

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
    const financialAlert = {
      reconciliationAlert: jest.fn(),
    };

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
    const financialAlert = {
      reconciliationAlert: jest.fn(),
    };

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
    const financialAlert = {
      reconciliationAlert: jest.fn(),
    };

    const service = new ConnectLedgerReconciliationService(
      prisma as never,
      financialAlert as never,
    );
    const result = await service.reconcile();

    expect(result.drifts).toHaveLength(0);
  });

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
    const financialAlert = {
      reconciliationAlert: jest.fn(),
    };

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
    const financialAlert = {
      reconciliationAlert: jest.fn(),
    };

    const service = new ConnectLedgerReconciliationService(
      prisma as never,
      financialAlert as never,
    );
    const result = await service.reconcile();

    expect(result.drifts).toHaveLength(0);
  });

  it('returns zero-state when no connect balances exist in scope', async () => {
    const prisma = makePrisma({ balances: [], entries: [] });
    const financialAlert = {
      reconciliationAlert: jest.fn(),
    };

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
