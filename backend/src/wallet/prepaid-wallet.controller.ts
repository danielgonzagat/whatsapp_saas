import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import * as Sentry from '@sentry/node';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { PrismaService } from '../prisma/prisma.service';

import { WalletService } from './wallet.service';
import { InsufficientWalletBalanceError } from './wallet.types';

@Controller('wallet/prepaid')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@Throttle({ default: { limit: 30, ttl: 60000 } })
export class PrepaidWalletController {
  private readonly logger = new Logger(PrepaidWalletController.name);

  constructor(
    private readonly walletService: WalletService,
    private readonly prisma: PrismaService,
  ) {}

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

  @Post(':workspaceId/topup')
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
    const amountCents = BigInt(body.amountCents ?? 0);
    if (amountCents <= 0n) {
      throw new RangeError('amountCents must be greater than 0');
    }
    const method = body.method === 'card' ? 'card' : 'pix';

    const result = await this.walletService.createTopupIntent({
      workspaceId,
      amountCents,
      method,
      buyerEmail: body.buyerEmail ?? null,
      buyerCpf: body.buyerCpf ?? null,
      buyerIp: body.buyerIp ?? null,
    });

    return {
      paymentIntentId: result.paymentIntentId,
      clientSecret: result.clientSecret,
      pixQrCode: result.pixQrCode ?? null,
      pixQrCodeUrl: result.pixQrCodeUrl ?? null,
    };
  }

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

  @Patch(':workspaceId/auto-recharge')
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
    const threshold = body.enabled ? BigInt(body.thresholdCents) : null;
    const amount = body.enabled ? BigInt(body.amountCents) : null;

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

  @Post(':workspaceId/spend')
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
    try {
      const result = await this.walletService.chargeForUsage({
        workspaceId,
        operation: body.operation,
        units: body.units,
        quotedCostCents: body.quotedCostCents ? BigInt(body.quotedCostCents) : undefined,
        requestId: body.requestId,
        metadata: body.metadata,
      });

      return {
        success: true,
        newBalanceCents: result.newBalanceCents.toString(),
        costCents: result.costCents.toString(),
        transactionId: result.transaction.id,
      };
    } catch (err) {
      if (err instanceof InsufficientWalletBalanceError) {
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
      throw err;
    }
  }
}
