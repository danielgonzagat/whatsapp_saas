import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  LineageEntry,
  LineageEventName,
  LineageLedgerError,
  LineageLedgerRepository,
  LineagePayloadByEvent,
} from './lineage-ledger.types';

/**
 * UTP-LINEAGE-007 — Prisma-backed implementation of LineageLedgerRepository.
 *
 * Wraps the `LineageEntry` model (table `RAC_LineageEntry`). Append-only at
 * the application layer: this repository never exposes UPDATE or DELETE
 * methods. The model itself has no `updatedAt` and no soft-delete flag, so
 * any tampering would have to be performed via raw SQL — out of scope for
 * normal operation and detectable by `LineageGuardService`.
 */
@Injectable()
export class PrismaLineageLedgerRepository implements LineageLedgerRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async count(): Promise<number> {
    return this.prisma.lineageEntry.count();
  }

  public async tail(): Promise<LineageEntry | null> {
    const row = await this.prisma.lineageEntry.findFirst({
      orderBy: { sequenceNumber: 'desc' },
    });
    return row ? this.toDomain(row) : null;
  }

  public async listAll(): Promise<readonly LineageEntry[]> {
    const rows = await this.prisma.lineageEntry.findMany({
      orderBy: { sequenceNumber: 'asc' },
    });
    return Object.freeze(rows.map((r) => this.toDomain(r)));
  }

  public async listFromSequence(from: number): Promise<readonly LineageEntry[]> {
    const rows = await this.prisma.lineageEntry.findMany({
      where: { sequenceNumber: { gte: from } },
      orderBy: { sequenceNumber: 'asc' },
    });
    return Object.freeze(rows.map((r) => this.toDomain(r)));
  }

  public async append(entry: LineageEntry): Promise<void> {
    try {
      await this.prisma.lineageEntry.create({
        data: {
          ledgerEntryId: entry.ledgerEntryId,
          sequenceNumber: entry.sequenceNumber,
          prevEntryHash: entry.prevEntryHash,
          eventId: entry.eventId,
          eventName: entry.eventName,
          timestampUtc: new Date(entry.timestamp),
          payloadJson: entry.payload as unknown as Parameters<
            typeof this.prisma.lineageEntry.create
          >[0]['data']['payloadJson'],
          hash: entry.hash,
        },
      });
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code === 'P2002') {
        throw new LineageLedgerError(
          'LINEAGE_LEDGER_DUPLICATE_KEY',
          'unique constraint violated on append',
          { prismaCode: code, sequenceNumber: entry.sequenceNumber },
        );
      }
      throw err;
    }
  }

  private toDomain(row: {
    ledgerEntryId: string;
    sequenceNumber: number;
    prevEntryHash: string;
    eventId: string;
    eventName: string;
    timestampUtc: Date;
    payloadJson: unknown;
    hash: string;
  }): LineageEntry {
    const eventName = row.eventName as LineageEventName;
    return {
      ledgerEntryId: row.ledgerEntryId,
      sequenceNumber: row.sequenceNumber,
      prevEntryHash: row.prevEntryHash,
      eventId: row.eventId,
      eventName,
      timestamp: row.timestampUtc.toISOString(),
      payload: row.payloadJson as LineagePayloadByEvent[typeof eventName],
      hash: row.hash,
    };
  }
}
