import { BadRequestException } from '@nestjs/common';

import { AdminCarteiraController } from './admin-carteira.controller';

describe('AdminCarteiraController', () => {
  function buildController() {
    const wallet = {
      readBalance: jest.fn(),
      listLedger: jest.fn(),
    };
    const reconcile = {
      reconcile: jest.fn(),
    };
    const marketplaceTreasuryPayout = {
      createPayout: jest.fn().mockResolvedValue({
        payoutId: 'po_marketplace_treasury_123',
        status: 'pending',
        amountCents: 5_000n,
        currency: 'BRL',
      }),
    };
    const connectService = {
      listBalances: jest.fn().mockResolvedValue([
        {
          id: 'cab_seller',
          workspaceId: 'ws-1',
          stripeAccountId: 'acct_seller',
          accountType: 'SELLER',
        },
      ]),
      getOnboardingStatus: jest.fn().mockResolvedValue({
        stripeAccountId: 'acct_seller',
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
        requirementsCurrentlyDue: [],
        requirementsPastDue: [],
        requirementsDisabledReason: null,
        capabilities: {
          card_payments: 'active',
          transfers: 'active',
        },
      }),
    };
    const connectLedger = {
      getBalance: jest.fn().mockResolvedValue({
        accountBalanceId: 'cab_seller',
        stripeAccountId: 'acct_seller',
        accountType: 'SELLER',
        pendingCents: 100n,
        availableCents: 200n,
        lifetimeReceivedCents: 900n,
        lifetimePaidOutCents: 300n,
        lifetimeChargebacksCents: 0n,
      }),
    };
    const connectReconcile = {
      reconcile: jest.fn().mockResolvedValue({
        scannedAccounts: 1,
        drifts: [],
        scannedAt: '2026-04-19T20:15:00.000Z',
      }),
    };
    const connectPayoutApprovalService = {
      listAdminRequests: jest.fn().mockResolvedValue({
        items: [
          {
            approvalRequestId: 'apr_connect_1',
            workspaceId: 'ws-1',
            accountBalanceId: 'cab_seller',
            accountType: 'SELLER',
            stripeAccountId: 'acct_seller',
            amountCents: '500',
            currency: 'BRL',
            requestId: 'po_req_approval_1',
            state: 'OPEN',
            title: 'Aprovar saque SELLER',
            createdAt: '2026-04-19T20:10:00.000Z',
            updatedAt: '2026-04-19T20:10:00.000Z',
            respondedAt: null,
            decision: null,
          },
        ],
        total: 1,
      }),
      approveRequest: jest.fn().mockResolvedValue({
        approvalRequestId: 'apr_connect_1',
        state: 'APPROVED',
        payoutId: 'po_123',
        status: 'pending',
        accountBalanceId: 'cab_seller',
        stripeAccountId: 'acct_seller',
        amountCents: '500',
        currency: 'BRL',
      }),
      rejectRequest: jest.fn().mockResolvedValue({
        approvalRequestId: 'apr_connect_1',
        state: 'REJECTED',
      }),
    };
    const fraudEngine = {
      listBlacklist: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'fb_1',
            type: 'EMAIL',
            value: 'fraud@example.com',
            reason: 'chargeback',
            addedBy: 'admin-1',
            expiresAt: null,
            createdAt: new Date('2026-04-19T20:00:00Z'),
          },
        ],
        total: 1,
      }),
      addToBlacklist: jest.fn().mockResolvedValue({
        id: 'fb_2',
        type: 'EMAIL',
        value: 'fraud@example.com',
        reason: 'chargeback',
        addedBy: 'admin-1',
        expiresAt: null,
        createdAt: new Date('2026-04-19T20:15:00Z'),
      }),
      removeFromBlacklist: jest.fn().mockResolvedValue({ removedCount: 1 }),
    };
    const audit = {
      append: jest.fn().mockResolvedValue(undefined),
      list: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'audit-1',
            action: 'admin.carteira.payout_requested',
            createdAt: new Date('2026-04-19T20:00:00Z'),
            details: {
              requestId: 'marketplace_treasury_po_req_1',
              payoutId: 'po_marketplace_treasury_123',
              status: 'pending',
              amountCents: '5000',
            },
            adminUser: {
              id: 'admin-1',
              name: 'Admin',
              email: 'admin@kloel.com',
              role: 'OWNER',
            },
          },
          {
            id: 'audit-2',
            action: 'system.carteira.payout_paid',
            createdAt: new Date('2026-04-19T20:05:00Z'),
            details: {
              requestId: 'marketplace_treasury_po_req_1',
              payoutId: 'po_marketplace_treasury_123',
              status: 'paid',
              amountCents: '5000',
              currency: 'BRL',
            },
            adminUser: null,
          },
        ],
        total: 2,
      }),
    };

    return {
      wallet,
      reconcile,
      marketplaceTreasuryPayout,
      connectService,
      connectLedger,
      connectReconcile,
      connectPayoutApprovalService,
      fraudEngine,
      audit,
      controller: new AdminCarteiraController(
        wallet as never,
        reconcile as never,
        marketplaceTreasuryPayout as never,
        connectService as never,
        connectLedger as never,
        connectReconcile as never,
        connectPayoutApprovalService as never,
        fraudEngine as never,
        audit as never,
      ),
    };
  }

  it('requests a marketplace treasury payout and appends an admin audit row', async () => {
    const { controller, marketplaceTreasuryPayout, audit } = buildController();

    const result = await controller.createPayout(
      {
        amountCents: 5_000,
        requestId: 'marketplace_treasury_po_req_1',
        currency: 'BRL',
      },
      {
        id: 'admin-1',
      } as never,
    );

    expect(marketplaceTreasuryPayout.createPayout).toHaveBeenCalledWith({
      amountCents: 5_000n,
      requestId: 'marketplace_treasury_po_req_1',
      currency: 'BRL',
    });
    expect(audit.append).toHaveBeenCalledWith({
      adminUserId: 'admin-1',
      action: 'admin.carteira.payout_requested',
      entityType: 'marketplace_treasury',
      entityId: 'BRL',
      details: {
        requestId: 'marketplace_treasury_po_req_1',
        payoutId: 'po_marketplace_treasury_123',
        status: 'pending',
        amountCents: '5000',
      },
    });
    expect(result).toEqual({
      success: true,
      payoutId: 'po_marketplace_treasury_123',
      status: 'pending',
      amountCents: '5000',
      currency: 'BRL',
    });
  });

  it('rejects invalid payout payloads before touching services', async () => {
    const { controller, marketplaceTreasuryPayout, audit } = buildController();

    await expect(
      controller.createPayout(
        {
          amountCents: 0,
          currency: 'BRL',
        },
        {
          id: 'admin-1',
        } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(marketplaceTreasuryPayout.createPayout).not.toHaveBeenCalled();
    expect(audit.append).not.toHaveBeenCalled();
  });

  it('audits payout request failures before rethrowing the error', async () => {
    const { controller, marketplaceTreasuryPayout, audit } = buildController();
    marketplaceTreasuryPayout.createPayout.mockRejectedValueOnce(new Error('stripe timeout'));

    await expect(
      controller.createPayout(
        {
          amountCents: 5_000,
          requestId: 'marketplace_treasury_po_req_fail',
          currency: 'BRL',
        },
        {
          id: 'admin-1',
        } as never,
      ),
    ).rejects.toThrow('stripe timeout');

    expect(audit.append).toHaveBeenCalledWith({
      adminUserId: 'admin-1',
      action: 'admin.carteira.payout_request_failed',
      entityType: 'marketplace_treasury',
      entityId: 'BRL',
      details: {
        requestId: 'marketplace_treasury_po_req_fail',
        amountCents: '5000',
        currency: 'BRL',
        error: 'stripe timeout',
      },
    });
  });

  it('lists marketplace treasury payout audit events for operator visibility', async () => {
    const { controller, audit } = buildController();

    const result = await controller.listPayouts('0', '20');

    expect(audit.list).toHaveBeenCalledWith({
      action: 'carteira.payout',
      entityType: 'marketplace_treasury',
      skip: 0,
      take: 20,
    });
    expect(result).toEqual({
      items: [
        {
          id: 'audit-1',
          action: 'admin.carteira.payout_requested',
          createdAt: '2026-04-19T20:00:00.000Z',
          requestId: 'marketplace_treasury_po_req_1',
          payoutId: 'po_marketplace_treasury_123',
          status: 'pending',
          amountCents: '5000',
          currency: null,
          error: null,
          adminUser: {
            id: 'admin-1',
            name: 'Admin',
            email: 'admin@kloel.com',
            role: 'OWNER',
          },
        },
        {
          id: 'audit-2',
          action: 'system.carteira.payout_paid',
          createdAt: '2026-04-19T20:05:00.000Z',
          requestId: 'marketplace_treasury_po_req_1',
          payoutId: 'po_marketplace_treasury_123',
          status: 'paid',
          amountCents: '5000',
          currency: 'BRL',
          error: null,
          adminUser: null,
        },
      ],
      total: 2,
    });
  });

  it('lists connect balances with onboarding data for operators', async () => {
    const { controller, connectService, connectLedger } = buildController();

    const result = await controller.listConnectAccounts('ws-1');

    expect(connectService.listBalances).toHaveBeenCalledWith('ws-1');
    expect(connectLedger.getBalance).toHaveBeenCalledWith('cab_seller');
    expect(result).toEqual({
      accounts: [
        {
          accountBalanceId: 'cab_seller',
          workspaceId: 'ws-1',
          stripeAccountId: 'acct_seller',
          accountType: 'SELLER',
          pendingCents: '100',
          availableCents: '200',
          lifetimeReceivedCents: '900',
          lifetimePaidOutCents: '300',
          lifetimeChargebacksCents: '0',
          onboarding: {
            stripeAccountId: 'acct_seller',
            chargesEnabled: true,
            payoutsEnabled: true,
            detailsSubmitted: true,
            requirementsCurrentlyDue: [],
            requirementsPastDue: [],
            requirementsDisabledReason: null,
            capabilities: {
              card_payments: 'active',
              transfers: 'active',
            },
          },
        },
      ],
    });
  });

  it('runs connect reconcile for an operator-selected workspace', async () => {
    const { controller, connectReconcile } = buildController();

    const result = await controller.reconcileConnect('ws-1');

    expect(connectReconcile.reconcile).toHaveBeenCalledWith({ workspaceId: 'ws-1' });
    expect(result).toEqual({
      scannedAccounts: 1,
      drifts: [],
      scannedAt: '2026-04-19T20:15:00.000Z',
    });
  });

  it('lists connect payout approval requests for operator review', async () => {
    const { controller, connectPayoutApprovalService } = buildController();

    const result = await controller.listConnectPayoutRequests('ws-1', 'OPEN', '0', '25');

    expect(connectPayoutApprovalService.listAdminRequests).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      state: 'OPEN',
      skip: 0,
      take: 25,
    });
    expect(result).toEqual({
      items: [
        {
          approvalRequestId: 'apr_connect_1',
          workspaceId: 'ws-1',
          accountBalanceId: 'cab_seller',
          accountType: 'SELLER',
          stripeAccountId: 'acct_seller',
          amountCents: '500',
          currency: 'BRL',
          requestId: 'po_req_approval_1',
          state: 'OPEN',
          title: 'Aprovar saque SELLER',
          createdAt: '2026-04-19T20:10:00.000Z',
          updatedAt: '2026-04-19T20:10:00.000Z',
          respondedAt: null,
          decision: null,
        },
      ],
      total: 1,
    });
  });

  it('lists fraud blacklist rows for operator review', async () => {
    const { controller, fraudEngine } = buildController();

    const result = await controller.listFraudBlacklist('EMAIL', 'fraud@example.com', '0', '20');

    expect(fraudEngine.listBlacklist).toHaveBeenCalledWith({
      type: 'EMAIL',
      value: 'fraud@example.com',
      skip: 0,
      take: 20,
    });
    expect(result).toEqual({
      items: [
        {
          id: 'fb_1',
          type: 'EMAIL',
          value: 'fraud@example.com',
          reason: 'chargeback',
          addedBy: 'admin-1',
          expiresAt: null,
          createdAt: '2026-04-19T20:00:00.000Z',
        },
      ],
      total: 1,
    });
  });

  it('adds a fraud blacklist row and appends an admin audit record', async () => {
    const { controller, fraudEngine, audit } = buildController();

    const result = await controller.addFraudBlacklist(
      {
        type: 'EMAIL',
        value: 'Fraud@Example.com',
        reason: 'chargeback',
      },
      {
        id: 'admin-1',
      } as never,
    );

    expect(fraudEngine.addToBlacklist).toHaveBeenCalledWith({
      type: 'EMAIL',
      value: 'Fraud@Example.com',
      reason: 'chargeback',
      addedBy: 'admin-1',
      expiresAt: undefined,
    });
    expect(audit.append).toHaveBeenCalledWith({
      adminUserId: 'admin-1',
      action: 'admin.carteira.fraud_blacklist_added',
      entityType: 'fraud_blacklist',
      entityId: 'EMAIL:fraud@example.com',
      details: {
        fraudBlacklistId: 'fb_2',
        type: 'EMAIL',
        value: 'fraud@example.com',
        reason: 'chargeback',
        expiresAt: null,
      },
    });
    expect(result).toEqual({
      id: 'fb_2',
      type: 'EMAIL',
      value: 'fraud@example.com',
      reason: 'chargeback',
      addedBy: 'admin-1',
      expiresAt: null,
      createdAt: '2026-04-19T20:15:00.000Z',
    });
  });

  it('removes a fraud blacklist row and appends an admin audit record', async () => {
    const { controller, fraudEngine, audit } = buildController();

    const result = await controller.removeFraudBlacklist(
      {
        type: 'EMAIL',
        value: 'fraud@example.com',
      },
      {
        id: 'admin-1',
      } as never,
    );

    expect(fraudEngine.removeFromBlacklist).toHaveBeenCalledWith({
      type: 'EMAIL',
      value: 'fraud@example.com',
    });
    expect(audit.append).toHaveBeenCalledWith({
      adminUserId: 'admin-1',
      action: 'admin.carteira.fraud_blacklist_removed',
      entityType: 'fraud_blacklist',
      entityId: 'EMAIL:fraud@example.com',
      details: {
        type: 'EMAIL',
        value: 'fraud@example.com',
        removedCount: 1,
      },
    });
    expect(result).toEqual({ removedCount: 1 });
  });

  it('approves a queued connect payout request', async () => {
    const { controller, connectPayoutApprovalService } = buildController();

    const result = await controller.approveConnectPayoutRequest('apr_connect_1', {
      id: 'admin-1',
    } as never);

    expect(connectPayoutApprovalService.approveRequest).toHaveBeenCalledWith({
      approvalRequestId: 'apr_connect_1',
      adminUserId: 'admin-1',
    });
    expect(result).toEqual({
      success: true,
      approvalRequestId: 'apr_connect_1',
      state: 'APPROVED',
      payoutId: 'po_123',
      status: 'pending',
      accountBalanceId: 'cab_seller',
      stripeAccountId: 'acct_seller',
      amountCents: '500',
      currency: 'BRL',
    });
  });

  it('rejects a queued connect payout request', async () => {
    const { controller, connectPayoutApprovalService } = buildController();

    const result = await controller.rejectConnectPayoutRequest(
      'apr_connect_1',
      { reason: 'manual review failed' },
      {
        id: 'admin-1',
      } as never,
    );

    expect(connectPayoutApprovalService.rejectRequest).toHaveBeenCalledWith({
      approvalRequestId: 'apr_connect_1',
      adminUserId: 'admin-1',
      reason: 'manual review failed',
    });
    expect(result).toEqual({
      success: true,
      approvalRequestId: 'apr_connect_1',
      state: 'REJECTED',
    });
  });
});
