/**
 * Shared test fixtures for the ConnectLedgerReconciliationService spec
 * suite.
 *
 * Each spec file constructs its own balances/entries and the service is a
 * plain `new` call — there is no Nest module boilerplate, only stubs that
 * mirror the Prisma surface that the reconciliation service touches.
 */

export type StubBalance = {
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

export type StubEntry = {
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

export function makePrisma({
  balances,
  entries,
}: {
  balances: StubBalance[];
  entries: StubEntry[];
}) {
  return {
    connectAccountBalance: {
      findMany: jest
        .fn()
        .mockImplementation(({ where }: { where?: { workspaceId?: string } }) =>
          where?.workspaceId
            ? balances.filter((balance) => balance.workspaceId === where.workspaceId)
            : balances,
        ),
    },
    connectLedgerEntry: {
      findMany: jest
        .fn()
        .mockImplementation(({ where }: { where: { accountBalanceId: string } }) =>
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

export function makeFinancialAlertStub() {
  return {
    reconciliationAlert: jest.fn(),
  };
}
