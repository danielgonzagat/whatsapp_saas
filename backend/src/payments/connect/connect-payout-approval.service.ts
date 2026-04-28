import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as Sentry from '@sentry/node';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { InsufficientAvailableBalanceError } from '../ledger/ledger.types';

import { ConnectPayoutService } from './connect-payout.service';
import {
  CONNECT_PAYOUT_APPROVAL_KIND,
  type ConnectPayoutApprovalPayload,
  type ConnectPayoutApprovalSummary,
  type CreateConnectPayoutApprovalInput,
} from './connect-payout-approval.types';
import { mapApprovalSummary, parseApprovalPayload } from './connect-payout-approval.helpers';

// Re-export the public type contract for existing consumers.
export {
  CONNECT_PAYOUT_APPROVAL_KIND,
  type ConnectPayoutApprovalDecision,
  type ConnectPayoutApprovalPayload,
  type ConnectPayoutApprovalSummary,
  type CreateConnectPayoutApprovalInput,
} from './connect-payout-approval.types';

/** Connect payout approval service. */
@Injectable()
export class ConnectPayoutApprovalService {
  private readonly logger = new Logger(ConnectPayoutApprovalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly connectPayoutService: ConnectPayoutService,
  ) {}

  /** Create request. */
  async createRequest(
    input: CreateConnectPayoutApprovalInput,
  ): Promise<ConnectPayoutApprovalSummary> {
    const balance = await this.prisma.connectAccountBalance.findFirst({
      where: {
        id: input.accountBalanceId,
        workspaceId: input.workspaceId,
      },
    });
    if (!balance) {
      throw new NotFoundException('Connect account balance not found for this workspace');
    }
    if (balance.availableBalanceCents < input.amountCents) {
      throw new InsufficientAvailableBalanceError(
        balance.id,
        input.amountCents,
        balance.availableBalanceCents,
      );
    }

    const openRequest = await this.prisma.approvalRequest.findFirst({
      where: {
        workspaceId: input.workspaceId,
        kind: CONNECT_PAYOUT_APPROVAL_KIND,
        entityType: 'connect_account_balance',
        entityId: balance.id,
        state: 'OPEN',
      },
      orderBy: { createdAt: 'desc' },
    });
    if (openRequest) {
      throw new ConflictException(
        'An open connect payout approval request already exists for this account balance',
      );
    }

    const currency = String(input.currency || 'BRL')
      .trim()
      .toUpperCase();
    const requestId = `po_${randomUUID()}`;
    const payload: ConnectPayoutApprovalPayload = {
      version: 1,
      workspaceId: input.workspaceId,
      accountBalanceId: balance.id,
      accountType: String(balance.accountType),
      stripeAccountId: balance.stripeAccountId,
      amountCents: input.amountCents.toString(),
      currency,
      requestId,
      requestedByType: 'workspace',
    };

    const approval = await this.prisma.approvalRequest.create({
      data: {
        workspaceId: input.workspaceId,
        kind: CONNECT_PAYOUT_APPROVAL_KIND,
        scope: 'connect_account_balance',
        entityType: 'connect_account_balance',
        entityId: balance.id,
        state: 'OPEN',
        title: `Aprovar saque ${String(balance.accountType)}`,
        prompt: `Aprovar saque manual de ${input.amountCents.toString()} ${currency} para ${String(
          balance.accountType,
        )} (${balance.stripeAccountId})?`,
        payload: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonObject,
      },
    });

    await this.appendAudit({
      action: 'system.connect.withdrawal_approval_requested',
      entityId: balance.id,
      details: {
        approvalRequestId: approval.id,
        workspaceId: input.workspaceId,
        accountType: String(balance.accountType),
        stripeAccountId: balance.stripeAccountId,
        requestId,
        amountCents: input.amountCents.toString(),
        currency,
      },
    });

    this.logger.log('connect payout approval request created', {
      approvalRequestId: approval.id,
      workspaceId: input.workspaceId,
      accountBalanceId: balance.id,
      accountType: String(balance.accountType),
      stripeAccountId: balance.stripeAccountId,
      amountCents: input.amountCents.toString(),
      currency,
      requestId,
    });

    return mapApprovalSummary(approval);
  }

  /** List workspace requests. */
  async listWorkspaceRequests(input: {
    workspaceId: string;
    accountBalanceId?: string;
    state?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: ConnectPayoutApprovalSummary[]; total: number }> {
    if (input.accountBalanceId) {
      const balance = await this.prisma.connectAccountBalance.findFirst({
        where: { id: input.accountBalanceId, workspaceId: input.workspaceId },
        select: { id: true },
      });
      if (!balance) {
        throw new NotFoundException('Connect account balance not found for this workspace');
      }
    }

    return this.listRequestsInternal({
      workspaceId: input.workspaceId,
      entityId: input.accountBalanceId,
      state: input.state,
      skip: input.skip,
      take: input.take,
    });
  }

  /** List admin requests. */
  async listAdminRequests(input: {
    workspaceId?: string;
    state?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: ConnectPayoutApprovalSummary[]; total: number }> {
    return this.listRequestsInternal({
      workspaceId: input.workspaceId,
      state: input.state,
      skip: input.skip,
      take: input.take,
    });
  }

  /** Approve request. */
  async approveRequest(input: { approvalRequestId: string; adminUserId: string }): Promise<{
    approvalRequestId: string;
    state: string;
    payoutId: string;
    status: string;
    accountBalanceId: string;
    stripeAccountId: string;
    amountCents: string;
    currency: string;
  }> {
    const approval = await this.prisma.approvalRequest.findUnique({
      where: { id: input.approvalRequestId },
      select: {
        id: true,
        workspaceId: true,
        kind: true,
        state: true,
        payload: true,
      },
    });
    if (!approval || approval.kind !== CONNECT_PAYOUT_APPROVAL_KIND) {
      throw new NotFoundException('Connect payout approval request not found');
    }
    if (approval.state !== 'OPEN') {
      throw new BadRequestException('Connect payout approval request is not open');
    }

    const payload = parseApprovalPayload(approval.payload);

    let payoutResult;
    try {
      payoutResult = await this.connectPayoutService.createPayout({
        accountBalanceId: payload.accountBalanceId,
        workspaceId: approval.workspaceId,
        amountCents: BigInt(payload.amountCents),
        requestId: payload.requestId,
        currency: payload.currency.toLowerCase(),
      });
    } catch (error: unknown) {
      await this.handleApprovalFailure({
        approvalId: approval.id,
        approvalWorkspaceId: approval.workspaceId,
        adminUserId: input.adminUserId,
        payload,
        error,
      });
      throw error;
    }

    await this.prisma.$transaction(
      async (tx) => {
        await tx.approvalRequest.updateMany({
          where: { id: approval.id, workspaceId: approval.workspaceId },
          data: {
            state: 'APPROVED',
            respondedAt: new Date(),
            response: JSON.parse(
              JSON.stringify({
                approvedByAdminId: input.adminUserId,
                payoutId: payoutResult.payoutId,
                status: payoutResult.status,
                amountCents: payoutResult.amountCents.toString(),
                currency: payload.currency,
              }),
            ) as Prisma.InputJsonObject,
          },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );

    await this.appendAudit({
      adminUserId: input.adminUserId,
      action: 'admin.carteira.connect_withdrawal_approved',
      entityId: payload.accountBalanceId,
      details: {
        approvalRequestId: approval.id,
        workspaceId: payload.workspaceId,
        accountType: payload.accountType,
        stripeAccountId: payload.stripeAccountId,
        requestId: payload.requestId,
        payoutId: payoutResult.payoutId,
        status: payoutResult.status,
        amountCents: payoutResult.amountCents.toString(),
        currency: payload.currency,
      },
    });

    await this.appendAudit({
      action: 'system.connect.payout_requested',
      entityId: payload.accountBalanceId,
      details: {
        approvalRequestId: approval.id,
        workspaceId: payload.workspaceId,
        accountType: payload.accountType,
        stripeAccountId: payload.stripeAccountId,
        requestId: payload.requestId,
        payoutId: payoutResult.payoutId,
        status: payoutResult.status,
        amountCents: payoutResult.amountCents.toString(),
      },
    });

    this.logger.log('connect payout approved', {
      approvalRequestId: approval.id,
      workspaceId: payload.workspaceId,
      accountBalanceId: payload.accountBalanceId,
      accountType: payload.accountType,
      stripeAccountId: payload.stripeAccountId,
      payoutId: payoutResult.payoutId,
      status: payoutResult.status,
      amountCents: payoutResult.amountCents.toString(),
      currency: payload.currency,
      requestId: payload.requestId,
      adminUserId: input.adminUserId,
    });

    return {
      approvalRequestId: approval.id,
      state: 'APPROVED',
      payoutId: payoutResult.payoutId,
      status: payoutResult.status,
      accountBalanceId: payoutResult.accountBalanceId,
      stripeAccountId: payoutResult.stripeAccountId,
      amountCents: payoutResult.amountCents.toString(),
      currency: payload.currency,
    };
  }

  /** Reject request. */
  async rejectRequest(input: {
    approvalRequestId: string;
    adminUserId: string;
    reason?: string;
  }): Promise<{ approvalRequestId: string; state: string }> {
    const approval = await this.prisma.approvalRequest.findUnique({
      where: { id: input.approvalRequestId },
      select: {
        id: true,
        workspaceId: true,
        kind: true,
        state: true,
        payload: true,
      },
    });
    if (!approval || approval.kind !== CONNECT_PAYOUT_APPROVAL_KIND) {
      throw new NotFoundException('Connect payout approval request not found');
    }
    if (approval.state !== 'OPEN') {
      throw new BadRequestException('Connect payout approval request is not open');
    }

    const payload = parseApprovalPayload(approval.payload);

    await this.prisma.approvalRequest.updateMany({
      where: { id: approval.id, workspaceId: approval.workspaceId },
      data: {
        state: 'REJECTED',
        respondedAt: new Date(),
        response: JSON.parse(
          JSON.stringify({
            rejectedByAdminId: input.adminUserId,
            reason: input.reason ?? null,
            amountCents: payload.amountCents,
            currency: payload.currency,
          }),
        ) as Prisma.InputJsonObject,
      },
    });

    await this.appendAudit({
      adminUserId: input.adminUserId,
      action: 'admin.carteira.connect_withdrawal_rejected',
      entityId: payload.accountBalanceId,
      details: {
        approvalRequestId: approval.id,
        workspaceId: payload.workspaceId,
        accountType: payload.accountType,
        stripeAccountId: payload.stripeAccountId,
        requestId: payload.requestId,
        amountCents: payload.amountCents,
        currency: payload.currency,
        reason: input.reason ?? null,
      },
    });

    this.logger.log('connect payout rejected', {
      approvalRequestId: approval.id,
      workspaceId: payload.workspaceId,
      accountBalanceId: payload.accountBalanceId,
      accountType: payload.accountType,
      stripeAccountId: payload.stripeAccountId,
      amountCents: payload.amountCents,
      currency: payload.currency,
      requestId: payload.requestId,
      adminUserId: input.adminUserId,
      reason: input.reason ?? null,
    });

    return {
      approvalRequestId: approval.id,
      state: 'REJECTED',
    };
  }

  private async handleApprovalFailure(input: {
    approvalId: string;
    approvalWorkspaceId: string;
    adminUserId: string;
    payload: ConnectPayoutApprovalPayload;
    error: unknown;
  }): Promise<void> {
    const { approvalId, approvalWorkspaceId, adminUserId, payload, error } = input;
    const errorObject = error instanceof Error ? error : null;
    const errorMessage =
      errorObject?.message ?? (typeof error === 'string' ? error : JSON.stringify(error));

    this.logger.error('connect payout approval failed', errorObject?.stack, {
      approvalRequestId: approvalId,
      workspaceId: payload.workspaceId,
      accountBalanceId: payload.accountBalanceId,
      accountType: payload.accountType,
      stripeAccountId: payload.stripeAccountId,
      amountCents: payload.amountCents,
      currency: payload.currency,
      requestId: payload.requestId,
      adminUserId,
      error: errorMessage,
    });

    await this.prisma.$transaction(
      async (tx) => {
        await tx.approvalRequest.updateMany({
          where: { id: approvalId, workspaceId: approvalWorkspaceId },
          data: {
            state: 'FAILED',
            respondedAt: new Date(),
            response: JSON.parse(
              JSON.stringify({
                error: errorMessage,
                amountCents: payload.amountCents,
                currency: payload.currency,
                approvedByAdminId: adminUserId,
              }),
            ) as Prisma.InputJsonObject,
          },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );

    await this.appendAudit({
      adminUserId,
      action: 'admin.carteira.connect_withdrawal_approval_failed',
      entityId: payload.accountBalanceId,
      details: {
        approvalRequestId: approvalId,
        workspaceId: payload.workspaceId,
        accountType: payload.accountType,
        stripeAccountId: payload.stripeAccountId,
        requestId: payload.requestId,
        amountCents: payload.amountCents,
        currency: payload.currency,
        error: errorMessage,
      },
    });

    await this.appendAudit({
      action: 'system.connect.payout_request_failed',
      entityId: payload.accountBalanceId,
      details: {
        approvalRequestId: approvalId,
        workspaceId: payload.workspaceId,
        accountType: payload.accountType,
        stripeAccountId: payload.stripeAccountId,
        requestId: payload.requestId,
        payoutId: null,
        status: 'failed',
        amountCents: payload.amountCents,
        error: errorMessage,
      },
    });

    Sentry.captureException(error, {
      tags: { type: 'financial_alert', operation: 'connect_payout_approval' },
      extra: {
        approvalRequestId: approvalId,
        workspaceId: payload.workspaceId,
        accountBalanceId: payload.accountBalanceId,
        requestId: payload.requestId,
        amountCents: payload.amountCents,
      },
      level: 'fatal',
    });
  }

  private async listRequestsInternal(input: {
    workspaceId?: string;
    entityId?: string;
    state?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: ConnectPayoutApprovalSummary[]; total: number }> {
    const where = {
      kind: CONNECT_PAYOUT_APPROVAL_KIND,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.entityId ? { entityId: input.entityId } : {}),
      ...(input.state ? { state: input.state } : {}),
    };
    const skip = Math.max(0, input.skip ?? 0);
    const take = Math.min(200, Math.max(1, input.take ?? 50));

    const [items, total] = await this.prisma.$transaction(
      [
        this.prisma.approvalRequest.findMany({
          where: { ...where, workspaceId: input.workspaceId },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        this.prisma.approvalRequest.count({ where: { ...where, workspaceId: input.workspaceId } }),
      ],
      { isolationLevel: 'ReadCommitted' },
    );

    return {
      items: items.map((item) => mapApprovalSummary(item)),
      total,
    };
  }

  private async appendAudit(input: {
    action: string;
    entityId: string;
    adminUserId?: string;
    details: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.prisma.adminAuditLog.create({
        data: {
          adminUserId: input.adminUserId ?? null,
          action: input.action,
          entityType: 'connect_account_balance',
          entityId: input.entityId,
          details: input.details as Prisma.InputJsonValue,
        },
      });
    } catch {
      // Audit append must not block payout lifecycle transitions.
    }
  }
}
