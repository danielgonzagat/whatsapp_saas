import { Injectable, Logger } from '@nestjs/common';
import {
  GENESIS_EVENT,
  computeGenesisHash,
  verifyGenesisEvent,
  canonicalizeJson,
} from './genesis-event';
import { createHash } from 'node:crypto';
import {
  LineageEntry,
  LineageEntryInput,
  LineageEventName,
  LineageLedgerError,
  LineageLedgerRepository,
  ZERO_HASH,
} from './lineage-ledger.types';

/**
 * UTP-LINEAGE-002 — Lineage Ledger append-only service.
 *
 * Implements PCI.3 §3 (docs/contracts/pci/03-genesis-lineage.md).
 *
 * Responsibilities:
 *   - Bootstrap entry 1 (lineage.genesis) once and only once.
 *   - Append subsequent entries with monotonic sequenceNumber and valid
 *     prevEntryHash chaining to the prior entry.
 *   - Compute deterministic per-entry hash via SHA-256 over the canonical
 *     JSON of (sequenceNumber, prevEntryHash, eventId, eventName,
 *     ledgerEntryId, timestamp, payload).
 *   - Refuse all attempts to mutate existing entries.
 *
 * Verification of stored entries (chain integrity, hash recomputation,
 * canonical genesis) lives in the Identity Lineage Guard
 * (lineage-guard.service.ts — UTP-LINEAGE-003).
 */
@Injectable()
export class LineageLedgerService {
  private readonly logger = new Logger(LineageLedgerService.name);

  public constructor(private readonly repository: LineageLedgerRepository) {}

  /**
   * Compute the canonical hash of a ledger entry. Excludes the `hash` field
   * itself (self-reference).
   */
  public static computeEntryHash(
    entry: Omit<LineageEntry, 'hash'>,
  ): string {
    const canonical = canonicalizeJson({
      ledgerEntryId: entry.ledgerEntryId,
      sequenceNumber: entry.sequenceNumber,
      prevEntryHash: entry.prevEntryHash,
      eventId: entry.eventId,
      eventName: entry.eventName,
      timestamp: entry.timestamp,
      payload: entry.payload,
    });
    return createHash('sha256').update(canonical, 'utf8').digest('hex');
  }

  /**
   * Bootstrap entry 1 (lineage.genesis) if absent. Idempotent — calling
   * twice is a no-op when entry 1 already matches the canonical Genesis.
   */
  public async bootstrapGenesis(opts?: {
    readonly ledgerEntryId?: string;
  }): Promise<LineageEntry<'lineage.genesis'>> {
    const existing = await this.repository.count();
    if (existing > 0) {
      const tail = await this.repository.tail();
      const entries = await this.repository.listAll();
      const first = entries[0];
      if (!first) {
        throw new LineageLedgerError(
          'LINEAGE_LEDGER_INCONSISTENT',
          'count > 0 but listAll returned empty',
        );
      }
      if (first.eventName !== 'lineage.genesis') {
        throw new LineageLedgerError(
          'LINEAGE_LEDGER_FIRST_NOT_GENESIS',
          'first entry is not lineage.genesis',
          { firstEventName: first.eventName },
        );
      }
      if (!verifyGenesisEvent({
        eventId: first.eventId,
        eventName: first.eventName,
        payload: first.payload,
        hash: computeGenesisHash(first.payload as never),
        timestamp: first.timestamp,
        occurredAt: first.timestamp,
        truthMode: 'observed',
        valence: 'neutral',
        provenance: GENESIS_EVENT.provenance,
      })) {
        throw new LineageLedgerError(
          'LINEAGE_LEDGER_GENESIS_TAMPERED',
          'first entry diverges from canonical Genesis',
        );
      }
      this.logger.debug(
        `bootstrapGenesis no-op — ledger has ${existing} entries, tail seq=${tail?.sequenceNumber ?? 'unknown'}`,
      );
      return first as LineageEntry<'lineage.genesis'>;
    }

    const ledgerEntryId = opts?.ledgerEntryId ?? '01JD90000000000000000001';
    const draft: Omit<LineageEntry<'lineage.genesis'>, 'hash'> = {
      ledgerEntryId,
      sequenceNumber: 1,
      prevEntryHash: ZERO_HASH,
      eventId: GENESIS_EVENT.eventId,
      eventName: 'lineage.genesis',
      timestamp: GENESIS_EVENT.timestamp,
      payload: GENESIS_EVENT.payload,
    };
    const hash = LineageLedgerService.computeEntryHash(draft);
    const entry: LineageEntry<'lineage.genesis'> = { ...draft, hash };
    await this.repository.append(entry);
    this.logger.log(
      `Lineage Ledger bootstrapped at sequenceNumber=1 — Genesis hash=${hash.slice(0, 12)}…`,
    );
    return entry;
  }

  /**
   * Append a new entry to the ledger. The entry's sequenceNumber and
   * prevEntryHash are derived from the current tail. Genesis bootstrap is
   * not permitted via this path — use bootstrapGenesis().
   */
  public async append<E extends Exclude<LineageEventName, 'lineage.genesis'>>(
    input: LineageEntryInput<E>,
  ): Promise<LineageEntry<E>> {
    const tail = await this.repository.tail();
    if (!tail) {
      throw new LineageLedgerError(
        'LINEAGE_LEDGER_NOT_BOOTSTRAPPED',
        'ledger is empty — call bootstrapGenesis first',
      );
    }
    if (tail.eventName === 'lineage.genesis' && tail.sequenceNumber !== 1) {
      throw new LineageLedgerError(
        'LINEAGE_LEDGER_INVALID_TAIL',
        'tail is genesis but sequenceNumber !== 1',
        { tailSeq: tail.sequenceNumber },
      );
    }
    const draft: Omit<LineageEntry<E>, 'hash'> = {
      ledgerEntryId: input.ledgerEntryId,
      sequenceNumber: tail.sequenceNumber + 1,
      prevEntryHash: tail.hash,
      eventId: input.eventId,
      eventName: input.eventName,
      timestamp: input.timestamp,
      payload: input.payload,
    };
    const hash = LineageLedgerService.computeEntryHash(draft);
    const entry: LineageEntry<E> = { ...draft, hash };
    await this.repository.append(entry);
    this.logger.debug(
      `appended ${input.eventName} at seq=${entry.sequenceNumber} hash=${hash.slice(0, 12)}…`,
    );
    return entry;
  }

  public async getAll(): Promise<readonly LineageEntry[]> {
    return this.repository.listAll();
  }

  public async getFromSequence(from: number): Promise<readonly LineageEntry[]> {
    return this.repository.listFromSequence(from);
  }

  public async getTail(): Promise<LineageEntry | null> {
    return this.repository.tail();
  }
}

/**
 * In-memory repository — used in tests and as the default fallback when no
 * Prisma-backed repository is wired. Append-only by enforcement: returns a
 * frozen array that callers cannot mutate.
 */
export class InMemoryLineageLedgerRepository implements LineageLedgerRepository {
  private readonly entries: LineageEntry[] = [];

  public async count(): Promise<number> {
    return this.entries.length;
  }

  public async tail(): Promise<LineageEntry | null> {
    if (this.entries.length === 0) return null;
    const last = this.entries[this.entries.length - 1];
    return last ?? null;
  }

  public async listAll(): Promise<readonly LineageEntry[]> {
    return Object.freeze([...this.entries]);
  }

  public async listFromSequence(from: number): Promise<readonly LineageEntry[]> {
    return Object.freeze(this.entries.filter((e) => e.sequenceNumber >= from));
  }

  public async append(entry: LineageEntry): Promise<void> {
    const existingByHash = this.entries.find((e) => e.hash === entry.hash);
    if (existingByHash) {
      throw new LineageLedgerError(
        'LINEAGE_LEDGER_DUPLICATE_HASH',
        `hash ${entry.hash} already exists at seq=${existingByHash.sequenceNumber}`,
      );
    }
    const existingBySeq = this.entries.find(
      (e) => e.sequenceNumber === entry.sequenceNumber,
    );
    if (existingBySeq) {
      throw new LineageLedgerError(
        'LINEAGE_LEDGER_DUPLICATE_SEQUENCE',
        `sequenceNumber ${entry.sequenceNumber} already exists`,
      );
    }
    if (this.entries.length > 0) {
      const tail = this.entries[this.entries.length - 1];
      if (tail && entry.sequenceNumber !== tail.sequenceNumber + 1) {
        throw new LineageLedgerError(
          'LINEAGE_LEDGER_NON_MONOTONIC_SEQUENCE',
          `entry seq ${entry.sequenceNumber} not adjacent to tail seq ${tail.sequenceNumber}`,
        );
      }
      if (tail && entry.prevEntryHash !== tail.hash) {
        throw new LineageLedgerError(
          'LINEAGE_LEDGER_BROKEN_CHAIN',
          `entry prevEntryHash ${entry.prevEntryHash.slice(0, 12)}… does not match tail hash ${tail.hash.slice(0, 12)}…`,
        );
      }
    } else if (entry.sequenceNumber !== 1) {
      throw new LineageLedgerError(
        'LINEAGE_LEDGER_FIRST_MUST_BE_SEQ_1',
        `first entry must have sequenceNumber=1, got ${entry.sequenceNumber}`,
      );
    } else if (entry.prevEntryHash !== ZERO_HASH) {
      throw new LineageLedgerError(
        'LINEAGE_LEDGER_FIRST_MUST_HAVE_ZERO_PREV_HASH',
        `first entry must have prevEntryHash=ZERO_HASH`,
      );
    }
    this.entries.push(entry);
  }
}
