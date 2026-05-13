/**
 * UTP-LINEAGE-002 — Lineage Ledger types.
 *
 * Implements PCI.3 §3 (docs/contracts/pci/03-genesis-lineage.md).
 *
 * The Lineage Ledger is an append-only, hash-chained sequence of entries
 * that sustain continuity of the organism's identity. Every entry is one of
 * the canonical lineage events (PCI.1 §3.1).
 *
 * Each entry carries `prevEntryHash` pointing to the previous entry's
 * `hash`. The first entry MUST be `lineage.genesis` with
 * `prevEntryHash = ZERO_HASH`. Entries are NEVER edited or removed.
 */

export const ZERO_HASH =
  '0000000000000000000000000000000000000000000000000000000000000000' as const;

/**
 * The canonical event names allowed in the Lineage Ledger.
 */
export type LineageEventName =
  | 'lineage.genesis'
  | 'lineage.capability_acquired'
  | 'lineage.skill_consolidated'
  | 'lineage.ciclo_pulse_nao_regressivo';

/**
 * Payload for a `lineage.capability_acquired` entry.
 */
export interface CapabilityAcquiredPayload {
  readonly capabilityId: string;
  readonly maturity: 'developing' | 'operational' | 'productionReady';
  readonly runtimeEvidencePct: number;
  readonly acquiredVia: string;
}

/**
 * Payload for a `lineage.skill_consolidated` entry.
 */
export interface SkillConsolidatedPayload {
  readonly skillId: string;
  readonly summary: string;
  readonly consolidatedAt: string;
}

/**
 * Payload for a `lineage.ciclo_pulse_nao_regressivo` entry.
 */
export interface CiclePulseNonRegressivePayload {
  readonly cycleNumber: number;
  readonly score: number;
  readonly verdict: 'SIM' | 'NAO' | 'INSUFFICIENT_EVIDENCE';
}

/**
 * Discriminated union of payloads keyed by event name.
 */
export type LineagePayloadByEvent = {
  readonly 'lineage.genesis': import('./genesis-event').GenesisPayload;
  readonly 'lineage.capability_acquired': CapabilityAcquiredPayload;
  readonly 'lineage.skill_consolidated': SkillConsolidatedPayload;
  readonly 'lineage.ciclo_pulse_nao_regressivo': CiclePulseNonRegressivePayload;
};

/**
 * A single ledger entry as persisted.
 */
export interface LineageEntry<E extends LineageEventName = LineageEventName> {
  readonly ledgerEntryId: string;
  readonly sequenceNumber: number;
  readonly prevEntryHash: string;
  readonly eventId: string;
  readonly eventName: E;
  readonly timestamp: string;
  readonly payload: LineagePayloadByEvent[E];
  readonly hash: string;
}

/**
 * Input shape used when appending a new entry. The ledger fills in
 * `sequenceNumber`, `prevEntryHash`, and `hash`.
 */
export type LineageEntryInput<
  E extends Exclude<LineageEventName, 'lineage.genesis'>,
> = {
  readonly ledgerEntryId: string;
  readonly eventId: string;
  readonly eventName: E;
  readonly timestamp: string;
  readonly payload: LineagePayloadByEvent[E];
};

/**
 * Repository contract for ledger persistence. In-memory and Prisma-backed
 * implementations both satisfy this contract.
 *
 * Repositories MUST refuse UPDATE/DELETE on existing entries.
 */
export interface LineageLedgerRepository {
  readonly count: () => Promise<number>;
  readonly tail: () => Promise<LineageEntry | null>;
  readonly listAll: () => Promise<readonly LineageEntry[]>;
  readonly listFromSequence: (from: number) => Promise<readonly LineageEntry[]>;
  readonly append: (entry: LineageEntry) => Promise<void>;
}

/**
 * Errors raised by the ledger.
 */
export class LineageLedgerError extends Error {
  public readonly code: string;
  public readonly meta?: Record<string, unknown>;

  public constructor(code: string, message: string, meta?: Record<string, unknown>) {
    super(`[${code}] ${message}`);
    this.name = 'LineageLedgerError';
    this.code = code;
    if (meta !== undefined) {
      this.meta = meta;
    }
  }
}
