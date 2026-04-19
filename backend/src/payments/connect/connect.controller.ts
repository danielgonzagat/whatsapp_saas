import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../../common/guards/workspace.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';

import { ConnectPayoutService } from './connect-payout.service';
import { ConnectService } from './connect.service';

@Controller('payments/connect')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@Throttle({ default: { limit: 20, ttl: 60000 } })
export class ConnectController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connectService: ConnectService,
    private readonly ledgerService: LedgerService,
    private readonly connectPayoutService: ConnectPayoutService,
  ) {}

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

    const result = await this.connectPayoutService.createPayout({
      accountBalanceId,
      amountCents: BigInt(requestedAmount),
      requestId: String(body.requestId || '').trim() || `po_${randomUUID()}`,
      currency: body.currency,
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
}
