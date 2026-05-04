import { ConnectController } from '../connect.controller';

export function buildController() {
  const prisma = {
    connectAccountBalance: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'cab_seller',
          workspaceId: 'ws-1',
          stripeAccountId: 'acct_seller',
          accountType: 'SELLER',
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
        {
          id: 'cab_affiliate',
          workspaceId: 'ws-1',
          stripeAccountId: 'acct_affiliate',
          accountType: 'AFFILIATE',
          createdAt: new Date('2026-01-02T00:00:00Z'),
        },
      ]),
      findFirst: jest.fn().mockResolvedValue({
        id: 'cab_seller',
        workspaceId: 'ws-1',
        stripeAccountId: 'acct_seller',
        accountType: 'SELLER',
      }),
    },
    adminAuditLog: {
      create: jest.fn().mockResolvedValue({ id: 'audit_1' }),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'audit_connect_1',
          action: 'system.connect.payout_requested',
          entityId: 'cab_seller',
          createdAt: new Date('2026-04-19T00:00:00Z'),
          details: {
            requestId: 'po_req_1',
            payoutId: 'po_123',
            status: 'pending',
            amountCents: '500',
          },
        },
      ]),
      count: jest.fn().mockResolvedValue(1),
    },
    connectLedgerEntry: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'cle_1',
          accountBalanceId: 'cab_seller',
          type: 'DEBIT_PAYOUT',
          amountCents: 500n,
          balanceAfterPendingCents: 100n,
          balanceAfterAvailableCents: 200n,
          referenceType: 'payout',
          referenceId: 'po_req_1',
          scheduledFor: null,
          matured: false,
          createdAt: new Date('2026-04-19T01:00:00Z'),
        },
      ]),
      count: jest.fn().mockResolvedValue(1),
    },
    $transaction: jest
      .fn()
      .mockImplementation(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
  };
  const connectService = {
    createCustomAccount: jest.fn().mockResolvedValue({
      accountBalanceId: 'cab_manager',
      stripeAccountId: 'acct_manager',
      requestedCapabilities: ['card_payments', 'transfers'],
    }),
    getOnboardingStatus: jest.fn().mockResolvedValue({
      stripeAccountId: 'acct_test',
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      requirementsCurrentlyDue: [],
    }),
    submitOnboardingProfile: jest.fn().mockResolvedValue({
      stripeAccountId: 'acct_seller',
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: true,
      requirementsCurrentlyDue: ['individual.verification.document'],
      requirementsPastDue: [],
      requirementsDisabledReason: 'requirements.pending_verification',
      capabilities: {
        card_payments: 'pending',
        transfers: 'pending',
      },
    }),
  };
  const ledgerService = {
    getBalance: jest.fn((accountBalanceId: string) => ({
      accountBalanceId,
      stripeAccountId: accountBalanceId === 'cab_affiliate' ? 'acct_affiliate' : 'acct_seller',
      accountType: accountBalanceId === 'cab_affiliate' ? 'AFFILIATE' : 'SELLER',
      pendingCents: 100n,
      availableCents: 200n,
      lifetimeReceivedCents: 900n,
      lifetimePaidOutCents: 300n,
      lifetimeChargebacksCents: 0n,
    })),
  };
  const connectPayoutService = {
    createPayout: jest.fn().mockResolvedValue({
      payoutId: 'po_123',
      status: 'pending',
      accountBalanceId: 'cab_seller',
      stripeAccountId: 'acct_seller',
      amountCents: 500n,
    }),
  };
  const connectPayoutApprovalService = {
    listWorkspaceRequests: jest.fn().mockResolvedValue({
      items: [
        {
          approvalRequestId: 'apr_1',
          workspaceId: 'ws-1',
          accountBalanceId: 'cab_seller',
          accountType: 'SELLER',
          stripeAccountId: 'acct_seller',
          amountCents: '500',
          currency: 'BRL',
          requestId: 'po_req_approval_1',
          state: 'OPEN',
          title: 'Aprovar saque SELLER',
          createdAt: '2026-04-19T02:00:00.000Z',
          updatedAt: '2026-04-19T02:00:00.000Z',
          respondedAt: null,
          decision: null,
        },
      ],
      total: 1,
    }),
    createRequest: jest.fn().mockResolvedValue({
      approvalRequestId: 'apr_1',
      workspaceId: 'ws-1',
      accountBalanceId: 'cab_seller',
      accountType: 'SELLER',
      stripeAccountId: 'acct_seller',
      amountCents: '500',
      currency: 'BRL',
      requestId: 'po_req_approval_1',
      state: 'OPEN',
      title: 'Aprovar saque SELLER',
      createdAt: '2026-04-19T02:00:00.000Z',
      updatedAt: '2026-04-19T02:00:00.000Z',
      respondedAt: null,
      decision: null,
    }),
  };
  const connectLedgerReconciliationService = {
    reconcile: jest.fn().mockResolvedValue({
      scannedAccounts: 2,
      drifts: [],
      scannedAt: '2026-04-19T00:00:00.000Z',
    }),
  };

  return {
    prisma,
    connectService,
    ledgerService,
    connectLedgerReconciliationService,
    connectPayoutApprovalService,
    connectPayoutService,
    controller: new ConnectController(
      prisma as never,
      connectService as never,
      ledgerService as never,
      connectLedgerReconciliationService as never,
      connectPayoutApprovalService as never,
      connectPayoutService as never,
    ),
  };
}
