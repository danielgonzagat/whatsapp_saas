import {
  buildConfirmPaymentNoopLogMessage,
  buildReconciliationFailedLogMessage,
  buildReconciliationSettledLogMessage,
  buildReconciliationStartLogMessage,
  buildWalletIndex,
  uniqueWalletIds,
} from './wallet.helpers';

describe('wallet.helpers (reconciliation + wallet index)', () => {
  describe('uniqueWalletIds', () => {
    it('deduplicates wallet ids while preserving valid strings', () => {
      const out = uniqueWalletIds([
        { walletId: 'a' },
        { walletId: 'b' },
        { walletId: 'a' },
        { walletId: 'c' },
      ]);
      expect(out).toEqual(['a', 'b', 'c']);
    });

    it('drops null, undefined and empty wallet ids', () => {
      const out = uniqueWalletIds([
        { walletId: 'x' },
        { walletId: null },
        { walletId: undefined },
        { walletId: '' },
        { walletId: 'y' },
      ]);
      expect(out).toEqual(['x', 'y']);
    });

    it('returns an empty array when input has no valid ids', () => {
      expect(uniqueWalletIds([])).toEqual([]);
      expect(uniqueWalletIds([{ walletId: null }, { walletId: '' }])).toEqual([]);
    });
  });

  describe('buildWalletIndex', () => {
    it('keys wallets by id with O(1) lookup', () => {
      const wallets = [
        { id: 'w1', workspaceId: 'ws-1' },
        { id: 'w2', workspaceId: 'ws-2' },
      ];
      const idx = buildWalletIndex(wallets);
      expect(idx.size).toBe(2);
      expect(idx.get('w1')).toBe(wallets[0]);
      expect(idx.get('w2')).toBe(wallets[1]);
      expect(idx.get('missing')).toBeUndefined();
    });

    it('keeps the LAST occurrence on duplicate ids (Map semantics)', () => {
      const w1a = { id: 'w', workspaceId: 'ws-a' };
      const w1b = { id: 'w', workspaceId: 'ws-b' };
      const idx = buildWalletIndex([w1a, w1b]);
      expect(idx.size).toBe(1);
      expect(idx.get('w')).toBe(w1b);
    });
  });

  describe('buildReconciliationStartLogMessage', () => {
    it('renders the batch size header', () => {
      expect(buildReconciliationStartLogMessage(5)).toBe('Reconciling 5 pending transaction(s)...');
      expect(buildReconciliationStartLogMessage(1)).toBe('Reconciling 1 pending transaction(s)...');
    });
  });

  describe('buildReconciliationSettledLogMessage', () => {
    const fakeFormat = (n: number) => `R$ ${n.toFixed(2)}`;

    it('renders the settled-tx log line with the formatted amount', () => {
      expect(buildReconciliationSettledLogMessage('tx-7', 99.5, fakeFormat)).toBe(
        'Settled tx tx-7: R$ 99.50 -> available',
      );
    });
  });

  describe('buildReconciliationFailedLogMessage', () => {
    it('renders the per-tx failure log line', () => {
      expect(buildReconciliationFailedLogMessage('tx-bad', 'database unreachable')).toBe(
        'Failed to settle tx tx-bad: database unreachable',
      );
    });
  });

  describe('buildConfirmPaymentNoopLogMessage', () => {
    it('renders the not_found reason', () => {
      expect(buildConfirmPaymentNoopLogMessage('tx-1', 'not_found')).toBe(
        'confirmPayment noop for tx-1: not_found',
      );
    });

    it('renders the not_pending reason', () => {
      expect(buildConfirmPaymentNoopLogMessage('tx-2', 'not_pending')).toBe(
        'confirmPayment noop for tx-2: not_pending',
      );
    });

    it('renders the race_lost reason', () => {
      expect(buildConfirmPaymentNoopLogMessage('tx-3', 'race_lost')).toBe(
        'confirmPayment noop for tx-3: race_lost',
      );
    });
  });
});
