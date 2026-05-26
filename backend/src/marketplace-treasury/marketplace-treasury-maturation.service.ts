import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MarketplaceTreasuryLedgerKind, MarketplaceTreasuryBucket } from '@prisma/client';
import { StructuredLogger } from '../logging/structured-logger';

import { forEachSequential } from '../common/async-sequence';
import { FinancialAlertService } from '../common/financial-alert.service';
import { PrismaService } from '../prisma/prisma.service';

import { MarketplaceTreasuryService } from './marketplace-treasury.service'; /** Marketplace treasury maturation result shape. */
export interface MarketplaceTreasuryMaturationResult {
  /** Scanned property. */
  scanned: number;
  /** Matured property. */
  matured: number;
  /** Skipped property. */
  skipped: number;
  /** Failed property. */
  failed: number;
} /**
 * Extracts a Prisma error code from an unknown error, returning undefined
 * when the error is not a PrismaClientKnownRequestError.
 */
function prismaErrorCode(error: unknown): string | undefined {
  if (error !== null && typeof error === 'object' && 'code' in error) {
    return typeof error.code === 'string' ? error.code : undefined;
  }
  return undefined;
} /**
 * Moves marketplace fee credits from PENDING to AVAILABLE using the same
 * append-only discipline as the rest of the payment kernel.
 *
 * Idempotency is derived from synthetic order ids:
 * - `mature:pending:<sourceLedgerEntryId>`
 * - `mature:available:<sourceLedgerEntryId>`
 *
 * If the available-side marker already exists (checked inside the
 * serializable transaction), the credit is considered matured and
 * skipped on replay. P2002 unique-constraint violations are also
 * treated as idempotent skips as a defense-in-depth measure.
 */
@Injectable()
export class MarketplaceTreasuryMaturationService {
  private readonly logger = StructuredLogger.from(MarketplaceTreasuryMaturationService.name);

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
        let alreadySkipped = false;

        await this.prisma.$transaction(
          async (tx) => {
            // ── Idempotency check INSIDE the transaction ──
            // Two concurrent cron jobs will serialize here; the
            // second one will see the marker and skip.
            const alreadyMatured = await tx.marketplaceTreasuryLedger.findFirst({
              where: {
                kind: MarketplaceTreasuryLedgerKind.ADJUSTMENT_CREDIT,
                orderId: `mature:available:${credit.id}`,
              },
              select: { id: true },
            });
            if (alreadyMatured) {
              alreadySkipped = true;
              return;
            }

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
          },
          { isolationLevel: 'Serializable' },
        );

        if (alreadySkipped) {
          skipped += 1;
        } else {
          matured += 1;
        }
      } catch (error: unknown) {
        const code = prismaErrorCode(error);

        // ── P2002: unique-constraint violation ──
        // Another process already inserted the idempotency marker.
        // Treat as an idempotent skip, not a failure.
        if (code === 'P2002') {
          skipped += 1;
          this.logger.log(
            {
              entryId: credit.id,
              currency: credit.currency,
              operation: 'marketplace_treasury_maturation_idempotent_skip',
            },
            `marketplace_treasury_maturation idempotent skip entry=${credit.id}`,
          );
          return;
        }

        // ── P2025: record not found ──
        // The source entry or wallet record disappeared (rare).
        // Log and skip — retrying won't help.
        if (code === 'P2025') {
          skipped += 1;
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(
            {
              entryId: credit.id,
              currency: credit.currency,
              operation: 'marketplace_treasury_maturation_p2025_skip',
            },
            `marketplace_treasury_maturation P2025 skip entry=${credit.id}: ${message}`,
          );
          return;
        }

        // ── Real failure ──
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          {
            entryId: credit.id,
            currency: credit.currency,
            operation: 'marketplace_treasury_maturation_failed',
            errorCode: code,
          },
          `marketplace_treasury_maturation failed entry=${credit.id}: ${message}`,
        );
        this.financialAlert.reconciliationAlert('marketplace treasury maturation failed', {
          details: {
            entryId: credit.id,
            currency: credit.currency,
            error: message,
            errorCode: code,
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
                errorCode: code,
              },
            },
          })
          .catch(() => undefined);
      }
    });

    if (credits.length > 0) {
      this.logger.log(
        {
          operation: 'marketplace_treasury_maturation_summary',
          scanned: credits.length,
          matured,
          skipped,
          failed,
        },
        `marketplace_treasury_maturation scanned=${credits.length} matured=${matured} skipped=${skipped} failed=${failed}`,
      );
    }

    return {
      scanned: credits.length,
      matured,
      skipped,
      failed,
    };
  }
}
