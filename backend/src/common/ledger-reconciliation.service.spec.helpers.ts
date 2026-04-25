/**
 * Shared test helpers for the LedgerReconciliationService spec suite.
 *
 * The reconciliation specs cover three independent invariants (I8 checkout
 * consistency, I12 wallet/ledger consistency and the wallet append-only / audit
 * trail behaviour). They all need the same Prisma mock surface, so the typed
 * builder lives here to keep each spec file under the architecture line cap.
 */

export type LedgerPrismaMock = {
  checkoutOrder: {
    findMany: jest.Mock;
  };
  webhookEvent: {
    findFirst: jest.Mock;
  };
  kloelWallet: {
    findMany: jest.Mock;
  };
  kloelWalletLedger: {
    groupBy: jest.Mock;
  };
  adminAuditLog: {
    create: jest.Mock;
  };
};

export type LedgerPrismaOverrides = Partial<{
  checkoutOrder: Partial<LedgerPrismaMock['checkoutOrder']>;
  webhookEvent: Partial<LedgerPrismaMock['webhookEvent']>;
  kloelWallet: Partial<LedgerPrismaMock['kloelWallet']>;
  kloelWalletLedger: Partial<LedgerPrismaMock['kloelWalletLedger']>;
  adminAuditLog: Partial<LedgerPrismaMock['adminAuditLog']>;
}>;

export function makePrisma(overrides: LedgerPrismaOverrides = {}): LedgerPrismaMock {
  return {
    checkoutOrder: {
      findMany: jest.fn().mockResolvedValue([]),
      ...overrides.checkoutOrder,
    },
    webhookEvent: {
      findFirst: jest.fn().mockResolvedValue(null),
      ...overrides.webhookEvent,
    },
    kloelWallet: {
      findMany: jest.fn().mockResolvedValue([]),
      ...overrides.kloelWallet,
    },
    kloelWalletLedger: {
      groupBy: jest.fn().mockResolvedValue([]),
      ...overrides.kloelWalletLedger,
    },
    adminAuditLog: {
      create: jest.fn().mockResolvedValue({ id: 'audit_1' }),
      ...overrides.adminAuditLog,
    },
  };
}
