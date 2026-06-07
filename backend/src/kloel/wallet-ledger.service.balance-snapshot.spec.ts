import { WalletLedgerService } from './wallet-ledger.service';

/**
 * Money-ledgers migration (Stage 4) — flag-gated `balanceAfter*Cents`
 * snapshot on KloelWalletLedger writes. Default OFF must be byte-identical to
 * the legacy append (no extra read, columns absent/NULL).
 */
describe('WalletLedgerService — KLOEL_LEDGER_BALANCE_SNAPSHOT', () => {
  const ENV_KEY = 'KLOEL_LEDGER_BALANCE_SNAPSHOT';
  let service: WalletLedgerService;
  let create: jest.Mock;
  let findUnique: jest.Mock;
  let txClient: {
    kloelWalletLedger: { create: jest.Mock };
    kloelWallet: { findUnique: jest.Mock };
  };
  let priorEnv: string | undefined;

  beforeEach(() => {
    priorEnv = process.env[ENV_KEY];
    service = new WalletLedgerService();
    create = jest.fn().mockResolvedValue({});
    findUnique = jest.fn().mockResolvedValue({
      availableBalanceInCents: 5000n,
      pendingBalanceInCents: 1200n,
      blockedBalanceInCents: 0n,
    });
    txClient = {
      kloelWalletLedger: { create },
      kloelWallet: { findUnique },
    };
  });

  afterEach(() => {
    if (priorEnv === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = priorEnv;
    }
  });

  const append = () =>
    service.appendWithinTx(
      txClient as never as Parameters<WalletLedgerService['appendWithinTx']>[0],
      {
        workspaceId: 'ws-1',
        walletId: 'wallet-1',
        transactionId: 'tx-1',
        direction: 'credit',
        bucket: 'pending',
        amountInCents: 1200n,
        reason: 'sale_credit',
      },
    );

  const lastCreateData = () =>
    (create.mock.calls as unknown[][])[0][0] as {
      data: Record<string, unknown>;
    };

  it('flag OFF (unset): no wallet read, no balanceAfter columns written', async () => {
    delete process.env[ENV_KEY];
    await append();

    expect(findUnique).not.toHaveBeenCalled();
    const { data } = lastCreateData();
    expect(data).not.toHaveProperty('balanceAfterAvailableCents');
    expect(data).not.toHaveProperty('balanceAfterPendingCents');
    expect(data).not.toHaveProperty('balanceAfterBlockedCents');
  });

  it('flag set to a non-"true" value: still OFF (byte-identical to unset)', async () => {
    process.env[ENV_KEY] = '1';
    await append();

    expect(findUnique).not.toHaveBeenCalled();
    const { data } = lastCreateData();
    expect(data).not.toHaveProperty('balanceAfterAvailableCents');
  });

  it('flag ON: reads post-mutation balances and writes all three snapshot columns', async () => {
    process.env[ENV_KEY] = 'true';
    await append();

    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'wallet-1' },
      select: {
        availableBalanceInCents: true,
        pendingBalanceInCents: true,
        blockedBalanceInCents: true,
      },
    });
    const { data } = lastCreateData();
    expect(data.balanceAfterAvailableCents).toBe(5000n);
    expect(data.balanceAfterPendingCents).toBe(1200n);
    expect(data.balanceAfterBlockedCents).toBe(0n);
    // Legacy fields preserved verbatim.
    expect(data.bucket).toBe('pending');
    expect(data.amountInCents).toBe(1200n);
  });

  it('flag ON but wallet row missing: append still succeeds with no snapshot columns', async () => {
    process.env[ENV_KEY] = 'true';
    findUnique.mockResolvedValueOnce(null);
    await expect(append()).resolves.toBeUndefined();

    const { data } = lastCreateData();
    expect(data).not.toHaveProperty('balanceAfterAvailableCents');
    expect(create).toHaveBeenCalledTimes(1);
  });
});
