import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { Throttle } from '@nestjs/throttler';
import { ConnectAccountType, type ConnectLedgerEntryType } from '@prisma/client';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../../common/guards/workspace.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';

import { ConnectPayoutService } from './connect-payout.service';
import { ConnectPayoutApprovalService } from './connect-payout-approval.service';
import { ConnectLedgerReconciliationService } from '../ledger/connect-ledger-reconciliation.service';
import { ConnectService } from './connect.service';
import {
  ConnectAccountAlreadyExistsError,
  type SubmitOnboardingProfileInput,
} from './connect.types';

const CONNECT_LEDGER_ENTRY_TYPES: ConnectLedgerEntryType[] = [
  'CREDIT_PENDING',
  'MATURE',
  'DEBIT_PAYOUT',
  'DEBIT_CHARGEBACK',
  'DEBIT_REFUND',
  'ADJUSTMENT',
];
const CONNECT_ACCOUNT_TYPES = Object.values(ConnectAccountType);

function parseSkip(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : undefined;
}

function parseTake(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(200, Math.max(1, Math.trunc(parsed))) : undefined;
}

/** Connect controller. */
@Controller('payments/connect')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@Throttle({ default: { limit: 20, ttl: 60000 } })
export class ConnectController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connectService: ConnectService,
    private readonly ledgerService: LedgerService,
    private readonly connectLedgerReconciliationService: ConnectLedgerReconciliationService,
    private readonly connectPayoutApprovalService: ConnectPayoutApprovalService,
    private readonly connectPayoutService: ConnectPayoutService,
  ) {}

  /** List accounts. */
  @Get(':workspaceId/accounts')
  async listAccounts(@Param('workspaceId') workspaceId: string) {
    const balances = await this.prisma.connectAccountBalance.findMany({
      where: { workspaceId },
      orderBy: [{ accountType: 'asc' }, { createdAt: 'asc' }],
    });

    const accounts = await Promise.all(
      balances.map(async (balance) => {
        const [snapshot, onboarding] = await Promise.all([
          this.ledgerService.getBalance(balance.id),
          this.connectService.getOnboardingStatus(balance.stripeAccountId).catch(() => null),
        ]);

        return {
          accountBalanceId: balance.id,
          workspaceId: balance.workspaceId,
          stripeAccountId: balance.stripeAccountId,
          accountType: balance.accountType,
          pendingCents: snapshot.pendingCents.toString(),
          availableCents: snapshot.availableCents.toString(),
          lifetimeReceivedCents: snapshot.lifetimeReceivedCents.toString(),
          lifetimePaidOutCents: snapshot.lifetimePaidOutCents.toString(),
          lifetimeChargebacksCents: snapshot.lifetimeChargebacksCents.toString(),
          onboarding,
        };
      }),
    );

    return { accounts };
  }

  /** Create account. */
  @Post(':workspaceId/accounts')
  async createAccount(
    @Param('workspaceId') workspaceId: string,
    @Body()
    body: {
      accountType?: string;
      email?: string;
      country?: string;
      displayName?: string;
    },
  ) {
    const accountType = String(body.accountType || '').trim();
    if (!CONNECT_ACCOUNT_TYPES.includes(accountType as ConnectAccountType)) {
      throw new BadRequestException('accountType must be a valid ConnectAccountType');
    }

    const email = String(body.email || '').trim();
    if (!email) {
      throw new BadRequestException('email is required');
    }

    try {
      return await this.connectService.createCustomAccount({
        workspaceId,
        accountType: accountType as ConnectAccountType,
        email,
        country:
          typeof body.country === 'string' && body.country.trim() ? body.country.trim() : undefined,
        displayName:
          typeof body.displayName === 'string' && body.displayName.trim()
            ? body.displayName.trim()
            : undefined,
      });
    } catch (error) {
      if (error instanceof ConnectAccountAlreadyExistsError) {
        throw new ConflictException(error.message);
      }
      Sentry.captureException(error, {
        tags: { type: 'financial_alert', operation: 'connect_custom_account_create' },
        extra: { workspaceId, accountType },
        level: 'error',
      });
      throw error;
    }
  }

  /** Submit onboarding data directly from Kloel's UI. */
  @Post(':workspaceId/accounts/:accountBalanceId/onboarding')
  async submitOnboardingProfile(
    @Param('workspaceId') workspaceId: string,
    @Param('accountBalanceId') accountBalanceId: string,
    @Body() body: Omit<SubmitOnboardingProfileInput, 'stripeAccountId'>,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-forwarded-for') forwardedFor?: string,
  ) {
    const balanceId = String(accountBalanceId || '').trim();
    if (!balanceId) {
      throw new BadRequestException('accountBalanceId is required');
    }

    const balance = await this.prisma.connectAccountBalance.findFirst({
      where: { id: balanceId, workspaceId },
    });
    if (!balance) {
      throw new NotFoundException('Connect account balance not found for this workspace');
    }

    const hasProfileUpdate = [
      typeof body.email === 'string' && body.email.trim(),
      typeof body.country === 'string' && body.country.trim(),
      typeof body.businessType === 'string' && body.businessType.trim(),
      body.businessProfile && Object.keys(body.businessProfile).length > 0,
      body.individual && Object.keys(body.individual).length > 0,
      body.company && Object.keys(body.company).length > 0,
      body.externalAccount && Object.keys(body.externalAccount).length > 0,
      body.tosAcceptance && Object.keys(body.tosAcceptance).length > 0,
      body.metadata && Object.keys(body.metadata).length > 0,
    ].some(Boolean);
    if (!hasProfileUpdate) {
      throw new BadRequestException('at least one onboarding field is required');
    }

    const forwardedIp =
      typeof forwardedFor === 'string' && forwardedFor.trim()
        ? forwardedFor.split(',')[0]?.trim() || undefined
        : undefined;
    const tosAcceptance = body.tosAcceptance
      ? {
          ...body.tosAcceptance,
          ipAddress: body.tosAcceptance.ipAddress || forwardedIp,
          userAgent: body.tosAcceptance.userAgent || userAgent,
        }
      : undefined;

    const result = await this.connectService.submitOnboardingProfile({
      stripeAccountId: balance.stripeAccountId,
      email: body.email,
      country: body.country,
      businessType: body.businessType,
      businessProfile: body.businessProfile,
      individual: body.individual,
      company: body.company,
      externalAccount: body.externalAccount,
      tosAcceptance,
      metadata: body.metadata,
    });

    return {
      accountBalanceId: balance.id,
      workspaceId,
      accountType: balance.accountType,
      ...result,
    };
  }

  /** Reconcile workspace. */
  @Get(':workspaceId/reconcile')
  async reconcileWorkspace(@Param('workspaceId') workspaceId: string) {
    return this.connectLedgerReconciliationService.reconcile({ workspaceId });
  }

  /** List payout requests. */
  @Get(':workspaceId/payout-requests')
  async listPayoutRequests(
    @Param('workspaceId') workspaceId: string,
    @Query('accountBalanceId') accountBalanceId?: string,
    @Query('state') state?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.connectPayoutApprovalService.listWorkspaceRequests({
      workspaceId,
      accountBalanceId: accountBalanceId ? String(accountBalanceId).trim() : undefined,
      state: state ? String(state).trim() : undefined,
      skip: parseSkip(skip),
      take: parseTake(take),
    });
  }

  /** List payouts. */
  @Get(':workspaceId/payouts')
  async listPayouts(
    @Param('workspaceId') workspaceId: string,
    @Query('accountBalanceId') accountBalanceId?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const balances = await this.prisma.connectAccountBalance.findMany({
      where: {
        workspaceId,
        ...(accountBalanceId ? { id: accountBalanceId } : {}),
      },
      select: {
        id: true,
        accountType: true,
        stripeAccountId: true,
      },
      orderBy: [{ accountType: 'asc' }, { createdAt: 'asc' }],
    });

    if (accountBalanceId && balances.length === 0) {
      throw new NotFoundException('Connect account balance not found for this workspace');
    }

    if (balances.length === 0) {
      return {
        items: [],
        total: 0,
      };
    }

    const balanceById = new Map(
      balances.map((balance) => [
        balance.id,
        {
          accountType: balance.accountType,
          stripeAccountId: balance.stripeAccountId,
        },
      ]),
    );
    const accountBalanceIds: string[] = [...balanceById.keys()];
    const parsedSkip = Math.max(0, Number(skip ?? 0) || 0);
    const parsedTake = Math.min(200, Math.max(1, Number(take ?? 50) || 50));
    const where = {
      entityType: 'connect_account_balance',
      entityId: { in: accountBalanceIds },
      action: { contains: 'connect.payout' },
    };

    const [items, total] = await this.prisma.$transaction(
      [
        this.prisma.adminAuditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: parsedSkip,
          take: parsedTake,
        }),
        this.prisma.adminAuditLog.count({ where }),
      ],
      { isolationLevel: 'ReadCommitted' },
    );

    return {
      items: items.map((item) => {
        const details =
          item.details && typeof item.details === 'object' && !Array.isArray(item.details)
            ? (item.details as Record<string, unknown>)
            : {};
        const balance =
          item.entityId && typeof item.entityId === 'string'
            ? balanceById.get(item.entityId)
            : null;

        return {
          id: item.id,
          action: item.action,
          createdAt: item.createdAt.toISOString(),
          accountBalanceId: item.entityId,
          accountType: balance?.accountType ?? null,
          stripeAccountId: balance?.stripeAccountId ?? null,
          requestId: typeof details.requestId === 'string' ? details.requestId : null,
          payoutId: typeof details.payoutId === 'string' ? details.payoutId : null,
          status: typeof details.status === 'string' ? details.status : null,
          amountCents: typeof details.amountCents === 'string' ? details.amountCents : null,
          error: typeof details.error === 'string' ? details.error : null,
        };
      }),
      total,
    };
  }

  /** List ledger. */
  @Get(':workspaceId/ledger')
  async listLedger(
    @Param('workspaceId') workspaceId: string,
    @Query('accountBalanceId') accountBalanceId?: string,
    @Query('type') entryType?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const balances = await this.prisma.connectAccountBalance.findMany({
      where: {
        workspaceId,
        ...(accountBalanceId ? { id: accountBalanceId } : {}),
      },
      select: {
        id: true,
        accountType: true,
        stripeAccountId: true,
      },
      orderBy: [{ accountType: 'asc' }, { createdAt: 'asc' }],
    });

    if (accountBalanceId && balances.length === 0) {
      throw new NotFoundException('Connect account balance not found for this workspace');
    }

    if (balances.length === 0) {
      return {
        items: [],
        total: 0,
      };
    }

    const balanceById = new Map(
      balances.map((balance) => [
        balance.id,
        {
          accountType: balance.accountType,
          stripeAccountId: balance.stripeAccountId,
        },
      ]),
    );
    const parsedSkip = Math.max(0, Number(skip ?? 0) || 0);
    const parsedTake = Math.min(200, Math.max(1, Number(take ?? 50) || 50));
    const parsedEntryType =
      entryType && CONNECT_LEDGER_ENTRY_TYPES.includes(entryType as ConnectLedgerEntryType)
        ? (entryType as ConnectLedgerEntryType)
        : undefined;
    const where = {
      accountBalanceId: { in: [...balanceById.keys()] as string[] },
      ...(parsedEntryType ? { type: parsedEntryType } : {}),
    };

    const [items, total] = await this.prisma.$transaction(
      [
        this.prisma.connectLedgerEntry.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: parsedSkip,
          take: parsedTake,
        }),
        this.prisma.connectLedgerEntry.count({ where }),
      ],
      { isolationLevel: 'ReadCommitted' },
    );

    return {
      items: items.map((item) => {
        const balance = balanceById.get(item.accountBalanceId) ?? null;
        return {
          id: item.id,
          accountBalanceId: item.accountBalanceId,
          accountType: balance?.accountType ?? null,
          stripeAccountId: balance?.stripeAccountId ?? null,
          type: item.type,
          amountCents: item.amountCents.toString(),
          balanceAfterPendingCents: item.balanceAfterPendingCents.toString(),
          balanceAfterAvailableCents: item.balanceAfterAvailableCents.toString(),
          referenceType: item.referenceType,
          referenceId: item.referenceId,
          scheduledFor: item.scheduledFor?.toISOString() ?? null,
          matured: item.matured,
          createdAt: item.createdAt.toISOString(),
        };
      }),
      total,
    };
  }

  /** Create payout. */
  @Post(':workspaceId/payouts')
  async createPayout(
    @Param('workspaceId') workspaceId: string,
    @Body()
    body: {
      accountBalanceId?: string;
      amountCents?: number;
      requestId?: string;
      currency?: string;
    },
  ) {
    const accountBalanceId = String(body.accountBalanceId || '').trim();
    if (!accountBalanceId) {
      throw new BadRequestException('accountBalanceId is required');
    }

    const requestedAmount = Math.trunc(Number(body.amountCents || 0));
    if (!Number.isSafeInteger(requestedAmount) || requestedAmount <= 0) {
      throw new BadRequestException('amountCents must be a positive integer');
    }

    const balance = await this.prisma.connectAccountBalance.findFirst({
      where: { id: accountBalanceId, workspaceId },
    });
    if (!balance) {
      throw new NotFoundException('Connect account balance not found for this workspace');
    }

    const requestId = String(body.requestId || '').trim() || `po_${randomUUID()}`;

    let result;
    try {
      result = await this.connectPayoutService.createPayout({
        accountBalanceId,
        workspaceId,
        amountCents: BigInt(requestedAmount),
        requestId,
        currency: body.currency,
      });
    } catch (error) {
      await this.appendPayoutAudit({
        action: 'system.connect.payout_request_failed',
        accountBalanceId: balance.id,
        workspaceId: balance.workspaceId,
        accountType: String(balance.accountType),
        stripeAccountId: balance.stripeAccountId,
        requestId,
        payoutId: null,
        status: 'failed',
        amountCents: String(requestedAmount),
        error: error instanceof Error ? error.message : String(error),
      });
      Sentry.captureException(error, {
        tags: { type: 'financial_alert', operation: 'connect_payout_request' },
        extra: {
          accountBalanceId: balance.id,
          workspaceId: balance.workspaceId,
          requestId,
          amountCents: String(requestedAmount),
        },
        level: 'fatal',
      });
      throw error;
    }

    await this.appendPayoutAudit({
      action: 'system.connect.payout_requested',
      accountBalanceId: balance.id,
      workspaceId: balance.workspaceId,
      accountType: String(balance.accountType),
      stripeAccountId: balance.stripeAccountId,
      requestId,
      payoutId: result.payoutId,
      status: result.status,
      amountCents: result.amountCents.toString(),
    });

    return {
      success: true,
      payoutId: result.payoutId,
      status: result.status,
      accountBalanceId: result.accountBalanceId,
      stripeAccountId: result.stripeAccountId,
      amountCents: result.amountCents.toString(),
    };
  }

  /** Create payout request. */
  @Post(':workspaceId/payout-requests')
  async createPayoutRequest(
    @Param('workspaceId') workspaceId: string,
    @Body()
    body: {
      accountBalanceId?: string;
      amountCents?: number;
      currency?: string;
    },
  ) {
    const accountBalanceId = String(body.accountBalanceId || '').trim();
    if (!accountBalanceId) {
      throw new BadRequestException('accountBalanceId is required');
    }

    const requestedAmount = Math.trunc(Number(body.amountCents || 0));
    if (!Number.isSafeInteger(requestedAmount) || requestedAmount <= 0) {
      throw new BadRequestException('amountCents must be a positive integer');
    }

    const result = await this.connectPayoutApprovalService.createRequest({
      workspaceId,
      accountBalanceId,
      amountCents: BigInt(requestedAmount),
      currency: body.currency,
    });

    return {
      success: true,
      ...result,
    };
  }

  private async appendPayoutAudit(input: {
    action: string;
    accountBalanceId: string;
    workspaceId: string;
    accountType: string;
    stripeAccountId: string;
    requestId?: string | null;
    payoutId?: string | null;
    status: string;
    amountCents: string;
    error?: string;
  }): Promise<void> {
    try {
      await this.prisma.adminAuditLog.create({
        data: {
          action: input.action,
          entityType: 'connect_account_balance',
          entityId: input.accountBalanceId,
          details: {
            workspaceId: input.workspaceId,
            accountType: input.accountType,
            stripeAccountId: input.stripeAccountId,
            requestId: input.requestId ?? null,
            payoutId: input.payoutId ?? null,
            status: input.status,
            amountCents: input.amountCents,
            ...(input.error ? { error: input.error } : {}),
          },
        },
      });
    } catch {
      // Audit append must not block payout execution.
    }
  }
}
