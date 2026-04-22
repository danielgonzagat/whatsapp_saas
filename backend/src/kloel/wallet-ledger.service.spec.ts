import { WalletLedgerService } from './wallet-ledger.service';

describe('WalletLedgerService — I12 append-only', () => {
  let service: WalletLedgerService;
  let txClient: { kloelWalletLedger: { create: jest.Mock } };

  beforeEach(() => {
    service = new WalletLedgerService();
    txClient = { kloelWalletLedger: { create: jest.fn().mockResolvedValue({}) } };
  });

  describe('appendWithinTx', () => {
    it('inserts a row with every required field forwarded verbatim', async () => {
      await service.appendWithinTx(
        txClient as unknown as Parameters<WalletLedgerService['appendWithinTx']>[0],
        {
          workspaceId: 'ws-1',
          walletId: 'wallet-1',
          transactionId: 'tx-1',
          direction: 'credit',
          bucket: 'pending',
          amountInCents: BigInt(9201),
          reason: 'sale_credit',
          metadata: { saleId: 'sale-1' },
        },
      );

      expect(txClient.kloelWalletLedger.create).toHaveBeenCalledTimes(1);
      const call = txClient.kloelWalletLedger.create.mock.calls[0][0];
      expect(call.data).toMatchObject({
        workspaceId: 'ws-1',
        walletId: 'wallet-1',
        transactionId: 'tx-1',
        direction: 'credit',
        bucket: 'pending',
        amountInCents: BigInt(9201),
        reason: 'sale_credit',
      });
      expect(call.data.metadata).toEqual({ saleId: 'sale-1' });
    });

    it('accepts a null transactionId for adjustments / corrections', async () => {
      await service.appendWithinTx(
        txClient as unknown as Parameters<WalletLedgerService['appendWithinTx']>[0],
        {
          workspaceId: 'ws-1',
          walletId: 'wallet-1',
          transactionId: null,
          direction: 'credit',
          bucket: 'available',
          amountInCents: BigInt(100),
          reason: 'manual_adjustment_credit',
        },
      );

      const call = txClient.kloelWalletLedger.create.mock.calls[0][0];
      expect(call.data.transactionId).toBeNull();
      expect(call.data.metadata).toBeUndefined();
    });

    it('rejects a negative amountInCents as a caller bug', async () => {
      await expect(
        service.appendWithinTx(
          txClient as unknown as Parameters<WalletLedgerService['appendWithinTx']>[0],
          {
            workspaceId: 'ws-1',
            walletId: 'wallet-1',
            transactionId: 'tx-1',
            direction: 'debit',
            bucket: 'available',
            amountInCents: BigInt(-100),
            reason: 'withdrawal_debit',
          },
        ),
      ).rejects.toThrow(/non-negative/);
      expect(txClient.kloelWalletLedger.create).not.toHaveBeenCalled();
    });

    it('accepts BigInt(0) (a no-op write that still records intent)', async () => {
      await expect(
        service.appendWithinTx(
          txClient as unknown as Parameters<WalletLedgerService['appendWithinTx']>[0],
          {
            workspaceId: 'ws-1',
            walletId: 'wallet-1',
            transactionId: 'tx-1',
            direction: 'credit',
            bucket: 'pending',
            amountInCents: BigInt(0),
            reason: 'sale_credit',
          },
        ),
      ).resolves.toBeUndefined();
      expect(txClient.kloelWalletLedger.create).toHaveBeenCalled();
    });

    it('does not mutate the metadata object passed in (defensive copy)', async () => {
      const metadata = { saleId: 'sale-1', nested: { foo: 'bar' } };
      await service.appendWithinTx(
        txClient as unknown as Parameters<WalletLedgerService['appendWithinTx']>[0],
        {
          workspaceId: 'ws-1',
          walletId: 'wallet-1',
          transactionId: 'tx-1',
          direction: 'credit',
          bucket: 'pending',
          amountInCents: BigInt(100),
          reason: 'sale_credit',
          metadata,
        },
      );
      // The exact object identity is NOT preserved (we JSON.parse(JSON.stringify(...))).
      // Mutating the original after the call must not affect the persisted snapshot.
      metadata.saleId = 'mutated';
      const call = txClient.kloelWalletLedger.create.mock.calls[0][0];
      expect(call.data.metadata.saleId).toBe('sale-1');
    });
  });
});
