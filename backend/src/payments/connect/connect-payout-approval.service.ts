import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { InsufficientAvailableBalanceError } from '../ledger/ledger.types';

import { ConnectPayoutService } from './connect-payout.service';

const CONNECT_PAYOUT_APPROVAL_KIND = 'connect_payout';

interface ConnectPayoutApprovalPayload {
  version: 1;
  workspaceId: string;
  accountBalanceId: string;
  accountType: string;
  stripeAccountId: string;
  amountCents: string;
  currency: string;
  requestId: string;
  requestedByType: 'workspace';
}

/** Connect payout approval decision shape. */
export interface ConnectPayoutApprovalDecision {
  /** Payout id property. */
  payoutId?: string | null;
  /** Status property. */
  status?: string | null;
  /** Amount cents property. */
  amountCents: string;
  /** Currency property. */
  currency: string;
  /** Approved by admin id property. */
  approvedByAdminId?: string | null;
  /** Rejected by admin id property. */
  rejectedByAdminId?: string | null;
  /** Reason property. */
  reason?: string | null;
  /** Error property. */
  error?: string | null;
}

/** Create connect payout approval input shape. */
export interface CreateConnectPayoutApprovalInput {
  /** Workspace id property. */
  workspaceId: string;
  /** Account balance id property. */
  accountBalanceId: string;
  /** Amount cents property. */
  amountCents: bigint;
  /** Currency property. */
  currency?: string;
}

/** Connect payout approval summary shape. */
export interface ConnectPayoutApprovalSummary {
  /** Approval request id property. */
  approvalRequestId: string;
  /** Workspace id property. */
  workspaceId: string;
  /** Account balance id property. */
  accountBalanceId: string;
  /** Account type property. */
  accountType: string;
  /** Stripe account id property. */
  stripeAccountId: string;
  /** Amount cents property. */
  amountCents: string;
  /** Currency property. */
  currency: string;
  /** Request id property. */
  requestId: string;
  /** State property. */
  state: string;
  /** Title property. */
  title: string;
  /** Created at property. */
  createdAt: string;
  /** Updated at property. */
  updatedAt: string;
  /** Responded at property. */
  respondedAt: string | null;
  /** Decision property. */
  decision: ConnectPayoutApprovalDecision | null;
}

/** Connect payout approval service. */
@Injectable()
export class ConnectPayoutApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connectPayoutService: ConnectPayoutService,
  ) {}

  private readonly logger = new Logger(ConnectPayoutApprovalService.name);

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
        payload: payload as unknown as Prisma.InputJsonValue,
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

    return this.mapApprovalSummary(approval);
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
    });
    if (!approval || approval.kind !== CONNECT_PAYOUT_APPROVAL_KIND) {
      throw new NotFoundException('Connect payout approval request not found');
    }
    if (approval.state !== 'OPEN') {
      throw new BadRequestException('Connect payout approval request is not open');
    }

    const payload = this.parseApprovalPayload(approval.payload);

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
      this.logger.error(
        {
          workspaceId: payload.workspaceId,
          externalId: payload.requestId,
          operation: 'approve_payout',
          approvalRequestId: approval.id,
          stripeAccountId: payload.stripeAccountId,
          amountCents: payload.amountCents,
        },
        'Financial operation failed: approve_payout',
        error,
      );

      await this.prisma.approvalRequest.updateMany({
        where: { id: approval.id, workspaceId: approval.workspaceId },
        data: {
          state: 'FAILED',
          respondedAt: new Date(),
          response: {
            error: error instanceof Error ? error.message : String(error),
            amountCents: payload.amountCents,
            currency: payload.currency,
            approvedByAdminId: input.adminUserId,
          },
        },
      });

      await this.appendAudit({
        adminUserId: input.adminUserId,
        action: 'admin.carteira.connect_withdrawal_approval_failed',
        entityId: payload.accountBalanceId,
        details: {
          approvalRequestId: approval.id,
          workspaceId: payload.workspaceId,
          accountType: payload.accountType,
          stripeAccountId: payload.stripeAccountId,
          requestId: payload.requestId,
          amountCents: payload.amountCents,
          currency: payload.currency,
          error: error instanceof Error ? error.message : String(error),
        },
      });

      await this.appendAudit({
        action: 'system.connect.payout_request_failed',
        entityId: payload.accountBalanceId,
        details: {
          approvalRequestId: approval.id,
          workspaceId: payload.workspaceId,
          accountType: payload.accountType,
          stripeAccountId: payload.stripeAccountId,
          requestId: payload.requestId,
          payoutId: null,
          status: 'failed',
          amountCents: payload.amountCents,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }

    await this.prisma.approvalRequest.updateMany({
      where: { id: approval.id, workspaceId: approval.workspaceId },
      data: {
        state: 'APPROVED',
        respondedAt: new Date(),
        response: {
          approvedByAdminId: input.adminUserId,
          payoutId: payoutResult.payoutId,
          status: payoutResult.status,
          amountCents: payoutResult.amountCents.toString(),
          currency: payload.currency,
        },
      },
    });

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
    });
    if (!approval || approval.kind !== CONNECT_PAYOUT_APPROVAL_KIND) {
      throw new NotFoundException('Connect payout approval request not found');
    }
    if (approval.state !== 'OPEN') {
      throw new BadRequestException('Connect payout approval request is not open');
    }

    const payload = this.parseApprovalPayload(approval.payload);

    await this.prisma.approvalRequest.updateMany({
      where: { id: approval.id, workspaceId: approval.workspaceId },
      data: {
        state: 'REJECTED',
        respondedAt: new Date(),
        response: {
          rejectedByAdminId: input.adminUserId,
          reason: input.reason ?? null,
          amountCents: payload.amountCents,
          currency: payload.currency,
        },
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

    return {
      approvalRequestId: approval.id,
      state: 'REJECTED',
    };
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
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        this.prisma.approvalRequest.count({ where }),
      ],
      { isolationLevel: 'ReadCommitted' },
    );

    return {
      items: items.map((item) => this.mapApprovalSummary(item)),
      total,
    };
  }

  private mapApprovalSummary(
    approval: Awaited<ReturnType<PrismaService['approvalRequest']['create']>>,
  ): ConnectPayoutApprovalSummary {
    const payload = this.parseApprovalPayload(approval.payload);
    const decision = this.parseDecision(approval.response);

    return {
      approvalRequestId: approval.id,
      workspaceId: payload.workspaceId,
      accountBalanceId: payload.accountBalanceId,
      accountType: payload.accountType,
      stripeAccountId: payload.stripeAccountId,
      amountCents: payload.amountCents,
      currency: payload.currency,
      requestId: payload.requestId,
      state: approval.state,
      title: approval.title,
      createdAt: approval.createdAt.toISOString(),
      updatedAt: approval.updatedAt.toISOString(),
      respondedAt: approval.respondedAt?.toISOString() ?? null,
      decision,
    };
  }

  private parseApprovalPayload(value: unknown): ConnectPayoutApprovalPayload {
    const record = this.asRecord(value);
    const amountCents = this.asNonEmptyString(record?.amountCents, 'approval payload.amountCents');
    const currency = this.asNonEmptyString(record?.currency, 'approval payload.currency');

    return {
      version: 1,
      workspaceId: this.asNonEmptyString(record?.workspaceId, 'approval payload.workspaceId'),
      accountBalanceId: this.asNonEmptyString(
        record?.accountBalanceId,
        'approval payload.accountBalanceId',
      ),
      accountType: this.asNonEmptyString(record?.accountType, 'approval payload.accountType'),
      stripeAccountId: this.asNonEmptyString(
        record?.stripeAccountId,
        'approval payload.stripeAccountId',
      ),
      amountCents,
      currency,
      requestId: this.asNonEmptyString(record?.requestId, 'approval payload.requestId'),
      requestedByType: 'workspace',
    };
  }

  private parseDecision(value: unknown): ConnectPayoutApprovalDecision | null {
    const record = this.asRecord(value);
    if (!record) {
      return null;
    }

    const amountCents = typeof record.amountCents === 'string' ? record.amountCents : null;
    const currency = typeof record.currency === 'string' ? record.currency : null;
    if (!amountCents || !currency) {
      return null;
    }

    return {
      payoutId: typeof record.payoutId === 'string' ? record.payoutId : null,
      status: typeof record.status === 'string' ? record.status : null,
      amountCents,
      currency,
      approvedByAdminId:
        typeof record.approvedByAdminId === 'string' ? record.approvedByAdminId : null,
      rejectedByAdminId:
        typeof record.rejectedByAdminId === 'string' ? record.rejectedByAdminId : null,
      reason: typeof record.reason === 'string' ? record.reason : null,
      error: typeof record.error === 'string' ? record.error : null,
    };
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private asNonEmptyString(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`Invalid ${field}`);
    }
    return value.trim();
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
    } catch (_error: unknown) {
      // Audit append must not block payout lifecycle transitions.
    }
  }
}
