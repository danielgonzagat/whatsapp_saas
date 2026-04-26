import { BadRequestException, NotFoundException } from '@nestjs/common';

import { buildService } from './connect-payout-approval.e2e.spec-helpers';

/**
 * ConnectPayoutApprovalService — execute & reject lifecycle.
 *
 * Covers the admin-side actions on an existing approval request:
 *   - approveRequest happy path → Stripe payout via ConnectPayoutService,
 *   - approveRequest failure path → request marked FAILED, error surfaced,
 *   - rejection invariants (missing / already-closed),
 *   - rejectRequest happy path with admin reason.
 */

describe('ConnectPayoutApprovalService — full payout lifecycle', () => {
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
        workspaceId: 'ws-1',
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
});
