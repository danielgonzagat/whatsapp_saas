import {
  appendFailureAndCheckFirst,
  buildAnticipationLedgerCreditMetadata,
  buildAnticipationLedgerDebitMetadata,
  buildReconciliationFailureSummary,
  buildWithdrawalLedgerMetadata,
  computeReconciliationCutoff,
  type ReconciliationFailure,
} from './wallet.reconcile.helpers';

describe('wallet.reconcile.helpers', () => {
  describe('computeReconciliationCutoff', () => {
    it('subtracts the requested whole days from `now`', () => {
      const now = new Date('2026-05-28T12:00:00.000Z');
      const cutoff = computeReconciliationCutoff(now, 7);
      expect(cutoff.toISOString()).toBe('2026-05-21T12:00:00.000Z');
    });

    it('supports fractional day windows', () => {
      const now = new Date('2026-05-28T12:00:00.000Z');
      const cutoff = computeReconciliationCutoff(now, 0.5);
      expect(cutoff.toISOString()).toBe('2026-05-28T00:00:00.000Z');
    });

    it('returns `now` itself when days is 0', () => {
      const now = new Date('2026-05-28T12:00:00.000Z');
      const cutoff = computeReconciliationCutoff(now, 0);
      expect(cutoff.toISOString()).toBe(now.toISOString());
    });

    it('rejects negative day windows', () => {
      expect(() => computeReconciliationCutoff(new Date(), -1)).toThrow(
        /Invalid reconciliation window/,
      );
    });

    it('rejects non-finite day windows', () => {
      expect(() => computeReconciliationCutoff(new Date(), Number.NaN)).toThrow(
        /Invalid reconciliation window/,
      );
      expect(() => computeReconciliationCutoff(new Date(), Number.POSITIVE_INFINITY)).toThrow(
        /Invalid reconciliation window/,
      );
    });

    it('does not mutate the `now` argument', () => {
      const now = new Date('2026-05-28T12:00:00.000Z');
      const snapshot = now.toISOString();
      computeReconciliationCutoff(now, 7);
      expect(now.toISOString()).toBe(snapshot);
    });
  });

  describe('appendFailureAndCheckFirst', () => {
    it('returns true on the first appended failure', () => {
      const failures: ReconciliationFailure[] = [];
      const isFirst = appendFailureAndCheckFirst(failures, { txId: 'tx_1', error: 'boom' });
      expect(isFirst).toBe(true);
      expect(failures).toEqual([{ txId: 'tx_1', error: 'boom' }]);
    });

    it('returns false on subsequent failures', () => {
      const failures: ReconciliationFailure[] = [{ txId: 'tx_1', error: 'boom' }];
      const isFirst = appendFailureAndCheckFirst(failures, { txId: 'tx_2', error: 'kaboom' });
      expect(isFirst).toBe(false);
      expect(failures).toHaveLength(2);
      expect(failures[1]).toEqual({ txId: 'tx_2', error: 'kaboom' });
    });

    it('mutates the accumulator in place', () => {
      const failures: ReconciliationFailure[] = [];
      appendFailureAndCheckFirst(failures, { txId: 'tx_1', error: 'a' });
      appendFailureAndCheckFirst(failures, { txId: 'tx_2', error: 'b' });
      appendFailureAndCheckFirst(failures, { txId: 'tx_3', error: 'c' });
      expect(failures.map((f) => f.txId)).toEqual(['tx_1', 'tx_2', 'tx_3']);
    });
  });

  describe('buildReconciliationFailureSummary', () => {
    it('returns null for an empty failure list', () => {
      expect(buildReconciliationFailureSummary([], 10)).toBeNull();
    });

    it('builds the aggregate message + payload', () => {
      const failures: ReconciliationFailure[] = [
        { txId: 'tx_1', error: 'boom' },
        { txId: 'tx_2', error: 'kaboom' },
      ];
      const summary = buildReconciliationFailureSummary(failures, 5);
      expect(summary).toEqual({
        message: 'wallet reconciliation: 2 of 5 settlements failed',
        details: {
          failures: [
            { txId: 'tx_1', error: 'boom' },
            { txId: 'tx_2', error: 'kaboom' },
          ],
        },
      });
    });

    it('clones the failures array so callers cannot mutate the alert payload', () => {
      const failures: ReconciliationFailure[] = [{ txId: 'tx_1', error: 'boom' }];
      const summary = buildReconciliationFailureSummary(failures, 1);
      // Ignore TS narrowing — runtime asserts the helper returned a payload.
      if (!summary) {
        throw new Error('expected summary to be non-null');
      }
      summary.details.failures.push({ txId: 'tx_2', error: 'mutated' });
      expect(failures).toEqual([{ txId: 'tx_1', error: 'boom' }]);
    });

    it('reports failure count even when it exceeds totalProcessed', () => {
      // Defensive: never silently swallow a miscount caller bug.
      const failures: ReconciliationFailure[] = [
        { txId: 'tx_1', error: 'a' },
        { txId: 'tx_2', error: 'b' },
        { txId: 'tx_3', error: 'c' },
      ];
      const summary = buildReconciliationFailureSummary(failures, 1);
      expect(summary?.message).toBe('wallet reconciliation: 3 of 1 settlements failed');
    });
  });

  describe('buildAnticipationLedgerDebitMetadata', () => {
    it('emits the legacy shape with feePercent + feeAmountInCents', () => {
      const meta = buildAnticipationLedgerDebitMetadata({
        feePercent: 3,
        feeAmountInCents: 1500,
      });
      expect(meta).toEqual({
        anticipation: true,
        feePercent: 3,
        feeAmountInCents: 1500,
      });
    });

    it('preserves zero values without coercing them to undefined', () => {
      const meta = buildAnticipationLedgerDebitMetadata({
        feePercent: 0,
        feeAmountInCents: 0,
      });
      expect(meta.feePercent).toBe(0);
      expect(meta.feeAmountInCents).toBe(0);
      expect(meta.anticipation).toBe(true);
    });
  });

  describe('buildAnticipationLedgerCreditMetadata', () => {
    it('emits the legacy { anticipation: true } shape', () => {
      expect(buildAnticipationLedgerCreditMetadata()).toEqual({ anticipation: true });
    });

    it('returns a fresh object on each call', () => {
      const a = buildAnticipationLedgerCreditMetadata();
      const b = buildAnticipationLedgerCreditMetadata();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  describe('buildWithdrawalLedgerMetadata', () => {
    it('reports hasPix=true when pixKey is a non-empty string', () => {
      expect(buildWithdrawalLedgerMetadata({ pixKey: 'user@example.com' })).toEqual({
        hasPix: true,
      });
    });

    it('reports hasPix=false when pixKey is missing', () => {
      expect(buildWithdrawalLedgerMetadata({})).toEqual({ hasPix: false });
    });

    it('reports hasPix=false when pixKey is an empty string', () => {
      expect(buildWithdrawalLedgerMetadata({ pixKey: '' })).toEqual({ hasPix: false });
    });

    it('reports hasPix=false when pixKey is null', () => {
      expect(buildWithdrawalLedgerMetadata({ pixKey: null })).toEqual({ hasPix: false });
    });

    it('coerces truthy non-string pixKey to true (mirrors the inlined `!!`)', () => {
      expect(buildWithdrawalLedgerMetadata({ pixKey: 12345 })).toEqual({ hasPix: true });
      expect(buildWithdrawalLedgerMetadata({ pixKey: { kind: 'cpf' } })).toEqual({ hasPix: true });
    });
  });
});
