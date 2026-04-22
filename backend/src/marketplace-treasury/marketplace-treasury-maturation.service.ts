import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MarketplaceTreasuryLedgerKind, MarketplaceTreasuryBucket } from '@prisma/client';

import { forEachSequential } from '../common/async-sequence';
import { FinancialAlertService } from '../common/financial-alert.service';
import { PrismaService } from '../prisma/prisma.service';

import { MarketplaceTreasuryService } from './marketplace-treasury.service';

/** Marketplace treasury maturation result shape. */
export interface MarketplaceTreasuryMaturationResult {
  /** Scanned property. */
  scanned: number;
  /** Matured property. */
  matured: number;
  /** Skipped property. */
  skipped: number;
  /** Failed property. */
  failed: number;
}

/**
 * Moves marketplace fee credits from PENDING to AVAILABLE using the same
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
export class MarketplaceTreasuryMaturationService {
  private readonly logger = new Logger(MarketplaceTreasuryMaturationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: MarketplaceTreasuryService,
    private readonly financialAlert: FinancialAlertService,
  ) {}

  /** Run cron. */
  @Cron(CronExpression.EVERY_MINUTE)
  async runCron(): Promise<void> {
    await this.matureDueCredits();
  }

  /** Mature due credits. */
  async matureDueCredits(
    now = new Date(),
    minAgeMs = 0,
  ): Promise<MarketplaceTreasuryMaturationResult> {
    const dueBefore = new Date(now.getTime() - minAgeMs);
    const credits = await this.prisma.marketplaceTreasuryLedger.findMany({
      where: {
        kind: MarketplaceTreasuryLedgerKind.MARKETPLACE_FEE_CREDIT,
        direction: 'credit',
        bucket: MarketplaceTreasuryBucket.PENDING,
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
        const alreadyMatured = await this.prisma.marketplaceTreasuryLedger.findFirst({
          where: {
            kind: MarketplaceTreasuryLedgerKind.ADJUSTMENT_CREDIT,
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
              bucket: MarketplaceTreasuryBucket.PENDING,
              amountInCents: credit.amountInCents,
              kind: MarketplaceTreasuryLedgerKind.ADJUSTMENT_DEBIT,
              orderId: `mature:pending:${credit.id}`,
              reason: 'marketplace_treasury_mature_pending_debit',
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
              bucket: MarketplaceTreasuryBucket.AVAILABLE,
              amountInCents: credit.amountInCents,
              kind: MarketplaceTreasuryLedgerKind.ADJUSTMENT_CREDIT,
              orderId: `mature:available:${credit.id}`,
              reason: 'marketplace_treasury_mature_available_credit',
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
        this.logger.error(`marketplace_treasury_maturation_failed entry=${credit.id}: ${message}`);
        this.financialAlert.reconciliationAlert('marketplace treasury maturation failed', {
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
              entityType: 'marketplace_treasury_ledger',
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
