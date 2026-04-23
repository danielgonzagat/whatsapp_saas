import { Test, type TestingModule } from '@nestjs/testing';

import { StripeService } from '../../billing/stripe.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConnectService } from '../connect/connect.service';
import { LedgerService } from '../ledger/ledger.service';

import { ConnectReversalService } from './connect-reversal.service';

function makeWebhookData() {
  return {
    splitInput: {
      buyerPaidCents: '13990',
    },
    connectPostSale: {
      sellerStripeAccountId: 'acct_seller',
      sellerDestinationAmountCents: '1196',
      transferGroup: 'sale:order_1',
      transfers: [
        {
          role: 'supplier',
          accountId: 'acct_supplier',
          amountCents: '4210',
          stripeTransferId: 'tr_supplier_1',
        },
        {
          role: 'affiliate',
          accountId: 'acct_affiliate',
          amountCents: '3604',
          stripeTransferId: 'tr_affiliate_1',
        },
      ],
    },
  };
}

type ConnectReversalPrismaMock = Record<string, unknown> & {
  $transaction?: jest.Mock;
  adminAuditLog?: {
    create: jest.Mock;
  };
};

function withTransaction(prisma: Record<string, unknown>) {
  const prismaMock = prisma as ConnectReversalPrismaMock;
  prismaMock.adminAuditLog ??= {
    create: jest.fn().mockResolvedValue({ id: 'audit_1' }),
  };
  prismaMock.$transaction ??= jest
    .fn()
    .mockImplementation(async (callback: (tx: ConnectReversalPrismaMock) => Promise<unknown>) =>
      callback(prismaMock),
    );
  return prismaMock;
}

async function buildService({
  prisma,
  stripe,
  connect,
  ledger,
}: {
  prisma: Record<string, unknown>;
  stripe: Record<string, unknown>;
  connect: Record<string, unknown>;
  ledger: Record<string, unknown>;
}) {
  const prismaMock = withTransaction(prisma);
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      ConnectReversalService,
      { provide: PrismaService, useValue: prismaMock },
      { provide: StripeService, useValue: stripe },
      { provide: ConnectService, useValue: connect },
      { provide: LedgerService, useValue: ledger },
    ],
  }).compile();

  return moduleRef.get(ConnectReversalService);
}

describe('ConnectReversalService.processRefund', () => {
  it('reverses seller + manual stakeholder transfers and debits their ledgers on full refund', async () => {
    const prisma = {
      checkoutPayment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cp_1',
          webhookData: makeWebhookData(),
        }),
      },
    };
    const stripe = {
      stripe: {
        transfers: {
          list: jest.fn().mockResolvedValue({
            data: [{ id: 'tr_seller_1', destination: 'acct_seller', amount: 1196 }],
          }),
          createReversal: jest
            .fn()
            .mockResolvedValueOnce({ id: 'trr_seller_1' })
            .mockResolvedValueOnce({ id: 'trr_supplier_1' })
            .mockResolvedValueOnce({ id: 'trr_affiliate_1' }),
        },
      },
    };
    const connect = {
      findBalanceByStripeAccountId: jest.fn().mockImplementation(
        async (stripeAccountId: string) =>
          ({
            acct_seller: { id: 'cab_seller' },
            acct_supplier: { id: 'cab_supplier' },
            acct_affiliate: { id: 'cab_affiliate' },
          })[stripeAccountId] ?? null,
      ),
    };
    const ledger = {
      debitForRefund: jest.fn().mockResolvedValue({ id: 'cle_refund_1' }),
      debitForChargeback: jest.fn(),
    };
    const service = await buildService({ prisma, stripe, connect, ledger });

    const result = await service.processRefund({
      paymentIntentId: 'pi_sale_1',
      refundId: 're_1',
      amountCents: 13_990n,
    });

    expect(stripe.stripe.transfers.list).toHaveBeenCalledWith({
      transfer_group: 'sale:order_1',
      limit: 100,
    });
    expect(stripe.stripe.transfers.createReversal).toHaveBeenNthCalledWith(
      1,
      'tr_seller_1',
      expect.objectContaining({
        amount: 1196,
        metadata: expect.objectContaining({
          paymentIntentId: 'pi_sale_1',
          triggerType: 'refund',
          triggerId: 're_1',
          role: 'seller',
        }),
      }),
      { idempotencyKey: 'refund:re_1:tr_seller_1' },
    );
    expect(stripe.stripe.transfers.createReversal).toHaveBeenNthCalledWith(
      2,
      'tr_supplier_1',
      expect.objectContaining({
        amount: 4210,
        metadata: expect.objectContaining({
          paymentIntentId: 'pi_sale_1',
          triggerType: 'refund',
          triggerId: 're_1',
          role: 'supplier',
        }),
      }),
      { idempotencyKey: 'refund:re_1:tr_supplier_1' },
    );
    expect(stripe.stripe.transfers.createReversal).toHaveBeenNthCalledWith(
      3,
      'tr_affiliate_1',
      expect.objectContaining({
        amount: 3604,
        metadata: expect.objectContaining({
          role: 'affiliate',
        }),
      }),
      { idempotencyKey: 'refund:re_1:tr_affiliate_1' },
    );
    expect(ledger.debitForRefund).toHaveBeenCalledTimes(3);
    expect(ledger.debitForRefund).toHaveBeenCalledWith({
      accountBalanceId: 'cab_seller',
      amountCents: 1196n,
      reference: { type: 'refund', id: 're_1:seller' },
      metadata: expect.objectContaining({
        paymentIntentId: 'pi_sale_1',
        stripeTransferId: 'tr_seller_1',
      }),
    });
    expect(ledger.debitForRefund).toHaveBeenCalledWith({
      accountBalanceId: 'cab_supplier',
      amountCents: 4210n,
      reference: { type: 'refund', id: 're_1:supplier' },
      metadata: expect.objectContaining({
        paymentIntentId: 'pi_sale_1',
        stripeTransferId: 'tr_supplier_1',
      }),
    });
    expect(result).toEqual({
      paymentIntentId: 'pi_sale_1',
      triggerId: 're_1',
      reversedTransfers: 3,
      ledgerDebits: 3,
      reversedAmountCents: 9010n,
    });
  });

  it('distributes fractional refund cents to the highest-remainder stakeholder on tiny partial refunds', async () => {
    const prisma = {
      checkoutPayment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cp_1',
          webhookData: makeWebhookData(),
        }),
      },
    };
    const stripe = {
      stripe: {
        transfers: {
          list: jest.fn().mockResolvedValue({
            data: [{ id: 'tr_seller_1', destination: 'acct_seller', amount: 1196 }],
          }),
          createReversal: jest.fn().mockResolvedValue({ id: 'trr_supplier_1' }),
        },
      },
    };
    const connect = {
      findBalanceByStripeAccountId: jest.fn().mockImplementation(
        async (stripeAccountId: string) =>
          ({
            acct_supplier: { id: 'cab_supplier' },
          })[stripeAccountId] ?? null,
      ),
    };
    const ledger = {
      debitForRefund: jest.fn().mockResolvedValue({ id: 'cle_refund_1' }),
      debitForChargeback: jest.fn(),
    };
    const service = await buildService({ prisma, stripe, connect, ledger });

    const result = await service.processRefund({
      paymentIntentId: 'pi_sale_1',
      refundId: 're_tiny',
      amountCents: 2n,
    });

    expect(stripe.stripe.transfers.createReversal).toHaveBeenCalledTimes(1);
    expect(stripe.stripe.transfers.createReversal).toHaveBeenCalledWith(
      'tr_supplier_1',
      expect.objectContaining({
        amount: 1,
        metadata: expect.objectContaining({
          triggerType: 'refund',
          triggerId: 're_tiny',
          role: 'supplier',
        }),
      }),
      { idempotencyKey: 'refund:re_tiny:tr_supplier_1' },
    );
    expect(ledger.debitForRefund).toHaveBeenCalledTimes(1);
    expect(ledger.debitForRefund).toHaveBeenCalledWith({
      accountBalanceId: 'cab_supplier',
      amountCents: 1n,
      reference: { type: 'refund', id: 're_tiny:supplier' },
      metadata: expect.objectContaining({
        paymentIntentId: 'pi_sale_1',
        stripeTransferId: 'tr_supplier_1',
      }),
    });
    expect(result).toEqual({
      paymentIntentId: 'pi_sale_1',
      triggerId: 're_tiny',
      reversedTransfers: 1,
      ledgerDebits: 1,
      reversedAmountCents: 1n,
    });
  });

  it('throws when the persisted reversal snapshot is missing', async () => {
    const prisma = {
      checkoutPayment: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const stripe = {
      stripe: {
        transfers: {
          list: jest.fn(),
          createReversal: jest.fn(),
        },
      },
    };
    const connect = {
      findBalanceByStripeAccountId: jest.fn(),
    };
    const ledger = {
      debitForRefund: jest.fn(),
      debitForChargeback: jest.fn(),
    };
    const service = await buildService({ prisma, stripe, connect, ledger });

    await expect(
      service.processRefund({
        paymentIntentId: 'pi_missing',
        refundId: 're_missing',
        amountCents: 100n,
      }),
    ).rejects.toThrow('Missing connectPostSale reversal snapshot');
  });
});

describe('ConnectReversalService.processDispute', () => {
  it('reverses seller destination transfer plus manual transfers and debits chargeback ledger entries', async () => {
    const prisma = {
      checkoutPayment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cp_1',
          webhookData: makeWebhookData(),
        }),
      },
    };
    const stripe = {
      stripe: {
        transfers: {
          list: jest.fn().mockResolvedValue({
            data: [
              { id: 'tr_seller_1', destination: 'acct_seller', amount: 1196 },
              { id: 'tr_supplier_1', destination: 'acct_supplier', amount: 4210 },
              { id: 'tr_affiliate_1', destination: 'acct_affiliate', amount: 3604 },
            ],
          }),
          createReversal: jest
            .fn()
            .mockResolvedValueOnce({ id: 'trr_seller_1' })
            .mockResolvedValueOnce({ id: 'trr_supplier_1' })
            .mockResolvedValueOnce({ id: 'trr_affiliate_1' }),
        },
      },
    };
    const connect = {
      findBalanceByStripeAccountId: jest.fn().mockImplementation(
        async (stripeAccountId: string) =>
          ({
            acct_seller: { id: 'cab_seller' },
            acct_supplier: { id: 'cab_supplier' },
            acct_affiliate: { id: 'cab_affiliate' },
          })[stripeAccountId] ?? null,
      ),
    };
    const ledger = {
      debitForRefund: jest.fn(),
      debitForChargeback: jest.fn().mockResolvedValue({ id: 'cle_cb_1' }),
    };
    const service = await buildService({ prisma, stripe, connect, ledger });

    const result = await service.processDispute({
      paymentIntentId: 'pi_sale_1',
      disputeId: 'dp_1',
      amountCents: 13_990n,
    });

    expect(stripe.stripe.transfers.list).toHaveBeenCalledWith({
      transfer_group: 'sale:order_1',
      limit: 100,
    });
    expect(stripe.stripe.transfers.createReversal).toHaveBeenNthCalledWith(
      1,
      'tr_seller_1',
      expect.objectContaining({ amount: 1196 }),
      { idempotencyKey: 'dispute:dp_1:tr_seller_1' },
    );
    expect(ledger.debitForChargeback).toHaveBeenCalledTimes(3);
    expect(ledger.debitForChargeback).toHaveBeenCalledWith({
      accountBalanceId: 'cab_seller',
      amountCents: 1196n,
      reference: { type: 'dispute', id: 'dp_1:seller' },
      metadata: expect.objectContaining({
        paymentIntentId: 'pi_sale_1',
        stripeTransferId: 'tr_seller_1',
      }),
    });
    expect(result).toEqual({
      paymentIntentId: 'pi_sale_1',
      triggerId: 'dp_1',
      reversedTransfers: 3,
      ledgerDebits: 3,
      reversedAmountCents: 9010n,
    });
  });

  it('distributes fractional dispute cents to the highest-remainder stakeholder on tiny partial disputes', async () => {
    const prisma = {
      checkoutPayment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cp_1',
          webhookData: makeWebhookData(),
        }),
      },
    };
    const stripe = {
      stripe: {
        transfers: {
          list: jest.fn().mockResolvedValue({
            data: [{ id: 'tr_seller_1', destination: 'acct_seller', amount: 1196 }],
          }),
          createReversal: jest.fn().mockResolvedValue({ id: 'trr_supplier_1' }),
        },
      },
    };
    const connect = {
      findBalanceByStripeAccountId: jest.fn().mockImplementation(
        async (stripeAccountId: string) =>
          ({
            acct_supplier: { id: 'cab_supplier' },
          })[stripeAccountId] ?? null,
      ),
    };
    const ledger = {
      debitForRefund: jest.fn(),
      debitForChargeback: jest.fn().mockResolvedValue({ id: 'cle_cb_1' }),
    };
    const service = await buildService({ prisma, stripe, connect, ledger });

    const result = await service.processDispute({
      paymentIntentId: 'pi_sale_1',
      disputeId: 'dp_tiny',
      amountCents: 2n,
    });

    expect(stripe.stripe.transfers.createReversal).toHaveBeenCalledTimes(1);
    expect(stripe.stripe.transfers.createReversal).toHaveBeenCalledWith(
      'tr_supplier_1',
      expect.objectContaining({
        amount: 1,
        metadata: expect.objectContaining({
          triggerType: 'dispute',
          triggerId: 'dp_tiny',
          role: 'supplier',
        }),
      }),
      { idempotencyKey: 'dispute:dp_tiny:tr_supplier_1' },
    );
    expect(ledger.debitForChargeback).toHaveBeenCalledTimes(1);
    expect(ledger.debitForChargeback).toHaveBeenCalledWith({
      accountBalanceId: 'cab_supplier',
      amountCents: 1n,
      reference: { type: 'dispute', id: 'dp_tiny:supplier' },
      metadata: expect.objectContaining({
        paymentIntentId: 'pi_sale_1',
        stripeTransferId: 'tr_supplier_1',
      }),
    });
    expect(result).toEqual({
      paymentIntentId: 'pi_sale_1',
      triggerId: 'dp_tiny',
      reversedTransfers: 1,
      ledgerDebits: 1,
      reversedAmountCents: 1n,
    });
  });

  it('throws when a seller transfer is expected but not found on Stripe', async () => {
    const prisma = {
      checkoutPayment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cp_1',
          webhookData: makeWebhookData(),
        }),
      },
    };
    const stripe = {
      stripe: {
        transfers: {
          list: jest.fn().mockResolvedValue({ data: [] }),
          createReversal: jest.fn(),
        },
      },
    };
    const connect = {
      findBalanceByStripeAccountId: jest.fn(),
    };
    const ledger = {
      debitForRefund: jest.fn(),
      debitForChargeback: jest.fn(),
    };
    const service = await buildService({ prisma, stripe, connect, ledger });

    await expect(
      service.processDispute({
        paymentIntentId: 'pi_sale_1',
        disputeId: 'dp_missing_seller',
        amountCents: 100n,
      }),
    ).rejects.toThrow('Seller transfer not found');
  });
});
