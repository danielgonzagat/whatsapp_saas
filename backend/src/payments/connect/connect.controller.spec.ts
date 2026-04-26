import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { ConnectController } from './connect.controller';
import { ConnectAccountAlreadyExistsError } from './connect.types';

describe('ConnectController', () => {
  function buildController() {
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
      getOnboardingStatus: jest.fn(async (stripeAccountId: string) => ({
        stripeAccountId,
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
        requirementsCurrentlyDue: [],
      })),
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
      getBalance: jest.fn(async (accountBalanceId: string) => ({
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

  it('lists local connect balances with ledger snapshots and onboarding state', async () => {
    const { controller, prisma, ledgerService, connectService } = buildController();
    const result = await controller.listAccounts('ws-1');
    expect(prisma.connectAccountBalance.findMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1' },
      orderBy: [{ accountType: 'asc' }, { createdAt: 'asc' }],
    });
    expect(ledgerService.getBalance).toHaveBeenCalledTimes(2);
    expect(connectService.getOnboardingStatus).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      accounts: [
        expect.objectContaining({
          accountBalanceId: 'cab_seller',
          stripeAccountId: 'acct_seller',
          pendingCents: '100',
          availableCents: '200',
        }),
        expect.objectContaining({
          accountBalanceId: 'cab_affiliate',
          stripeAccountId: 'acct_affiliate',
          pendingCents: '100',
          availableCents: '200',
        }),
      ],
    });
  });

  it('creates a connected account for the workspace', async () => {
    const { controller, connectService } = buildController();
    const result = await controller.createAccount('ws-1', {
      accountType: 'MANAGER',
      email: 'manager@example.com',
      country: 'BR',
      displayName: 'Manager Account',
    });

    expect(connectService.createCustomAccount).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      accountType: 'MANAGER',
      email: 'manager@example.com',
      country: 'BR',
      displayName: 'Manager Account',
    });
    expect(result).toEqual({
      accountBalanceId: 'cab_manager',
      stripeAccountId: 'acct_manager',
      requestedCapabilities: ['card_payments', 'transfers'],
    });
  });

  it('maps duplicate connect accounts to conflict for the workspace route', async () => {
    const { controller, connectService } = buildController();
    connectService.createCustomAccount.mockRejectedValueOnce(
      new ConnectAccountAlreadyExistsError('ws-1', 'SELLER'),
    );

    await expect(
      controller.createAccount('ws-1', {
        accountType: 'SELLER',
        email: 'seller@example.com',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('submits onboarding data for a workspace connect balance', async () => {
    const { controller, prisma, connectService } = buildController();
    const result = await controller.submitOnboardingProfile(
      'ws-1',
      'cab_seller',
      {
        businessType: 'individual',
        individual: {
          firstName: 'Ana',
          lastName: 'Silva',
          idNumber: '123.456.789-09',
        },
        tosAcceptance: {
          acceptedAt: '2026-04-22T12:34:56.000Z',
        },
      },
      'Mozilla/5.0',
      '203.0.113.10, 198.51.100.15',
    );

    expect(prisma.connectAccountBalance.findFirst).toHaveBeenCalledWith({
      where: { id: 'cab_seller', workspaceId: 'ws-1' },
    });
    expect(connectService.submitOnboardingProfile).toHaveBeenCalledWith({
      stripeAccountId: 'acct_seller',
      businessType: 'individual',
      individual: {
        firstName: 'Ana',
        lastName: 'Silva',
        idNumber: '123.456.789-09',
      },
      tosAcceptance: {
        acceptedAt: '2026-04-22T12:34:56.000Z',
        ipAddress: '203.0.113.10',
        userAgent: 'Mozilla/5.0',
      },
    });
    expect(result).toEqual({
      accountBalanceId: 'cab_seller',
      workspaceId: 'ws-1',
      accountType: 'SELLER',
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
    });
  });

  it('reconciles connect balances scoped to the workspace', async () => {
    const { controller, connectLedgerReconciliationService } = buildController();
    const result = await controller.reconcileWorkspace('ws-1');
    expect(connectLedgerReconciliationService.reconcile).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
    });
    expect(result).toEqual({
      scannedAccounts: 2,
      drifts: [],
      scannedAt: '2026-04-19T00:00:00.000Z',
    });
  });

  it('creates a payout for a balance that belongs to the workspace', async () => {
    const { controller, prisma, connectPayoutService } = buildController();
    const result = await controller.createPayout('ws-1', {
      accountBalanceId: 'cab_seller',
      amountCents: 500,
      requestId: 'po_req_1',
      currency: 'brl',
    });

    expect(prisma.connectAccountBalance.findFirst).toHaveBeenCalledWith({
      where: { id: 'cab_seller', workspaceId: 'ws-1' },
    });
    expect(connectPayoutService.createPayout).toHaveBeenCalledWith({
      accountBalanceId: 'cab_seller',
      workspaceId: 'ws-1',
      amountCents: 500n,
      requestId: 'po_req_1',
      currency: 'brl',
    });
    expect(result).toEqual({
      success: true,
      payoutId: 'po_123',
      status: 'pending',
      accountBalanceId: 'cab_seller',
      stripeAccountId: 'acct_seller',
      amountCents: '500',
    });
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: {
        action: 'system.connect.payout_requested',
        entityType: 'connect_account_balance',
        entityId: 'cab_seller',
        details: {
          workspaceId: 'ws-1',
          accountType: 'SELLER',
          stripeAccountId: 'acct_seller',
          requestId: 'po_req_1',
          payoutId: 'po_123',
          status: 'pending',
          amountCents: '500',
        },
      },
    });
  });

  it('creates a payout approval request for a workspace balance', async () => {
    const { controller, connectPayoutApprovalService } = buildController();
    const result = await controller.createPayoutRequest('ws-1', {
      accountBalanceId: 'cab_seller',
      amountCents: 500,
      currency: 'brl',
    });

    expect(connectPayoutApprovalService.createRequest).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      accountBalanceId: 'cab_seller',
      amountCents: 500n,
      currency: 'brl',
    });
    expect(result).toEqual({
      success: true,
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
    });
  });

  it('rejects invalid payout payloads before hitting services', async () => {
    const { controller, connectPayoutApprovalService, connectPayoutService } = buildController();
    await expect(
      controller.createPayout('ws-1', {
        accountBalanceId: '',
        amountCents: 500,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      controller.createPayout('ws-1', {
        accountBalanceId: 'cab_seller',
        amountCents: 0,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(connectPayoutService.createPayout).not.toHaveBeenCalled();
    expect(connectPayoutApprovalService.createRequest).not.toHaveBeenCalled();
  });

  it('rejects invalid account creation payloads before hitting connect service', async () => {
    const { controller, connectService } = buildController();
    await expect(
      controller.createAccount('ws-1', {
        accountType: 'NOT_A_ROLE',
        email: 'manager@example.com',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      controller.createAccount('ws-1', {
        accountType: 'SELLER',
        email: '',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(connectService.createCustomAccount).not.toHaveBeenCalled();
  });

  it('rejects empty onboarding payloads before hitting connect service', async () => {
    const { controller, connectService } = buildController();
    await expect(
      controller.submitOnboardingProfile('ws-1', 'cab_seller', {}, undefined, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(connectService.submitOnboardingProfile).not.toHaveBeenCalled();
  });

  it('rejects payouts for balances outside the workspace boundary', async () => {
    const { controller, prisma, connectPayoutService } = buildController();
    prisma.connectAccountBalance.findFirst.mockResolvedValueOnce(null);
    await expect(
      controller.createPayout('ws-1', {
        accountBalanceId: 'cab_other',
        amountCents: 500,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(connectPayoutService.createPayout).not.toHaveBeenCalled();
  });

  it('audits failed payout requests before rethrowing the error', async () => {
    const { controller, prisma, connectPayoutService } = buildController();
    connectPayoutService.createPayout.mockRejectedValueOnce(new Error('stripe down'));
    await expect(
      controller.createPayout('ws-1', {
        accountBalanceId: 'cab_seller',
        amountCents: 500,
        requestId: 'po_req_2',
      }),
    ).rejects.toThrow('stripe down');

    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: {
        action: 'system.connect.payout_request_failed',
        entityType: 'connect_account_balance',
        entityId: 'cab_seller',
        details: {
          workspaceId: 'ws-1',
          accountType: 'SELLER',
          stripeAccountId: 'acct_seller',
          requestId: 'po_req_2',
          payoutId: null,
          status: 'failed',
          amountCents: '500',
          error: 'stripe down',
        },
      },
    });
  });

  it('lists connect payout audit history for the workspace', async () => {
    const { controller, prisma } = buildController();
    const result = await controller.listPayouts('ws-1', 'cab_seller', '0', '25');
    expect(prisma.connectAccountBalance.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'ws-1',
        id: 'cab_seller',
      },
      select: {
        id: true,
        accountType: true,
        stripeAccountId: true,
      },
      orderBy: [{ accountType: 'asc' }, { createdAt: 'asc' }],
    });
    expect(prisma.adminAuditLog.findMany).toHaveBeenCalledWith({
      where: {
        entityType: 'connect_account_balance',
        entityId: { in: ['cab_seller', 'cab_affiliate'] },
        action: { contains: 'connect.payout' },
      },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 25,
    });
    expect(result).toEqual({
      items: [
        {
          id: 'audit_connect_1',
          action: 'system.connect.payout_requested',
          createdAt: '2026-04-19T00:00:00.000Z',
          accountBalanceId: 'cab_seller',
          accountType: 'SELLER',
          stripeAccountId: 'acct_seller',
          requestId: 'po_req_1',
          payoutId: 'po_123',
          status: 'pending',
          amountCents: '500',
          error: null,
        },
      ],
      total: 1,
    });
  });

  it('lists payout approval requests for the workspace', async () => {
    const { controller, connectPayoutApprovalService } = buildController();
    const result = await controller.listPayoutRequests('ws-1', 'cab_seller', 'OPEN', '0', '25');
    expect(connectPayoutApprovalService.listWorkspaceRequests).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      accountBalanceId: 'cab_seller',
      state: 'OPEN',
      skip: 0,
      take: 25,
    });
    expect(result).toEqual({
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
    });
  });

  it('lists connect ledger history for the workspace', async () => {
    const { controller, prisma } = buildController();
    const result = await controller.listLedger('ws-1', undefined, 'DEBIT_PAYOUT', '0', '50');
    expect(prisma.connectLedgerEntry.findMany).toHaveBeenCalledWith({
      where: {
        accountBalanceId: { in: ['cab_seller', 'cab_affiliate'] },
        type: 'DEBIT_PAYOUT',
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 0,
      take: 50,
    });
    expect(result).toEqual({
      items: [
        {
          id: 'cle_1',
          accountBalanceId: 'cab_seller',
          accountType: 'SELLER',
          stripeAccountId: 'acct_seller',
          type: 'DEBIT_PAYOUT',
          amountCents: '500',
          balanceAfterPendingCents: '100',
          balanceAfterAvailableCents: '200',
          referenceType: 'payout',
          referenceId: 'po_req_1',
          scheduledFor: null,
          matured: false,
          createdAt: '2026-04-19T01:00:00.000Z',
        },
      ],
      total: 1,
    });
  });
});
