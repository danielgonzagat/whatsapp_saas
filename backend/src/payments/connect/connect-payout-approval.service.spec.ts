import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { ConnectPayoutApprovalService } from './connect-payout-approval.service';

describe('ConnectPayoutApprovalService', () => {
  function buildService() {
    const now = new Date('2026-04-19T22:00:00Z');
    const prisma = {
      connectAccountBalance: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cab_seller',
          workspaceId: 'ws-1',
          stripeAccountId: 'acct_seller',
          accountType: 'SELLER',
          availableBalanceCents: 900n,
        }),
      },
      approvalRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest
          .fn()
          .mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
            id: 'apr_1',
            workspaceId: 'ws-1',
            kind: 'connect_payout',
            state: 'OPEN',
            title: data.title,
            prompt: data.prompt,
            payload: data.payload,
            response: null,
            respondedAt: null,
            createdAt: now,
            updatedAt: now,
          })),
        update: jest
          .fn()
          .mockImplementation(
            async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
              id: where.id,
              workspaceId: 'ws-1',
              kind: 'connect_payout',
              state: data.state,
              title: 'Aprovar saque SELLER',
              prompt: 'prompt',
              payload: {
                version: 1,
                workspaceId: 'ws-1',
                accountBalanceId: 'cab_seller',
                accountType: 'SELLER',
                stripeAccountId: 'acct_seller',
                amountCents: '500',
                currency: 'BRL',
                requestId: 'po_req_1',
                requestedByType: 'workspace',
              },
              response: data.response ?? null,
              respondedAt: data.respondedAt ?? null,
              createdAt: now,
              updatedAt: now,
            }),
          ),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      adminAuditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit_1' }),
      },
      $transaction: jest
        .fn()
        .mockImplementation(
          async (
            operations:
              | Array<Promise<unknown>>
              | ((tx: Record<string, unknown>) => Promise<unknown> | unknown),
          ) => {
            if (typeof operations === 'function') {
              return operations(prisma);
            }
            return Promise.all(operations);
          },
        ),
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

    return {
      prisma,
      connectPayoutService,
      service: new ConnectPayoutApprovalService(prisma as never, connectPayoutService as never),
    };
  }

  it('creates a payout approval request for a workspace balance', async () => {
    const { service, prisma } = buildService();

    const result = await service.createRequest({
      workspaceId: 'ws-1',
      accountBalanceId: 'cab_seller',
      amountCents: 500n,
      currency: 'brl',
    });

    expect(prisma.connectAccountBalance.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'cab_seller',
        workspaceId: 'ws-1',
      },
    });
    expect(prisma.approvalRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'ws-1',
        kind: 'connect_payout',
        scope: 'connect_account_balance',
        entityType: 'connect_account_balance',
        entityId: 'cab_seller',
        state: 'OPEN',
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        approvalRequestId: 'apr_1',
        workspaceId: 'ws-1',
        accountBalanceId: 'cab_seller',
        accountType: 'SELLER',
        stripeAccountId: 'acct_seller',
        amountCents: '500',
        currency: 'BRL',
        state: 'OPEN',
        decision: null,
      }),
    );
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: {
        adminUserId: null,
        action: 'system.connect.withdrawal_approval_requested',
        entityType: 'connect_account_balance',
        entityId: 'cab_seller',
        details: expect.objectContaining({
          approvalRequestId: 'apr_1',
          workspaceId: 'ws-1',
          accountType: 'SELLER',
          stripeAccountId: 'acct_seller',
          amountCents: '500',
          currency: 'BRL',
        }),
      },
    });
  });

  it('rejects duplicate open payout approval requests for the same balance', async () => {
    const { service, prisma } = buildService();
    prisma.approvalRequest.findFirst.mockResolvedValueOnce({ id: 'apr_open' });

    await expect(
      service.createRequest({
        workspaceId: 'ws-1',
        accountBalanceId: 'cab_seller',
        amountCents: 500n,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.approvalRequest.create).not.toHaveBeenCalled();
  });

  it('rejects payout approval requests above the current available balance', async () => {
    const { service, prisma } = buildService();
    prisma.connectAccountBalance.findFirst.mockResolvedValueOnce({
      id: 'cab_seller',
      workspaceId: 'ws-1',
      stripeAccountId: 'acct_seller',
      accountType: 'SELLER',
      availableBalanceCents: 499n,
    });

    await expect(
      service.createRequest({
        workspaceId: 'ws-1',
        accountBalanceId: 'cab_seller',
        amountCents: 500n,
      }),
    ).rejects.toThrow('Insufficient available balance');

    expect(prisma.approvalRequest.create).not.toHaveBeenCalled();
  });

  it('approves an open payout request and executes the payout', async () => {
    const { service, prisma, connectPayoutService } = buildService();
    prisma.approvalRequest.findUnique.mockResolvedValueOnce({
      id: 'apr_1',
      workspaceId: 'ws-1',
      kind: 'connect_payout',
      state: 'OPEN',
      title: 'Aprovar saque SELLER',
      prompt: 'prompt',
      payload: {
        version: 1,
        workspaceId: 'ws-1',
        accountBalanceId: 'cab_seller',
        accountType: 'SELLER',
        stripeAccountId: 'acct_seller',
        amountCents: '500',
        currency: 'BRL',
        requestId: 'po_req_1',
        requestedByType: 'workspace',
      },
      response: null,
      respondedAt: null,
      createdAt: new Date('2026-04-19T22:00:00Z'),
      updatedAt: new Date('2026-04-19T22:00:00Z'),
    });

    const result = await service.approveRequest({
      approvalRequestId: 'apr_1',
      adminUserId: 'admin-1',
    });

    expect(connectPayoutService.createPayout).toHaveBeenCalledWith({
      accountBalanceId: 'cab_seller',
      amountCents: 500n,
      requestId: 'po_req_1',
      currency: 'brl',
    });
    expect(prisma.approvalRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'apr_1', workspaceId: 'ws-1' },
      data: {
        state: 'APPROVED',
        respondedAt: expect.anything(),
        response: {
          approvedByAdminId: 'admin-1',
          payoutId: 'po_123',
          status: 'pending',
          amountCents: '500',
          currency: 'BRL',
        },
      },
    });
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: {
        adminUserId: 'admin-1',
        action: 'admin.carteira.connect_withdrawal_approved',
        entityType: 'connect_account_balance',
        entityId: 'cab_seller',
        details: {
          approvalRequestId: 'apr_1',
          workspaceId: 'ws-1',
          accountType: 'SELLER',
          stripeAccountId: 'acct_seller',
          requestId: 'po_req_1',
          payoutId: 'po_123',
          status: 'pending',
          amountCents: '500',
          currency: 'BRL',
        },
      },
    });
    expect(result).toEqual({
      approvalRequestId: 'apr_1',
      state: 'APPROVED',
      payoutId: 'po_123',
      status: 'pending',
      accountBalanceId: 'cab_seller',
      stripeAccountId: 'acct_seller',
      amountCents: '500',
      currency: 'BRL',
    });
  });

  it('marks the approval request as failed when payout execution fails', async () => {
    const { service, prisma, connectPayoutService } = buildService();
    prisma.approvalRequest.findUnique.mockResolvedValueOnce({
      id: 'apr_1',
      workspaceId: 'ws-1',
      kind: 'connect_payout',
      state: 'OPEN',
      title: 'Aprovar saque SELLER',
      prompt: 'prompt',
      payload: {
        version: 1,
        workspaceId: 'ws-1',
        accountBalanceId: 'cab_seller',
        accountType: 'SELLER',
        stripeAccountId: 'acct_seller',
        amountCents: '500',
        currency: 'BRL',
        requestId: 'po_req_1',
        requestedByType: 'workspace',
      },
      response: null,
      respondedAt: null,
      createdAt: new Date('2026-04-19T22:00:00Z'),
      updatedAt: new Date('2026-04-19T22:00:00Z'),
    });
    connectPayoutService.createPayout.mockRejectedValueOnce(new Error('stripe down'));

    await expect(
      service.approveRequest({
        approvalRequestId: 'apr_1',
        adminUserId: 'admin-1',
      }),
    ).rejects.toThrow('stripe down');

    expect(prisma.approvalRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'apr_1', workspaceId: 'ws-1' },
      data: {
        state: 'FAILED',
        respondedAt: expect.anything(),
        response: {
          error: 'stripe down',
          amountCents: '500',
          currency: 'BRL',
          approvedByAdminId: 'admin-1',
        },
      },
    });
  });

  it('rejects an open payout request with admin reason', async () => {
    const { service, prisma } = buildService();
    prisma.approvalRequest.findUnique.mockResolvedValueOnce({
      id: 'apr_1',
      workspaceId: 'ws-1',
      kind: 'connect_payout',
      state: 'OPEN',
      title: 'Aprovar saque SELLER',
      prompt: 'prompt',
      payload: {
        version: 1,
        workspaceId: 'ws-1',
        accountBalanceId: 'cab_seller',
        accountType: 'SELLER',
        stripeAccountId: 'acct_seller',
        amountCents: '500',
        currency: 'BRL',
        requestId: 'po_req_1',
        requestedByType: 'workspace',
      },
      response: null,
      respondedAt: null,
      createdAt: new Date('2026-04-19T22:00:00Z'),
      updatedAt: new Date('2026-04-19T22:00:00Z'),
    });

    const result = await service.rejectRequest({
      approvalRequestId: 'apr_1',
      adminUserId: 'admin-1',
      reason: 'manual review failed',
    });

    expect(prisma.approvalRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'apr_1', workspaceId: 'ws-1' },
      data: {
        state: 'REJECTED',
        respondedAt: expect.anything(),
        response: {
          rejectedByAdminId: 'admin-1',
          reason: 'manual review failed',
          amountCents: '500',
          currency: 'BRL',
        },
      },
    });
    expect(result).toEqual({
      approvalRequestId: 'apr_1',
      state: 'REJECTED',
    });
  });

  it('lists workspace approval requests', async () => {
    const { service, prisma } = buildService();
    prisma.approvalRequest.findMany.mockResolvedValueOnce([
      {
        id: 'apr_1',
        workspaceId: 'ws-1',
        kind: 'connect_payout',
        state: 'APPROVED',
        title: 'Aprovar saque SELLER',
        prompt: 'prompt',
        payload: {
          version: 1,
          workspaceId: 'ws-1',
          accountBalanceId: 'cab_seller',
          accountType: 'SELLER',
          stripeAccountId: 'acct_seller',
          amountCents: '500',
          currency: 'BRL',
          requestId: 'po_req_1',
          requestedByType: 'workspace',
        },
        response: {
          approvedByAdminId: 'admin-1',
          payoutId: 'po_123',
          status: 'pending',
          amountCents: '500',
          currency: 'BRL',
        },
        respondedAt: new Date('2026-04-19T22:10:00Z'),
        createdAt: new Date('2026-04-19T22:00:00Z'),
        updatedAt: new Date('2026-04-19T22:10:00Z'),
      },
    ]);
    prisma.approvalRequest.count.mockResolvedValueOnce(1);

    const result = await service.listWorkspaceRequests({
      workspaceId: 'ws-1',
      accountBalanceId: 'cab_seller',
      state: 'APPROVED',
      skip: 0,
      take: 20,
    });

    expect(prisma.approvalRequest.findMany).toHaveBeenCalledWith({
      where: {
        kind: 'connect_payout',
        workspaceId: 'ws-1',
        entityId: 'cab_seller',
        state: 'APPROVED',
      },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 20,
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
          requestId: 'po_req_1',
          state: 'APPROVED',
          title: 'Aprovar saque SELLER',
          createdAt: '2026-04-19T22:00:00.000Z',
          updatedAt: '2026-04-19T22:10:00.000Z',
          respondedAt: '2026-04-19T22:10:00.000Z',
          decision: {
            approvedByAdminId: 'admin-1',
            rejectedByAdminId: null,
            payoutId: 'po_123',
            status: 'pending',
            amountCents: '500',
            currency: 'BRL',
            reason: null,
            error: null,
          },
        },
      ],
      total: 1,
    });
  });

  it('rejects malformed approval payloads when listing', async () => {
    const { service, prisma } = buildService();
    prisma.approvalRequest.findMany.mockResolvedValueOnce([
      {
        id: 'apr_bad',
        workspaceId: 'ws-1',
        kind: 'connect_payout',
        state: 'OPEN',
        title: 'broken',
        prompt: 'prompt',
        payload: {},
        response: null,
        respondedAt: null,
        createdAt: new Date('2026-04-19T22:00:00Z'),
        updatedAt: new Date('2026-04-19T22:00:00Z'),
      },
    ]);
    prisma.approvalRequest.count.mockResolvedValueOnce(1);

    await expect(
      service.listAdminRequests({
        workspaceId: 'ws-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when approving a missing request', async () => {
    const { service, prisma } = buildService();
    prisma.approvalRequest.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.approveRequest({
        approvalRequestId: 'apr_missing',
        adminUserId: 'admin-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
