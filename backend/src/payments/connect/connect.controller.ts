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
import { ConnectAccountType } from '@prisma/client';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../../common/guards/workspace.guard';
import { Idempotent } from '../../common/idempotency.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';

import { ConnectPayoutApprovalService } from './connect-payout-approval.service';
import { ConnectLedgerReconciliationService } from '../ledger/connect-ledger-reconciliation.service';
import { ConnectService } from './connect.service';
import {
  ConnectAccountAlreadyExistsError,
  type SubmitOnboardingProfileInput,
} from './connect.types';
import {
  buildBalanceById,
  buildOnboardingProfileInput,
  hasOnboardingProfileUpdate,
  mapConnectLedgerEntry,
  mapPayoutAuditItem,
  parseConnectLedgerEntryType,
  parseForwardedIp,
  parsePaginationSkip,
  parsePaginationTake,
  parsePositiveIntegerCents,
  parseSkip,
  parseTake,
  resolveTosAcceptance,
} from './connect-helpers';
import { RouteClass } from '../../common/throttler/route-class.decorator';
import { WebhookEndpoint } from '../../common/decorators/webhook-endpoint.decorator';
import { InternalEndpoint } from '../../common/decorators/internal-endpoint.decorator';

const CONNECT_ACCOUNT_TYPES = Object.values(ConnectAccountType);

/** Connect controller. */
@Controller('payments/connect')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@RouteClass('mutate')
export class ConnectController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connectService: ConnectService,
    private readonly ledgerService: LedgerService,
    private readonly connectLedgerReconciliationService: ConnectLedgerReconciliationService,
    private readonly connectPayoutApprovalService: ConnectPayoutApprovalService,
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
  @WebhookEndpoint('Stripe Connect account webhook')
  @Post(':workspaceId/accounts')
  @Idempotent()
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
        ...(typeof body.country === 'string' && body.country.trim()
          ? { country: body.country.trim() }
          : {}),
        ...(typeof body.displayName === 'string' && body.displayName.trim()
          ? { displayName: body.displayName.trim() }
          : {}),
      });
    } catch (error: unknown) {
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
  @WebhookEndpoint('Stripe Connect onboarding submit')
  @Post(':workspaceId/accounts/:accountBalanceId/onboarding')
  @Idempotent()
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

    if (!hasOnboardingProfileUpdate(body)) {
      throw new BadRequestException('at least one onboarding field is required');
    }

    const forwardedIp = parseForwardedIp(forwardedFor);
    const tosAcceptance = resolveTosAcceptance(body.tosAcceptance, forwardedIp, userAgent);
    const profileInput = buildOnboardingProfileInput(balance.stripeAccountId, body, tosAcceptance);

    const result = await this.connectService.submitOnboardingProfile(profileInput);

    return {
      accountBalanceId: balance.id,
      workspaceId,
      accountType: balance.accountType,
      ...result,
    };
  }

  @InternalEndpoint('admin ledger reconciliation trigger')
  @Get(':workspaceId/reconcile')
  async reconcileWorkspace(@Param('workspaceId') workspaceId: string) {
    return this.connectLedgerReconciliationService.reconcile({ workspaceId });
  }

  @InternalEndpoint('admin payout requests listing')
  @Get(':workspaceId/payout-requests')
  async listPayoutRequests(
    @Param('workspaceId') workspaceId: string,
    @Query('accountBalanceId') accountBalanceId?: string,
    @Query('state') state?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const payload: {
      workspaceId: string;
      accountBalanceId?: string;
      state?: string;
      skip?: number;
      take?: number;
    } = {
      workspaceId,
    };
    if (accountBalanceId) {
      payload.accountBalanceId = String(accountBalanceId).trim();
    }
    if (state) {
      payload.state = String(state).trim();
    }
    const s = parseSkip(skip);
    if (s !== undefined) {
      payload.skip = s;
    }
    const t = parseTake(take);
    if (t !== undefined) {
      payload.take = t;
    }

    return this.connectPayoutApprovalService.listWorkspaceRequests(payload);
  }

  @InternalEndpoint('admin payouts listing')
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

    const balanceById = buildBalanceById(balances);
    const parsedSkip = parsePaginationSkip(skip);
    const parsedTake = parsePaginationTake(take);
    const where = {
      entityType: 'connect_account_balance',
      entityId: { in: [...balanceById.keys()] },
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
      items: items.map((item) => mapPayoutAuditItem(item, balanceById)),
      total,
    };
  }

  @InternalEndpoint('admin ledger entries listing')
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

    const balanceById = buildBalanceById(balances);
    const parsedSkip = parsePaginationSkip(skip);
    const parsedTake = parsePaginationTake(take);
    const parsedEntryType = parseConnectLedgerEntryType(entryType);
    const where = {
      accountBalanceId: { in: [...balanceById.keys()] },
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
      items: items.map((item) => mapConnectLedgerEntry(item, balanceById)),
      total,
    };
  }

  @InternalEndpoint('admin payout creation handler')
  @Post(':workspaceId/payouts')
  @Idempotent()
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

    const requestedAmount = parsePositiveIntegerCents(body.amountCents);
    if (requestedAmount === null) {
      throw new BadRequestException('amountCents must be a positive integer');
    }

    const balance = await this.prisma.connectAccountBalance.findFirst({
      where: { id: accountBalanceId, workspaceId },
    });
    if (!balance) {
      throw new NotFoundException('Connect account balance not found for this workspace');
    }

    const result = await this.connectPayoutApprovalService.createRequest({
      workspaceId,
      accountBalanceId,
      amountCents: BigInt(requestedAmount),
      ...(body.currency !== undefined ? { currency: body.currency } : {}),
    });

    return {
      success: true,
      approvalRequired: true,
      ...result,
    };
  }

  @InternalEndpoint('admin payout request creation')
  @Post(':workspaceId/payout-requests')
  @Idempotent()
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

    const requestedAmount = parsePositiveIntegerCents(body.amountCents);
    if (requestedAmount === null) {
      throw new BadRequestException('amountCents must be a positive integer');
    }

    const result = await this.connectPayoutApprovalService.createRequest({
      workspaceId,
      accountBalanceId,
      amountCents: BigInt(requestedAmount),
      ...(body.currency !== undefined ? { currency: body.currency } : {}),
    });

    return {
      success: true,
      ...result,
    };
  }
}
