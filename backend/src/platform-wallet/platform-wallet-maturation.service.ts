import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PlatformLedgerKind, PlatformWalletBucket } from '@prisma/client';

import { forEachSequential } from '../common/async-sequence';
import { FinancialAlertService } from '../common/financial-alert.service';
import { PrismaService } from '../prisma/prisma.service';

import { PlatformWalletService } from './platform-wallet.service';

/** Platform wallet maturation result shape. */
export interface PlatformWalletMaturationResult {
  scanned: number;
  matured: number;
  skipped: number;
  failed: number;
}

/**
 * Moves platform fee credits from PENDING to AVAILABLE using the same
 * append-only discipline as the rest of the payment kernel.
 *
 * Idempotency is derived from synthetic order ids:
 * - `mature:pending:<sourceLedgerEntryId>`
 * - `mature:available:<sourceLedgerEntryId>`
 *
 * If the available-side marker already exists, the credit is considered
 * matured and skipped on replay.
 */
@Injectable()
export class PlatformWalletMaturationService {
  private readonly logger = new Logger(PlatformWalletMaturationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: PlatformWalletService,
    private readonly financialAlert: FinancialAlertService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async runCron(): Promise<void> {
    await this.matureDueCredits();
  }

  async matureDueCredits(now = new Date(), minAgeMs = 0): Promise<PlatformWalletMaturationResult> {
    const dueBefore = new Date(now.getTime() - minAgeMs);
    const credits = await this.prisma.platformWalletLedger.findMany({
      where: {
        kind: PlatformLedgerKind.PLATFORM_FEE_CREDIT,
        direction: 'credit',
        bucket: PlatformWalletBucket.PENDING,
        createdAt: { lte: dueBefore },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        currency: true,
        amountInCents: true,
        createdAt: true,
      },
      take: 500,
    });

    let matured = 0;
    let skipped = 0;
    let failed = 0;

    await forEachSequential(credits, async (credit) => {
      try {
        const alreadyMatured = await this.prisma.platformWalletLedger.findFirst({
          where: {
            kind: PlatformLedgerKind.ADJUSTMENT_CREDIT,
            orderId: `mature:available:${credit.id}`,
          },
          select: { id: true },
        });
        if (alreadyMatured) {
          skipped += 1;
          return;
        }

        await this.prisma.$transaction(async (tx) => {
          await this.wallet.append(
            {
              currency: credit.currency,
              direction: 'debit',
              bucket: PlatformWalletBucket.PENDING,
              amountInCents: credit.amountInCents,
              kind: PlatformLedgerKind.ADJUSTMENT_DEBIT,
              orderId: `mature:pending:${credit.id}`,
              reason: 'platform_wallet_mature_pending_debit',
              metadata: {
                sourceLedgerEntryId: credit.id,
              },
            },
            tx,
          );

          await this.wallet.append(
            {
              currency: credit.currency,
              direction: 'credit',
              bucket: PlatformWalletBucket.AVAILABLE,
              amountInCents: credit.amountInCents,
              kind: PlatformLedgerKind.ADJUSTMENT_CREDIT,
              orderId: `mature:available:${credit.id}`,
              reason: 'platform_wallet_mature_available_credit',
              metadata: {
                sourceLedgerEntryId: credit.id,
              },
            },
            tx,
          );
        });

        matured += 1;
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`platform_wallet_maturation_failed entry=${credit.id}: ${message}`);
        this.financialAlert.reconciliationAlert('platform wallet maturation failed', {
          details: {
            entryId: credit.id,
            currency: credit.currency,
            error: message,
          },
        });
        await this.prisma.adminAuditLog
          .create({
            data: {
              action: 'system.carteira.maturation_failed',
              entityType: 'platform_wallet_ledger',
              entityId: credit.id,
              details: {
                entryId: credit.id,
                currency: credit.currency,
                error: message,
              },
            },
          })
          .catch(() => undefined);
      }
    });

    return {
      scanned: credits.length,
      matured,
      skipped,
      failed,
    };
  }
}
