import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { ConnectPayoutApprovalService } from './connect-payout-approval.service';
import { InsufficientAvailableBalanceError } from '../ledger/ledger.types';

describe('ConnectPayoutApprovalService — full payout lifecycle', () => {
  function buildService(overrides?: {
    availableBalanceCents?: bigint;
    payoutSuccess?: boolean;
    openRequestExists?: boolean;
  }) {
    const now = new Date('2026-04-19T22:00:00Z');
    const prisma = {
      connectAccountBalance: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cab_seller',
          workspaceId: 'ws-1',
          stripeAccountId: 'acct_seller',
          accountType: 'SELLER',
          availableBalanceCents: overrides?.availableBalanceCents ?? 900n,
        }),
      },
      approvalRequest: {
        findFirst: jest
          .fn()
          .mockResolvedValue(overrides?.openRequestExists ? { id: 'apr_open_dup' } : null),
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
      createPayout: jest.fn().mockResolvedValue(
        overrides?.payoutSuccess === false
          ? Promise.reject(new Error('stripe down'))
          : {
              payoutId: 'po_123',
              status: 'pending',
              accountBalanceId: 'cab_seller',
              stripeAccountId: 'acct_seller',
              amountCents: 500n,
            },
      ),
    };

    return {
      prisma,
      connectPayoutService,
      service: new ConnectPayoutApprovalService(prisma as never, connectPayoutService as never),
    };
  }

  describe('createRequest', () => {
    it('creates a payout approval request for a valid workspace balance', async () => {
      const { service, prisma } = buildService();

      const result = await service.createRequest({
        workspaceId: 'ws-1',
        accountBalanceId: 'cab_seller',
        amountCents: 500n,
        currency: 'brl',
      });

      expect(prisma.connectAccountBalance.findFirst).toHaveBeenCalledWith({
        where: { id: 'cab_seller', workspaceId: 'ws-1' },
      });
      expect(prisma.approvalRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: 'ws-1',
          kind: 'connect_payout',
          state: 'OPEN',
          entityType: 'connect_account_balance',
          entityId: 'cab_seller',
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
            workspaceId: 'ws-1',
            accountType: 'SELLER',
            stripeAccountId: 'acct_seller',
            amountCents: '500',
            currency: 'BRL',
          }),
        },
      });
    });

    it('rejects duplicate open payout approval requests', async () => {
      const { service, prisma } = buildService({ openRequestExists: true });

      await expect(
        service.createRequest({
          workspaceId: 'ws-1',
          accountBalanceId: 'cab_seller',
          amountCents: 500n,
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.approvalRequest.create).not.toHaveBeenCalled();
    });

    it('rejects requests above available balance', async () => {
      const { service, prisma } = buildService({ availableBalanceCents: 499n });

      await expect(
        service.createRequest({
          workspaceId: 'ws-1',
          accountBalanceId: 'cab_seller',
          amountCents: 500n,
        }),
      ).rejects.toBeInstanceOf(InsufficientAvailableBalanceError);

      expect(prisma.approvalRequest.create).not.toHaveBeenCalled();
    });

    it('throws when balance does not belong to workspace', async () => {
      const { service, prisma } = buildService();
      prisma.connectAccountBalance.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.createRequest({
          workspaceId: 'ws-other',
          accountBalanceId: 'cab_seller',
          amountCents: 500n,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('approveRequest → execute payout', () => {
    it('approves request and executes the Stripe payout via ConnectPayoutService', async () => {
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
          details: expect.objectContaining({
            workspaceId: 'ws-1',
            accountType: 'SELLER',
            payoutId: 'po_123',
            status: 'pending',
            amountCents: '500',
          }),
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

    it('marks approval as FAILED when the Stripe payout execution throws', async () => {
      const { service, prisma, connectPayoutService } = buildService({ payoutSuccess: false });
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

      await expect(
        service.approveRequest({
          approvalRequestId: 'apr_1',
          adminUserId: 'admin-1',
        }),
      ).rejects.toThrow('stripe down');

      expect(connectPayoutService.createPayout).toHaveBeenCalledTimes(1);
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

    it('rejects approval of a non-existent request', async () => {
      const { service, prisma } = buildService();
      prisma.approvalRequest.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.approveRequest({
          approvalRequestId: 'apr_missing',
          adminUserId: 'admin-1',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects approval of an already-closed request', async () => {
      const { service, prisma } = buildService();
      prisma.approvalRequest.findUnique.mockResolvedValueOnce({
        id: 'apr_closed',
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
          payoutId: 'po_prev',
          status: 'pending',
          amountCents: '500',
          currency: 'BRL',
        },
        respondedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        service.approveRequest({
          approvalRequestId: 'apr_closed',
          adminUserId: 'admin-1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('rejectRequest', () => {
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
        reason: 'insufficient documentation',
      });

      expect(prisma.approvalRequest.updateMany).toHaveBeenCalledWith({
        where: { id: 'apr_1', workspaceId: 'ws-1' },
        data: {
          state: 'REJECTED',
          respondedAt: expect.anything(),
          response: {
            rejectedByAdminId: 'admin-1',
            reason: 'insufficient documentation',
            amountCents: '500',
            currency: 'BRL',
          },
        },
      });
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: {
          adminUserId: 'admin-1',
          action: 'admin.carteira.connect_withdrawal_rejected',
          entityType: 'connect_account_balance',
          entityId: 'cab_seller',
          details: expect.objectContaining({
            workspaceId: 'ws-1',
            accountType: 'SELLER',
            amountCents: '500',
            reason: 'insufficient documentation',
          }),
        },
      });
      expect(result).toEqual({
        approvalRequestId: 'apr_1',
        state: 'REJECTED',
      });
    });
  });

  describe('listWorkspaceRequests', () => {
    it('lists approved payout requests with full decision payloads', async () => {
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
            status: 'paid',
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
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual(
        expect.objectContaining({
          state: 'APPROVED',
          decision: expect.objectContaining({
            payoutId: 'po_123',
            status: 'paid',
            approvedByAdminId: 'admin-1',
          }),
        }),
      );
    });
  });
});
