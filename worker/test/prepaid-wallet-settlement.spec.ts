import { describe, it, expect, vi } from 'vitest';
import {
  WorkerInsufficientWalletBalanceError,
  quoteSerializedInputTokenCostCents,
  settleQuotedUsageCharge,
} from '../processors/prepaid-wallet-settlement';

type MockDb = NonNullable<Parameters<typeof settleQuotedUsageCharge>[1]>;
type MockTx = Parameters<Parameters<MockDb['$transaction']>[0]>[0];

function buildDb(tx: MockTx): MockDb {
  const transaction: MockDb['$transaction'] = async (callback) => callback(tx);

  return {
    $transaction: vi.fn(transaction) as MockDb['$transaction'],
  };
}

describe('prepaid-wallet-settlement', () => {
  it('quotes async input-token billing descriptors with the certified FX and markup', () => {
    const cents = quoteSerializedInputTokenCostCents({
      inputTokens: 1_000_000,
      billing: {
        model: 'text-embedding-3-small',
        inputUsdMicrosPerMillion: '20000',
        exchangeRateBrlCentsPerUsd: '500',
        markupBps: '30000',
      },
    });

    expect(cents).toBe(BigInt(30));
  });

  it('creates a refund adjustment when actual provider cost is below the original quote', async () => {
    const tx: MockTx = {
      prepaidWalletTransaction: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            id: 'usage_tx_1',
            walletId: 'wallet_1',
            amountCents: -BigInt(3),
          }),
        create: vi.fn().mockResolvedValue({
          id: 'adj_tx_1',
          walletId: 'wallet_1',
          amountCents: BigInt(2),
        }),
      },
      prepaidWallet: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'wallet_1',
          workspaceId: 'ws_1',
          balanceCents: BigInt(97),
        }),
        update: vi.fn().mockResolvedValue(undefined),
      },
    };

    const adjustment = await settleQuotedUsageCharge(
      {
        workspaceId: 'ws_1',
        operation: 'kb_ingestion',
        requestId: 'kb-req-1',
        actualCostCents: BigInt(1),
        reason: 'knowledge_base_embedding_provider_usage',
        metadata: { sourceId: 'src_1' },
      },
      buildDb(tx),
    );

    expect(tx.prepaidWallet.update).toHaveBeenCalledWith({
      where: { id: 'wallet_1' },
      data: { balanceCents: BigInt(99) },
    });
    expect(tx.prepaidWalletTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        walletId: 'wallet_1',
        type: 'ADJUSTMENT',
        amountCents: BigInt(2),
        balanceAfterCents: BigInt(99),
        referenceType: 'adjust:usage:kb_ingestion',
        referenceId: 'kb-req-1',
      }),
    });
    expect(adjustment).toEqual({
      id: 'adj_tx_1',
      walletId: 'wallet_1',
      amountCents: BigInt(2),
    });
  });

  it('returns null when actual provider cost matches the original quote', async () => {
    const tx: MockTx = {
      prepaidWalletTransaction: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            id: 'usage_tx_2',
            walletId: 'wallet_1',
            amountCents: -BigInt(1),
          }),
        create: vi.fn(),
      },
      prepaidWallet: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'wallet_1',
          workspaceId: 'ws_1',
          balanceCents: BigInt(99),
        }),
        update: vi.fn(),
      },
    };

    const adjustment = await settleQuotedUsageCharge(
      {
        workspaceId: 'ws_1',
        operation: 'kb_ingestion',
        requestId: 'kb-req-2',
        actualCostCents: BigInt(1),
        reason: 'knowledge_base_embedding_provider_usage',
      },
      buildDb(tx),
    );

    expect(adjustment).toBeNull();
    expect(tx.prepaidWallet.update).not.toHaveBeenCalled();
    expect(tx.prepaidWalletTransaction.create).not.toHaveBeenCalled();
  });

  it('throws when a positive settlement shortfall exceeds the current wallet balance', async () => {
    const tx: MockTx = {
      prepaidWalletTransaction: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            id: 'usage_tx_3',
            walletId: 'wallet_1',
            amountCents: -BigInt(1),
          }),
        create: vi.fn(),
      },
      prepaidWallet: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'wallet_1',
          workspaceId: 'ws_1',
          balanceCents: BigInt(0),
        }),
        update: vi.fn(),
      },
    };

    await expect(
      settleQuotedUsageCharge(
        {
          workspaceId: 'ws_1',
          operation: 'kb_ingestion',
          requestId: 'kb-req-3',
          actualCostCents: BigInt(2),
          reason: 'knowledge_base_embedding_provider_usage',
        },
        buildDb(tx),
      ),
    ).rejects.toBeInstanceOf(WorkerInsufficientWalletBalanceError);
  });
});
