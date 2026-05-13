import { Injectable, Logger } from '@nestjs/common';
import {
  GENESIS_EVENT,
  ORGANISM_CANONICAL_NAME,
  computeGenesisHash,
} from './genesis-event';
import { LineageLedgerService } from './lineage-ledger.service';
import {
  LineageEntry,
  LineageLedgerRepository,
  ZERO_HASH,
} from './lineage-ledger.types';

/**
 * UTP-LINEAGE-003 — Identity Lineage Guard.
 *
 * Implements PCI.3 §3.4 + §3.5 (docs/contracts/pci/03-genesis-lineage.md).
 *
 * Runs in runtime (boot, periodic check, on-demand) to verify the integrity
 * of the Lineage Ledger:
 *   1. Entry 1 is the canonical Genesis (eventName, canonicalName, hash).
 *   2. Every entry's hash matches the deterministic recomputation.
 *   3. Every entry's prevEntryHash matches the previous entry's hash.
 *   4. sequenceNumber is monotonic, contiguous, starting at 1.
 *
 * On any failure, the guard returns a structured `compromised` verdict
 * carrying the exact reason and the offending entry. Consumers (ABI builder,
 * Identity Projector) MUST refuse to project identity when status is
 * `compromised`.
 */

export type LineageStatus = 'intact' | 'compromised';

export interface LineageGuardVerdict {
  readonly status: LineageStatus;
  readonly entryCount: number;
  readonly tailSequenceNumber: number;
  readonly tailHash: string | null;
  readonly genesisHash: string | null;
  readonly checkedAt: string;
  readonly reason?: string;
  readonly offendingEntry?: {
    readonly sequenceNumber: number;
    readonly ledgerEntryId: string;
    readonly eventName: string;
  };
}

@Injectable()
export class LineageGuardService {
  private readonly logger = new Logger(LineageGuardService.name);

  public constructor(private readonly repository: LineageLedgerRepository) {}

  /**
   * Verify the entire ledger. Returns a verdict — does NOT throw on
   * compromise; the consumer decides whether to block.
   */
  public async verify(): Promise<LineageGuardVerdict> {
    const checkedAt = new Date().toISOString();
    const entries = await this.repository.listAll();
    if (entries.length === 0) {
      return this.compromised({
        checkedAt,
        entryCount: 0,
        tailSequenceNumber: 0,
        tailHash: null,
        genesisHash: null,
        reason: 'ledger is empty — call LineageLedgerService.bootstrapGenesis()',
      });
    }

    const first = entries[0];
    if (!first) {
      return this.compromised({
        checkedAt,
        entryCount: 0,
        tailSequenceNumber: 0,
        tailHash: null,
        genesisHash: null,
        reason: 'listAll returned non-empty length but undefined first entry',
      });
    }

    const genesisCheck = this.verifyGenesisEntry(first);
    if (genesisCheck.failed) {
      return this.compromised({
        checkedAt,
        entryCount: entries.length,
        tailSequenceNumber: entries[entries.length - 1]?.sequenceNumber ?? 0,
        tailHash: entries[entries.length - 1]?.hash ?? null,
        genesisHash: first.hash,
        reason: genesisCheck.reason,
        offendingEntry: {
          sequenceNumber: first.sequenceNumber,
          ledgerEntryId: first.ledgerEntryId,
          eventName: first.eventName,
        },
      });
    }

    let prev: LineageEntry | null = null;
    for (const entry of entries) {
      const expectedSeq = (prev?.sequenceNumber ?? 0) + 1;
      if (entry.sequenceNumber !== expectedSeq) {
        return this.compromised({
          checkedAt,
          entryCount: entries.length,
          tailSequenceNumber: entries[entries.length - 1]?.sequenceNumber ?? 0,
          tailHash: entries[entries.length - 1]?.hash ?? null,
          genesisHash: first.hash,
          reason: `sequenceNumber gap: expected ${expectedSeq} got ${entry.sequenceNumber}`,
          offendingEntry: {
            sequenceNumber: entry.sequenceNumber,
            ledgerEntryId: entry.ledgerEntryId,
            eventName: entry.eventName,
          },
        });
      }

      const expectedPrev = prev?.hash ?? ZERO_HASH;
      if (entry.prevEntryHash !== expectedPrev) {
        return this.compromised({
          checkedAt,
          entryCount: entries.length,
          tailSequenceNumber: entries[entries.length - 1]?.sequenceNumber ?? 0,
          tailHash: entries[entries.length - 1]?.hash ?? null,
          genesisHash: first.hash,
          reason: `broken chain at seq=${entry.sequenceNumber}: prevEntryHash=${entry.prevEntryHash.slice(0, 12)}… expected=${expectedPrev.slice(0, 12)}…`,
          offendingEntry: {
            sequenceNumber: entry.sequenceNumber,
            ledgerEntryId: entry.ledgerEntryId,
            eventName: entry.eventName,
          },
        });
      }

      const recomputed = LineageLedgerService.computeEntryHash({
        ledgerEntryId: entry.ledgerEntryId,
        sequenceNumber: entry.sequenceNumber,
        prevEntryHash: entry.prevEntryHash,
        eventId: entry.eventId,
        eventName: entry.eventName,
        timestamp: entry.timestamp,
        payload: entry.payload,
      });
      if (recomputed !== entry.hash) {
        return this.compromised({
          checkedAt,
          entryCount: entries.length,
          tailSequenceNumber: entries[entries.length - 1]?.sequenceNumber ?? 0,
          tailHash: entries[entries.length - 1]?.hash ?? null,
          genesisHash: first.hash,
          reason: `hash mismatch at seq=${entry.sequenceNumber}: stored=${entry.hash.slice(0, 12)}… recomputed=${recomputed.slice(0, 12)}…`,
          offendingEntry: {
            sequenceNumber: entry.sequenceNumber,
            ledgerEntryId: entry.ledgerEntryId,
            eventName: entry.eventName,
          },
        });
      }

      prev = entry;
    }

    return {
      status: 'intact',
      entryCount: entries.length,
      tailSequenceNumber: prev?.sequenceNumber ?? 0,
      tailHash: prev?.hash ?? null,
      genesisHash: first.hash,
      checkedAt,
    };
  }

  private verifyGenesisEntry(entry: LineageEntry): {
    readonly failed: boolean;
    readonly reason: string;
  } {
    if (entry.eventName !== 'lineage.genesis') {
      return {
        failed: true,
        reason: `entry 1 is not lineage.genesis (got ${entry.eventName})`,
      };
    }
    if (entry.sequenceNumber !== 1) {
      return {
        failed: true,
        reason: `entry 1 has wrong sequenceNumber ${entry.sequenceNumber}`,
      };
    }
    if (entry.prevEntryHash !== ZERO_HASH) {
      return {
        failed: true,
        reason: `entry 1 prevEntryHash is not ZERO_HASH`,
      };
    }
    if (entry.eventId !== GENESIS_EVENT.eventId) {
      return {
        failed: true,
        reason: `entry 1 eventId mismatch — expected ${GENESIS_EVENT.eventId} got ${entry.eventId}`,
      };
    }
    const payload = entry.payload as { canonicalName?: string };
    if (payload.canonicalName !== ORGANISM_CANONICAL_NAME) {
      return {
        failed: true,
        reason: `entry 1 canonicalName is not "${ORGANISM_CANONICAL_NAME}" — Genesis tampered`,
      };
    }
    const recomputedGenesisPayloadHash = computeGenesisHash(
      payload as Parameters<typeof computeGenesisHash>[0],
    );
    if (recomputedGenesisPayloadHash !== GENESIS_EVENT.hash) {
      return {
        failed: true,
        reason: `entry 1 Genesis payload diverges from canonical (payload hash mismatch)`,
      };
    }
    return { failed: false, reason: '' };
  }

  private compromised(verdict: Omit<LineageGuardVerdict, 'status'>): LineageGuardVerdict {
    this.logger.error(
      `lineage compromise detected — ${verdict.reason ?? 'unknown'} (entries=${verdict.entryCount} tailSeq=${verdict.tailSequenceNumber})`,
    );
    return { ...verdict, status: 'compromised' };
  }
}
