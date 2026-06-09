/**
 * Proves the pure cumulative-replay helper used by the historical balanceAfter
 * backfill: folds computeBalanceAfter per touched bucket from 0, snapshots ALL
 * buckets per entry, preserves the I12 invariant
 * (balanceAfter == prior + signed(direction)*amount), and is positionally
 * aligned with the input sequence.
 */
import {
  replayBalanceAfter,
  type LedgerReplayEntry,
} from './shared-ledger.port';

type B = 'available' | 'pending' | 'blocked';
const BUCKETS: ReadonlyArray<B> = ['available', 'pending', 'blocked'];

describe('replayBalanceAfter', () => {
  it('returns [] for no entries', () => {
    expect(replayBalanceAfter([], BUCKETS)).toEqual([]);
  });

  it('folds a single credit from zero into the touched bucket only', () => {
    const entries: Array<LedgerReplayEntry<B>> = [
      { bucket: 'available', direction: 'credit', amountInCents: 1000n },
    ];
    expect(replayBalanceAfter(entries, BUCKETS)).toEqual([
      { available: 1000n, pending: 0n, blocked: 0n },
    ]);
  });

  it('snapshots ALL buckets per entry across a mixed sequence', () => {
    const entries: Array<LedgerReplayEntry<B>> = [
      { bucket: 'pending', direction: 'credit', amountInCents: 5000n }, // sale lands in pending
      { bucket: 'pending', direction: 'debit', amountInCents: 5000n }, // confirm: out of pending
      { bucket: 'available', direction: 'credit', amountInCents: 5000n }, // confirm: into available
      { bucket: 'available', direction: 'debit', amountInCents: 2000n }, // withdrawal
    ];
    expect(replayBalanceAfter(entries, BUCKETS)).toEqual([
      { available: 0n, pending: 5000n, blocked: 0n },
      { available: 0n, pending: 0n, blocked: 0n },
      { available: 5000n, pending: 0n, blocked: 0n },
      { available: 3000n, pending: 0n, blocked: 0n },
    ]);
  });

  it('preserves the I12 invariant balanceAfter == prior + signed*amount per step', () => {
    const entries: Array<LedgerReplayEntry<B>> = [
      { bucket: 'available', direction: 'credit', amountInCents: 100n },
      { bucket: 'available', direction: 'credit', amountInCents: 250n },
      { bucket: 'available', direction: 'debit', amountInCents: 50n },
    ];
    const out = replayBalanceAfter(entries, BUCKETS);
    let prior = 0n;
    for (let i = 0; i < entries.length; i += 1) {
      const e = entries[i]!;
      const signed = e.direction === 'credit' ? e.amountInCents : -e.amountInCents;
      expect(out[i]!.available).toBe(prior + signed);
      prior = out[i]!.available;
    }
  });

  it('is positionally aligned with the input', () => {
    const entries: Array<LedgerReplayEntry<B>> = [
      { bucket: 'available', direction: 'credit', amountInCents: 1n },
      { bucket: 'blocked', direction: 'credit', amountInCents: 2n },
    ];
    const out = replayBalanceAfter(entries, BUCKETS);
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual({ available: 1n, pending: 0n, blocked: 2n });
  });
});
