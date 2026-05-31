import { randomUUID } from 'node:crypto';
import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { parseDateOrFail } from '../../common/parse-date-or-fail.helper';
import { AdminAction, AdminModule, MarketplaceTreasuryLedgerKind } from '@prisma/client';
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
import { AddFraudBlacklistDto } from './dto/add-fraud-blacklist.dto';
import { AdminCarteiraLedgerQueryDto } from './dto/admin-carteira-ledger-query.dto';
import { RouteClass } from '../../common/throttler/route-class.decorator';
import {
  buildFraudBlacklistAddedDetails,
  buildFraudBlacklistEntityId,
  buildFraudBlacklistRemovedDetails,
  buildTreasuryPayoutFailedDetails,
  buildTreasuryPayoutRequestedDetails,
  buildTreasuryPayoutResponse,
  mapConnectAccount,
  mapFraudBlacklistRow,
  mapPayoutAuditItem,
  normalizeCurrency,
  parseFraudBlacklistType,
  parseSkip,
  parseTake,
  requireNonEmpty,
  resolveTreasuryPayoutRequestId,
  trimOptional,
  validatePayoutAmount,
} from './admin-carteira.controller.helpers';

/**
 * Admin endpoints for the marketplace treasury. Exposes read surfaces
 * (balance, ledger, reconcile) plus controlled manual payouts for
 * the marketplace treasury account with admin audit logging.
 */
@Public()
@Controller('admin/carteira')
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
@RouteClass('read')
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
  async ledger(@Query() query: AdminCarteiraLedgerQueryDto) {
    const parsedKind =
      query.kind &&
      Object.values(MarketplaceTreasuryLedgerKind).includes(
        query.kind as MarketplaceTreasuryLedgerKind,
      )
        ? (query.kind as MarketplaceTreasuryLedgerKind)
        : undefined;
    const parsedFrom = parseDateOrFail(query.from, 'from');
    const parsedTo = parseDateOrFail(query.to, 'to');
    const parsedSkip = parseSkip(query.skip);
    const parsedTake = parseTake(query.take);
    return this.wallet.listLedger({
      ...(query.currency !== undefined ? { currency: query.currency } : {}),
      ...(parsedKind !== undefined ? { kind: parsedKind } : {}),
      ...(parsedFrom !== undefined ? { from: parsedFrom } : {}),
      ...(parsedTo !== undefined ? { to: parsedTo } : {}),
      ...(parsedSkip !== undefined ? { skip: parsedSkip } : {}),
      ...(parsedTake !== undefined ? { take: parsedTake } : {}),
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
    const balances = await this.connectService.listBalances(trimOptional(workspaceId));

    const accounts = await Promise.all(
      balances.map(async (balance) => {
        const [snapshot, onboarding] = await Promise.all([
          this.connectLedger.getBalance(balance.id),
          this.connectService.getOnboardingStatus(balance.stripeAccountId).catch(() => null),
        ]);

        return mapConnectAccount(balance, snapshot, onboarding);
      }),
    );

    return { accounts };
  }

  /** Reconcile connect. */
  @Get('connect/reconcile')
  @RequireAdminPermission(AdminModule.CARTEIRA, AdminAction.VIEW)
  async reconcileConnect(@Query('workspaceId') workspaceId?: string) {
    const trimmedWorkspaceId = trimOptional(workspaceId);
    return this.connectReconcile.reconcile({
      ...(trimmedWorkspaceId ? { workspaceId: trimmedWorkspaceId } : {}),
    });
  }

  /** List payouts. */
  @Get('payouts')
  @RequireAdminPermission(AdminModule.CARTEIRA, AdminAction.VIEW)
  async listPayouts(@Query('skip') skip?: string, @Query('take') take?: string) {
    const parsedSkip = parseSkip(skip);
    const parsedTake = parseTake(take);
    const result = await this.audit.list({
      action: 'carteira.payout',
      entityType: 'marketplace_treasury',
      ...(parsedSkip !== undefined ? { skip: parsedSkip } : {}),
      ...(parsedTake !== undefined ? { take: parsedTake } : {}),
    });

    return {
      items: result.items.map((item) => mapPayoutAuditItem(item)),
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
    const parsedSkip = parseSkip(skip);
    const parsedTake = parseTake(take);
    const trimmedWorkspaceId = trimOptional(workspaceId);
    const trimmedState = trimOptional(state);
    return this.connectPayoutApprovalService.listAdminRequests({
      ...(trimmedWorkspaceId ? { workspaceId: trimmedWorkspaceId } : {}),
      ...(trimmedState ? { state: trimmedState } : {}),
      ...(parsedSkip !== undefined ? { skip: parsedSkip } : {}),
      ...(parsedTake !== undefined ? { take: parsedTake } : {}),
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
    const parsedType = type ? parseFraudBlacklistType(type) : undefined;
    const parsedSkip = parseSkip(skip);
    const parsedTake = parseTake(take);
    const result = await this.fraudEngine.listBlacklist({
      ...(parsedType !== undefined ? { type: parsedType } : {}),
      ...(value !== undefined ? { value: String(value).trim() } : {}),
      ...(parsedSkip !== undefined ? { skip: parsedSkip } : {}),
      ...(parsedTake !== undefined ? { take: parsedTake } : {}),
    });

    return {
      items: result.items.map((row) => mapFraudBlacklistRow(row)),
      total: result.total,
    };
  }

  /** Add fraud blacklist row. */
  @Post('fraud/blacklist')
  @RequireAdminPermission(AdminModule.CARTEIRA, AdminAction.EDIT)
  async addFraudBlacklist(
    @Body() body: AddFraudBlacklistDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const type = parseFraudBlacklistType(body.type);
    const value = requireNonEmpty(body.value, 'value is required');
    const reason = requireNonEmpty(body.reason, 'reason is required');

    const expiresAt = parseDateOrFail(body.expiresAt ?? undefined, 'expiresAt');
    const row = await this.fraudEngine.addToBlacklist({
      type,
      value,
      reason,
      addedBy: admin.id,
      ...(expiresAt !== undefined ? { expiresAt } : {}),
    });

    await this.audit.append({
      adminUserId: admin.id,
      action: 'admin.carteira.fraud_blacklist_added',
      entityType: 'fraud_blacklist',
      entityId: buildFraudBlacklistEntityId(row.type, row.value),
      details: buildFraudBlacklistAddedDetails(row),
    });

    return mapFraudBlacklistRow(row);
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
    const type = parseFraudBlacklistType(body.type);
    const value = requireNonEmpty(body.value, 'value is required');

    const result = await this.fraudEngine.removeFromBlacklist({ type, value });

    await this.audit.append({
      adminUserId: admin.id,
      action: 'admin.carteira.fraud_blacklist_removed',
      entityType: 'fraud_blacklist',
      entityId: buildFraudBlacklistEntityId(type, value),
      details: buildFraudBlacklistRemovedDetails({
        type,
        value,
        removedCount: result.removedCount,
      }),
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
    const { amountCents, amountCentsBig } = validatePayoutAmount(body.amountCents);

    const currency = normalizeCurrency(body.currency);
    const requestId = resolveTreasuryPayoutRequestId(body.requestId, randomUUID);

    let result;
    try {
      result = await this.marketplaceTreasuryPayout.createPayout({
        amountCents: amountCentsBig,
        requestId,
        currency,
      });
    } catch (error: unknown) {
      await this.audit.append({
        adminUserId: admin.id,
        action: 'admin.carteira.payout_request_failed',
        entityType: 'marketplace_treasury',
        entityId: currency,
        details: buildTreasuryPayoutFailedDetails({
          requestId,
          amountCents,
          currency,
          error,
        }),
      });
      throw error;
    }

    await this.audit.append({
      adminUserId: admin.id,
      action: 'admin.carteira.payout_requested',
      entityType: 'marketplace_treasury',
      entityId: currency,
      details: buildTreasuryPayoutRequestedDetails({ requestId, result }),
    });

    return buildTreasuryPayoutResponse(result);
  }

  /** Approve connect payout request. */
  @Post('connect/payout-requests/:approvalRequestId/approve')
  @RequireAdminPermission(AdminModule.CARTEIRA, AdminAction.APPROVE)
  async approveConnectPayoutRequest(
    @Param('approvalRequestId') approvalRequestId: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const normalizedId = requireNonEmpty(approvalRequestId, 'approvalRequestId is required');

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
    const normalizedId = requireNonEmpty(approvalRequestId, 'approvalRequestId is required');
    const trimmedReason = trimOptional(body?.reason);

    return {
      success: true,
      ...(await this.connectPayoutApprovalService.rejectRequest({
        approvalRequestId: normalizedId,
        adminUserId: admin.id,
        ...(trimmedReason ? { reason: trimmedReason } : {}),
      })),
    };
  }
}
