import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AdminAction,
  AdminModule,
  FraudBlacklistType,
  MarketplaceTreasuryLedgerKind,
} from '@prisma/client';
import { Public } from '../../auth/public.decorator';
import { CurrentAdmin } from '../auth/decorators/current-admin.decorator';
import { RequireAdminPermission } from '../auth/decorators/admin-permission.decorator';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';
import { AdminPermissionGuard } from '../auth/guards/admin-permission.guard';
import type { AuthenticatedAdmin } from '../auth/admin-token.types';
import { AdminAuditService } from '../audit/admin-audit.service';
import { ConnectLedgerReconciliationService } from '../../payments/ledger/connect-ledger-reconciliation.service';
import { ConnectPayoutApprovalService } from '../../payments/connect/connect-payout-approval.service';
import { ConnectService } from '../../payments/connect/connect.service';
import { FraudEngine } from '../../payments/fraud/fraud.engine';
import { LedgerService } from '../../payments/ledger/ledger.service';
import { MarketplaceTreasuryPayoutService } from '../../marketplace-treasury/marketplace-treasury-payout.service';
import { MarketplaceTreasuryReconcileService } from '../../marketplace-treasury/marketplace-treasury-reconcile.service';
import { MarketplaceTreasuryService } from '../../marketplace-treasury/marketplace-treasury.service';

/**
 * Admin endpoints for the marketplace treasury. Exposes read surfaces
 * (balance, ledger, reconcile) plus controlled manual payouts for
 * the marketplace treasury account with admin audit logging.
 */
@Public()
@Controller('admin/carteira')
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
export class AdminCarteiraController {
  constructor(
    private readonly wallet: MarketplaceTreasuryService,
    private readonly reconcile: MarketplaceTreasuryReconcileService,
    private readonly marketplaceTreasuryPayout: MarketplaceTreasuryPayoutService,
    private readonly connectService: ConnectService,
    private readonly connectLedger: LedgerService,
    private readonly connectReconcile: ConnectLedgerReconciliationService,
    private readonly connectPayoutApprovalService: ConnectPayoutApprovalService,
    private readonly fraudEngine: FraudEngine,
    private readonly audit: AdminAuditService,
  ) {}

  /** Balance. */
  @Get('balance')
  @RequireAdminPermission(AdminModule.CARTEIRA, AdminAction.VIEW)
  async balance(@Query('currency') currency?: string) {
    return this.wallet.readBalance(currency ?? 'BRL');
  }

  /** Ledger. */
  @Get('ledger')
  @RequireAdminPermission(AdminModule.CARTEIRA, AdminAction.VIEW)
  async ledger(
    @Query('currency') currency?: string,
    @Query('kind') kind?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const parsedKind =
      kind &&
      Object.values(MarketplaceTreasuryLedgerKind).includes(kind as MarketplaceTreasuryLedgerKind)
        ? (kind as MarketplaceTreasuryLedgerKind)
        : undefined;
    return this.wallet.listLedger({
      currency,
      kind: parsedKind,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }

  /** Run reconcile. */
  @Get('reconcile')
  @RequireAdminPermission(AdminModule.CARTEIRA, AdminAction.VIEW)
  async runReconcile(@Query('currency') currency?: string) {
    return this.reconcile.reconcile(currency ?? 'BRL');
  }

  /** List connect accounts. */
  @Get('connect/accounts')
  @RequireAdminPermission(AdminModule.CARTEIRA, AdminAction.VIEW)
  async listConnectAccounts(@Query('workspaceId') workspaceId?: string) {
    const balances = await this.connectService.listBalances(
      workspaceId ? String(workspaceId).trim() : undefined,
    );

    const accounts = await Promise.all(
      balances.map(async (balance) => {
        const [snapshot, onboarding] = await Promise.all([
          this.connectLedger.getBalance(balance.id),
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

  /** Reconcile connect. */
  @Get('connect/reconcile')
  @RequireAdminPermission(AdminModule.CARTEIRA, AdminAction.VIEW)
  async reconcileConnect(@Query('workspaceId') workspaceId?: string) {
    return this.connectReconcile.reconcile({
      workspaceId: workspaceId ? String(workspaceId).trim() : undefined,
    });
  }

  /** List payouts. */
  @Get('payouts')
  @RequireAdminPermission(AdminModule.CARTEIRA, AdminAction.VIEW)
  async listPayouts(@Query('skip') skip?: string, @Query('take') take?: string) {
    const result = await this.audit.list({
      action: 'carteira.payout',
      entityType: 'marketplace_treasury',
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });

    return {
      items: result.items.map((item) => {
        const details =
          item.details && typeof item.details === 'object' && !Array.isArray(item.details)
            ? (item.details as Record<string, unknown>)
            : {};
        const adminUser =
          'adminUser' in item && item.adminUser && typeof item.adminUser === 'object'
            ? item.adminUser
            : null;

        return {
          id: item.id,
          action: item.action,
          createdAt: item.createdAt.toISOString(),
          requestId: typeof details.requestId === 'string' ? details.requestId : null,
          payoutId: typeof details.payoutId === 'string' ? details.payoutId : null,
          status: typeof details.status === 'string' ? details.status : null,
          amountCents: typeof details.amountCents === 'string' ? details.amountCents : null,
          currency: typeof details.currency === 'string' ? details.currency : null,
          error: typeof details.error === 'string' ? details.error : null,
          adminUser,
        };
      }),
      total: result.total,
    };
  }

  /** List connect payout requests. */
  @Get('connect/payout-requests')
  @RequireAdminPermission(AdminModule.CARTEIRA, AdminAction.VIEW)
  async listConnectPayoutRequests(
    @Query('workspaceId') workspaceId?: string,
    @Query('state') state?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.connectPayoutApprovalService.listAdminRequests({
      workspaceId: workspaceId ? String(workspaceId).trim() : undefined,
      state: state ? String(state).trim() : undefined,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }

  /** List fraud blacklist rows. */
  @Get('fraud/blacklist')
  @RequireAdminPermission(AdminModule.CARTEIRA, AdminAction.VIEW)
  async listFraudBlacklist(
    @Query('type') type?: string,
    @Query('value') value?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const parsedType = type ? this.parseFraudBlacklistType(type) : undefined;
    const result = await this.fraudEngine.listBlacklist({
      type: parsedType,
      value: value ? String(value).trim() : undefined,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });

    return {
      items: result.items.map((row) => ({
        id: row.id,
        type: row.type,
        value: row.value,
        reason: row.reason,
        addedBy: row.addedBy,
        expiresAt: row.expiresAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      total: result.total,
    };
  }

  /** Add fraud blacklist row. */
  @Post('fraud/blacklist')
  @RequireAdminPermission(AdminModule.CARTEIRA, AdminAction.EDIT)
  async addFraudBlacklist(
    @Body()
    body: {
      type?: string;
      value?: string;
      reason?: string;
      expiresAt?: string | null;
    },
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const type = this.parseFraudBlacklistType(body.type);
    const value = String(body.value || '').trim();
    const reason = String(body.reason || '').trim();
    if (!value) {
      throw new BadRequestException('value is required');
    }
    if (!reason) {
      throw new BadRequestException('reason is required');
    }

    const row = await this.fraudEngine.addToBlacklist({
      type,
      value,
      reason,
      addedBy: admin.id,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    });

    await this.audit.append({
      adminUserId: admin.id,
      action: 'admin.carteira.fraud_blacklist_added',
      entityType: 'fraud_blacklist',
      entityId: `${row.type}:${row.value}`,
      details: {
        fraudBlacklistId: row.id,
        type: row.type,
        value: row.value,
        reason: row.reason,
        expiresAt: row.expiresAt?.toISOString() ?? null,
      },
    });

    return {
      id: row.id,
      type: row.type,
      value: row.value,
      reason: row.reason,
      addedBy: row.addedBy,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Remove fraud blacklist row. */
  @Post('fraud/blacklist/remove')
  @RequireAdminPermission(AdminModule.CARTEIRA, AdminAction.EDIT)
  async removeFraudBlacklist(
    @Body()
    body: {
      type?: string;
      value?: string;
    },
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const type = this.parseFraudBlacklistType(body.type);
    const value = String(body.value || '').trim();
    if (!value) {
      throw new BadRequestException('value is required');
    }

    const result = await this.fraudEngine.removeFromBlacklist({ type, value });

    await this.audit.append({
      adminUserId: admin.id,
      action: 'admin.carteira.fraud_blacklist_removed',
      entityType: 'fraud_blacklist',
      entityId: `${type}:${value}`,
      details: {
        type,
        value,
        removedCount: result.removedCount,
      },
    });

    return result;
  }

  /** Create payout. */
  @Post('payouts')
  @RequireAdminPermission(AdminModule.CARTEIRA, AdminAction.EDIT)
  async createPayout(
    @Body()
    body: {
      amountCents?: number;
      requestId?: string;
      currency?: string;
    },
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const amountCents = Math.trunc(Number(body.amountCents ?? 0));
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
      throw new BadRequestException('amountCents must be a positive integer');
    }

    const currency = String(body.currency || 'BRL')
      .trim()
      .toUpperCase();
    const requestId =
      String(body.requestId || '').trim() || `marketplace_treasury_po_${randomUUID()}`;

    let result;
    try {
      result = await this.marketplaceTreasuryPayout.createPayout({
        amountCents: BigInt(amountCents),
        requestId,
        currency,
      });
    } catch (error) {
      await this.audit.append({
        adminUserId: admin.id,
        action: 'admin.carteira.payout_request_failed',
        entityType: 'marketplace_treasury',
        entityId: currency,
        details: {
          requestId,
          amountCents: String(amountCents),
          currency,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }

    await this.audit.append({
      adminUserId: admin.id,
      action: 'admin.carteira.payout_requested',
      entityType: 'marketplace_treasury',
      entityId: currency,
      details: {
        requestId,
        payoutId: result.payoutId,
        status: result.status,
        amountCents: result.amountCents.toString(),
      },
    });

    return {
      success: true,
      payoutId: result.payoutId,
      status: result.status,
      amountCents: result.amountCents.toString(),
      currency: result.currency,
    };
  }

  /** Approve connect payout request. */
  @Post('connect/payout-requests/:approvalRequestId/approve')
  @RequireAdminPermission(AdminModule.CARTEIRA, AdminAction.APPROVE)
  async approveConnectPayoutRequest(
    @Param('approvalRequestId') approvalRequestId: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const normalizedId = String(approvalRequestId || '').trim();
    if (!normalizedId) {
      throw new BadRequestException('approvalRequestId is required');
    }

    return {
      success: true,
      ...(await this.connectPayoutApprovalService.approveRequest({
        approvalRequestId: normalizedId,
        adminUserId: admin.id,
      })),
    };
  }

  /** Reject connect payout request. */
  @Post('connect/payout-requests/:approvalRequestId/reject')
  @RequireAdminPermission(AdminModule.CARTEIRA, AdminAction.APPROVE)
  async rejectConnectPayoutRequest(
    @Param('approvalRequestId') approvalRequestId: string,
    @Body() body: { reason?: string },
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const normalizedId = String(approvalRequestId || '').trim();
    if (!normalizedId) {
      throw new BadRequestException('approvalRequestId is required');
    }

    return {
      success: true,
      ...(await this.connectPayoutApprovalService.rejectRequest({
        approvalRequestId: normalizedId,
        adminUserId: admin.id,
        reason:
          typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim() : undefined,
      })),
    };
  }

  private parseFraudBlacklistType(value: unknown): FraudBlacklistType {
    const normalized = (typeof value === 'string' ? value : '').trim().toUpperCase();
    if (Object.values(FraudBlacklistType).includes(normalized as FraudBlacklistType)) {
      return normalized as FraudBlacklistType;
    }
    throw new BadRequestException('type must be a valid FraudBlacklistType');
  }
}
