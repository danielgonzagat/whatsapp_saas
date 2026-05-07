import { ConflictException, NotFoundException } from '@nestjs/common';

import { InsufficientAvailableBalanceError } from '../ledger/ledger.types';

import { buildService } from './connect-payout-approval.e2e.spec-helpers';

/**
 * ConnectPayoutApprovalService — request creation and listing.
 *
 * Sibling spec file `connect-payout-approval.execute.e2e.spec.ts` covers
 * the `approveRequest` (with Stripe execution path) and `rejectRequest`
 * lifecycle transitions.
 */

describe('ConnectPayoutApprovalService — full payout lifecycle', () => {
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
