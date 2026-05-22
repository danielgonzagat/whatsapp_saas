import { creditWalletFromPaidCheckoutUpdate } from './wallet';

describe('creditWalletFromPaidCheckoutUpdate', () => {
  const checkoutOrderFindFirst = jest.fn();
  const walletUpsert = jest.fn();
  const walletTransactionFindFirst = jest.fn();
  const walletUpdateMany = jest.fn();
  const walletTransactionCreate = jest.fn();
  const walletLedgerCreate = jest.fn();
  const tx = {
    kloelWallet: {
      upsert: walletUpsert,
      updateMany: walletUpdateMany,
    },
    kloelWalletTransaction: {
      findFirst: walletTransactionFindFirst,
      create: walletTransactionCreate,
    },
    kloelWalletLedger: {
      create: walletLedgerCreate,
    },
  };
  const prisma = {
    checkoutOrder: {
      findFirst: checkoutOrderFindFirst,
    },
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    checkoutOrderFindFirst.mockResolvedValue({
      id: 'order-1',
      workspaceId: 'ws-1',
      orderNumber: 'ORD-1',
      totalInCents: 10000,
      plan: { product: { name: 'Produto Teste' } },
    });
    walletUpsert.mockResolvedValue({
      id: 'wallet-1',
      workspaceId: 'ws-1',
      updatedAt: new Date('2026-05-11T12:00:00.000Z'),
    });
    walletTransactionFindFirst.mockResolvedValue(null);
    walletUpdateMany.mockResolvedValue({ count: 1 });
    walletTransactionCreate.mockResolvedValue({ id: 'wallet-tx-1' });
    walletLedgerCreate.mockResolvedValue({ id: 'ledger-1' });
  });

  it('credits wallet pending balance and ledger once for a paid checkout order', async () => {
    const result = await creditWalletFromPaidCheckoutUpdate(prisma as never, {
      where: { id: 'order-1', workspaceId: 'ws-1' },
      data: { status: 'PAID' },
    });

    expect(result).toBe(true);
    expect(checkoutOrderFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-1', workspaceId: 'ws-1', status: 'PAID' },
      }),
    );
    expect(walletTransactionFindFirst).toHaveBeenCalledWith({
      where: {
        walletId: 'wallet-1',
        reference: 'checkout:order-1',
        type: 'credit',
      },
      select: { id: true },
    });
    expect(walletUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'wallet-1',
        workspaceId: 'ws-1',
        updatedAt: new Date('2026-05-11T12:00:00.000Z'),
      },
      data: {
        pendingBalance: { increment: 92.01 },
        pendingBalanceInCents: { increment: 9201n },
      },
    });
    expect(walletTransactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          walletId: 'wallet-1',
          type: 'credit',
          amount: 92.01,
          amountInCents: 9201n,
          reference: 'checkout:order-1',
          status: 'pending',
        }),
      }),
    );
    expect(walletLedgerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: 'ws-1',
          walletId: 'wallet-1',
          transactionId: 'wallet-tx-1',
          direction: 'credit',
          bucket: 'pending',
          amountInCents: 9201n,
          reason: 'sale_credit',
        }),
      }),
    );
  });

  it('does not double-credit when a checkout wallet transaction already exists', async () => {
    walletTransactionFindFirst.mockResolvedValueOnce({ id: 'wallet-tx-existing' });

    const result = await creditWalletFromPaidCheckoutUpdate(prisma as never, {
      where: { id: 'order-1', workspaceId: 'ws-1' },
      data: { status: 'PAID' },
    });

    expect(result).toBe(false);
    expect(walletUpdateMany).not.toHaveBeenCalled();
    expect(walletTransactionCreate).not.toHaveBeenCalled();
    expect(walletLedgerCreate).not.toHaveBeenCalled();
  });

  it('returns false when the paid checkout order has no positive amount', async () => {
    checkoutOrderFindFirst.mockResolvedValueOnce({
      id: 'order-1',
      workspaceId: 'ws-1',
      orderNumber: 'ORD-1',
      totalInCents: 0,
      plan: { product: { name: 'Produto Teste' } },
    });

    const result = await creditWalletFromPaidCheckoutUpdate(prisma as never, {
      where: { id: 'order-1', workspaceId: 'ws-1' },
      data: { status: 'PAID' },
    });

    expect(result).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(walletUpdateMany).not.toHaveBeenCalled();
  });

  it('throws when wallet optimistic-lock update loses the race', async () => {
    walletUpdateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      creditWalletFromPaidCheckoutUpdate(prisma as never, {
        where: { id: 'order-1', workspaceId: 'ws-1' },
        data: { status: 'PAID' },
      }),
    ).rejects.toThrow('checkout_wallet_credit_race_lost');

    expect(walletTransactionCreate).not.toHaveBeenCalled();
    expect(walletLedgerCreate).not.toHaveBeenCalled();
  });

  it('ignores updateMany args that do not identify one workspace-scoped order', async () => {
    const result = await creditWalletFromPaidCheckoutUpdate(prisma as never, {
      where: { status: 'PAID' },
      data: { status: 'PAID' },
    });

    expect(result).toBe(false);
    expect(checkoutOrderFindFirst).not.toHaveBeenCalled();
  });
});
