import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import * as Sentry from '@sentry/node';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { Idempotent } from '../common/idempotency.guard';
import { Metrics } from '../observability/metrics';
import { PrismaService } from '../prisma/prisma.service';

import { InternalEndpoint } from '../common/decorators/internal-endpoint.decorator';
import { WalletService } from './wallet.service';
import { InsufficientWalletBalanceError } from './wallet.types';
import { RouteClass } from '../common/throttler/route-class.decorator';

@Controller('wallet/prepaid')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@RouteClass('mutate')
export class PrepaidWalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly prisma: PrismaService,
  ) {}

  @InternalEndpoint('wallet balance check')
  @Get(':workspaceId/balance')
  async getBalance(@Param('workspaceId') workspaceId: string) {
    const wallet = await this.prisma.prepaidWallet.findUnique({
      where: { workspaceId },
      select: {
        id: true,
        balanceCents: true,
        currency: true,
        autoRechargeEnabled: true,
        autoRechargeThresholdCents: true,
        autoRechargeAmountCents: true,
        createdAt: true,
      },
    });

    if (!wallet) {
      return {
        balanceCents: '0',
        currency: 'BRL',
        autoRechargeEnabled: false,
      };
    }

    return {
      walletId: wallet.id,
      balanceCents: wallet.balanceCents.toString(),
      currency: wallet.currency,
      autoRechargeEnabled: wallet.autoRechargeEnabled,
      autoRechargeThresholdCents: wallet.autoRechargeThresholdCents?.toString() ?? null,
      autoRechargeAmountCents: wallet.autoRechargeAmountCents?.toString() ?? null,
      createdAt: wallet.createdAt,
    };
  }

  @InternalEndpoint('wallet topup')
  @Post(':workspaceId/topup')
  @Idempotent()
  async createTopup(
    @Param('workspaceId') workspaceId: string,
    @Body()
    body: {
      amountCents?: number;
      method?: 'pix' | 'card';
      buyerEmail?: string;
      buyerCpf?: string;
      buyerIp?: string;
    },
  ) {
    const start = Date.now();
    const amountCents = BigInt(body.amountCents ?? 0);
    if (amountCents <= 0n) {
      throw new RangeError('amountCents must be greater than 0');
    }
    const method = body.method === 'card' ? 'card' : 'pix';

    try {
      const result = await this.walletService.createTopupIntent({
        workspaceId,
        amountCents,
        method,
        buyerEmail: body.buyerEmail ?? null,
        buyerCpf: body.buyerCpf ?? null,
        buyerIp: body.buyerIp ?? null,
      });
      Metrics.endpoint.success('wallet.createTopup', { workspaceId });
      Metrics.endpoint.duration('wallet.createTopup', Date.now() - start, { workspaceId });
      return {
        paymentIntentId: result.paymentIntentId,
        clientSecret: result.clientSecret,
        pixQrCode: result.pixQrCode ?? null,
        pixQrCodeUrl: result.pixQrCodeUrl ?? null,
      };
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? 'unknown';
      Metrics.endpoint.failure('wallet.createTopup', { workspaceId, code });
      throw err;
    }
  }

  @InternalEndpoint('wallet transactions')
  @Get(':workspaceId/transactions')
  async getTransactions(
    @Param('workspaceId') workspaceId: string,
    @Query('limit') rawLimit?: string,
    @Query('offset') rawOffset?: string,
  ) {
    const wallet = await this.prisma.prepaidWallet.findUnique({
      where: { workspaceId },
      select: { id: true },
    });

    if (!wallet) {
      return { transactions: [], total: 0 };
    }

    const limit = Math.min(Math.max(Number(rawLimit) || 20, 1), 100);
    const offset = Math.max(Number(rawOffset) || 0, 0);

    const [transactions, total] = await Promise.all([
      this.prisma.prepaidWalletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        select: {
          id: true,
          type: true,
          amountCents: true,
          balanceAfterCents: true,
          referenceType: true,
          referenceId: true,
          metadata: true,
          createdAt: true,
        },
      }),
      this.prisma.prepaidWalletTransaction.count({
        where: { walletId: wallet.id },
      }),
    ]);

    return {
      transactions: transactions.map((t) => ({
        ...t,
        amountCents: t.amountCents.toString(),
        balanceAfterCents: t.balanceAfterCents.toString(),
      })),
      total,
    };
  }

  @InternalEndpoint('wallet auto-recharge settings')
  @Patch(':workspaceId/auto-recharge')
  @Idempotent()
  async configureAutoRecharge(
    @Param('workspaceId') workspaceId: string,
    @Body()
    body: {
      enabled?: boolean;
      thresholdCents?: number;
      amountCents?: number;
    },
  ) {
    if (body.enabled === true) {
      if (!body.thresholdCents || body.thresholdCents <= 0) {
        throw new RangeError('thresholdCents must be greater than 0 when enabling auto-recharge');
      }
      if (!body.amountCents || body.amountCents <= 0) {
        throw new RangeError('amountCents must be greater than 0 when enabling auto-recharge');
      }
    }

    const enabled = body.enabled ?? false;
    const threshold = body.enabled ? BigInt(body.thresholdCents!) : null;
    const amount = body.enabled ? BigInt(body.amountCents!) : null;

    const wallet = await this.prisma.prepaidWallet.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        autoRechargeEnabled: enabled,
        autoRechargeThresholdCents: threshold,
        autoRechargeAmountCents: amount,
      },
      update: {
        autoRechargeEnabled: enabled,
        autoRechargeThresholdCents: threshold,
        autoRechargeAmountCents: amount,
      },
    });

    return {
      walletId: wallet.id,
      autoRechargeEnabled: wallet.autoRechargeEnabled,
      autoRechargeThresholdCents: wallet.autoRechargeThresholdCents?.toString() ?? null,
      autoRechargeAmountCents: wallet.autoRechargeAmountCents?.toString() ?? null,
    };
  }

  @InternalEndpoint('wallet spend')
  @Post(':workspaceId/spend')
  @Idempotent()
  async spend(
    @Param('workspaceId') workspaceId: string,
    @Body()
    body: {
      operation: string;
      units?: number;
      quotedCostCents?: number;
      requestId: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    const start = Date.now();
    try {
      const result = await this.walletService.chargeForUsage({
        workspaceId,
        operation: body.operation,
        ...(body.units !== undefined ? { units: body.units } : {}),
        ...(body.quotedCostCents !== undefined
          ? { quotedCostCents: BigInt(body.quotedCostCents) }
          : {}),
        requestId: body.requestId,
        ...(body.metadata !== undefined ? { metadata: body.metadata } : {}),
      });

      Metrics.endpoint.success('wallet.spend', { workspaceId });
      Metrics.endpoint.duration('wallet.spend', Date.now() - start, { workspaceId });
      return {
        success: true,
        newBalanceCents: result.newBalanceCents.toString(),
        costCents: result.costCents.toString(),
        transactionId: result.transaction.id,
      };
    } catch (err: unknown) {
      if (err instanceof InsufficientWalletBalanceError) {
        Metrics.endpoint.failure('wallet.spend', { workspaceId, code: 'insufficient_balance' });
        Sentry.captureException(err, {
          extra: {
            walletId: err.walletId,
            requested: err.requestedCents.toString(),
            current: err.currentCents.toString(),
          },
        });
        return {
          success: false,
          error: 'insufficient_balance',
          message:
            'Saldo insuficiente na wallet prepaid. Recarregue via PIX ou aguarde a auto-recarga.',
          currentBalanceCents: err.currentCents.toString(),
          requestedCents: err.requestedCents.toString(),
        };
      }
      const code = (err as { code?: string })?.code ?? 'unknown';
      Metrics.endpoint.failure('wallet.spend', { workspaceId, code });
      throw err;
    }
  }
}
