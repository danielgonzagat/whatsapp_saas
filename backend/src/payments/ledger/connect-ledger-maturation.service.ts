import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../../prisma/prisma.service';

import { LedgerService } from './ledger.service';

export interface ConnectLedgerMaturationResult {
  scanned: number;
  matured: number;
  failed: number;
}

/**
 * Promotes due Connect ledger credits from PENDING to AVAILABLE.
 *
 * The sale webhook only appends CREDIT_PENDING entries. This service is the
 * bridge that turns those scheduled credits into spendable balances once the
 * maturation date is reached.
 */
@Injectable()
export class ConnectLedgerMaturationService {
  private readonly logger = new Logger(ConnectLedgerMaturationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async runCron(): Promise<void> {
    await this.matureDueEntries();
  }

  async matureDueEntries(now = new Date()): Promise<ConnectLedgerMaturationResult> {
    const dueEntries = await this.prisma.connectLedgerEntry.findMany({
      where: {
        type: 'CREDIT_PENDING',
        matured: false,
        scheduledFor: { lte: now },
      },
      orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
      take: 500,
    });

    let matured = 0;
    let failed = 0;

    for (const entry of dueEntries) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: maturation must preserve deterministic append-only ledger order
        await this.ledgerService.moveFromPendingToAvailable(entry.id);
        matured += 1;
      } catch (error) {
        failed += 1;
        this.logger.error(
          `connect_ledger_maturation_failed entry=${entry.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (dueEntries.length > 0) {
      this.logger.log(
        `connect_ledger_maturation scanned=${dueEntries.length} matured=${matured} failed=${failed}`,
      );
    }

    return {
      scanned: dueEntries.length,
      matured,
      failed,
    };
  }
}
