import { Test, type TestingModule } from '@nestjs/testing';
import type { ConnectAccountBalance } from '@prisma/client';

import { StripeService } from '../../billing/stripe.service';
import type { StripePaymentIntent } from '../../billing/stripe-types';
import { ConnectService } from '../connect/connect.service';
import { LedgerService } from '../ledger/ledger.service';
import type { SplitRole } from '../split/split.types';

import { StripeWebhookProcessor } from './stripe-webhook.processor';

type StripeStub = {
  stripe: { transfers: { create: jest.Mock } };
};

function makeStripeStub(): StripeStub {
  let nextTransferId = 1;
  return {
    stripe: {
      transfers: {
        create: jest.fn().mockImplementation(async () => ({ id: `tr_${nextTransferId++}` })),
      },
    },
  };
}

function makeConnectStub(map: Record<string, string | null>) {
  return {
    findBalanceByStripeAccountId: jest.fn(async (stripeAccountId: string) =>
      map[stripeAccountId] === null
        ? null
        : ({ id: map[stripeAccountId] ?? `cab_${stripeAccountId}` } as ConnectAccountBalance),
    ),
  };
}

function makeLedgerStub() {
  return {
    creditPending: jest.fn(async () => ({ id: 'cle_x' })),
  };
}

async function buildProcessor(
  stripe: StripeStub,
  connect: ReturnType<typeof makeConnectStub>,
  ledger: ReturnType<typeof makeLedgerStub>,
) {
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      StripeWebhookProcessor,
      { provide: StripeService, useValue: stripe },
      { provide: ConnectService, useValue: connect },
      { provide: LedgerService, useValue: ledger },
    ],
  }).compile();
  return moduleRef.get(StripeWebhookProcessor);
}

const matureAt = (_role: SplitRole) => new Date('2026-05-17T00:00:00Z');

const buildPaymentIntent = (overrides: Partial<StripePaymentIntent> = {}): StripePaymentIntent =>
  ({
    id: 'pi_sale_xyz',
    on_behalf_of: 'acct_seller',
    latest_charge: 'ch_sale_xyz',
    currency: 'brl',
    transfer_group: 'sale:order_xyz',
    metadata: {
      type: 'sale',
      kloel_order_id: 'order_xyz',
      split_lines: JSON.stringify([
        { role: 'supplier', accountId: 'acct_supplier', amountCents: '4210' },
        { role: 'affiliate', accountId: 'acct_affiliate', amountCents: '3604' },
        { role: 'coproducer', accountId: 'acct_coproducer', amountCents: '360' },
        { role: 'manager', accountId: 'acct_manager', amountCents: '180' },
        { role: 'seller', accountId: 'acct_seller', amountCents: '656' },
      ]),
    },
    ...overrides,
  }) as StripePaymentIntent;

describe('StripeWebhookProcessor.processSaleSucceeded — happy path', () => {
  it('dispatches transfers for seller + every non-platform stakeholder and credits ledger for every known account', async () => {
    const stripe = makeStripeStub();
    const connect = makeConnectStub({
      acct_supplier: 'cab_supplier',
      acct_affiliate: 'cab_affiliate',
      acct_coproducer: 'cab_coproducer',
      acct_manager: 'cab_manager',
      acct_seller: 'cab_seller',
    });
    const ledger = makeLedgerStub();
    const processor = await buildProcessor(stripe, connect, ledger);

    const result = await processor.processSaleSucceeded(buildPaymentIntent(), matureAt);

    expect(result.transfersDispatched).toBe(5); // supplier + affiliate + coproducer + manager + seller
    expect(result.ledgerEntriesCreated).toBe(5); // all five balances
    expect(result.connectPostSale).toEqual({
      transferGroup: 'sale:order_xyz',
      sellerStripeAccountId: 'acct_seller',
      sellerDestinationAmountCents: 656n,
      transfers: [
        {
          role: 'supplier',
          accountId: 'acct_supplier',
          amountCents: 4_210n,
          stripeTransferId: 'tr_1',
        },
        {
          role: 'affiliate',
          accountId: 'acct_affiliate',
          amountCents: 3_604n,
          stripeTransferId: 'tr_2',
        },
        {
          role: 'coproducer',
          accountId: 'acct_coproducer',
          amountCents: 360n,
          stripeTransferId: 'tr_3',
        },
        {
          role: 'manager',
          accountId: 'acct_manager',
          amountCents: 180n,
          stripeTransferId: 'tr_4',
        },
      ],
    });
    expect(stripe.stripe.transfers.create).toHaveBeenCalledTimes(5);
    expect(ledger.creditPending).toHaveBeenCalledTimes(5);
  });

  it('passes idempotency key + source_transaction + transfer_group to each transfers.create call', async () => {
    const stripe = makeStripeStub();
    const connect = makeConnectStub({
      acct_supplier: 'cab_supplier',
      acct_seller: 'cab_seller',
    });
    const ledger = makeLedgerStub();
    const processor = await buildProcessor(stripe, connect, ledger);

    await processor.processSaleSucceeded(
      buildPaymentIntent({
        metadata: {
          type: 'sale',
          split_lines: JSON.stringify([
            { role: 'supplier', accountId: 'acct_supplier', amountCents: '4210' },
            { role: 'seller', accountId: 'acct_seller', amountCents: '5800' },
          ]),
        },
      }),
      matureAt,
    );

    expect(stripe.stripe.transfers.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        amount: 4_210,
        currency: 'brl',
        destination: 'acct_supplier',
        source_transaction: 'ch_sale_xyz',
        transfer_group: 'sale:order_xyz',
      }),
      { idempotencyKey: 'pi_sale_xyz:supplier' },
    );
    expect(stripe.stripe.transfers.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        amount: 5_800,
        currency: 'brl',
        destination: 'acct_seller',
        source_transaction: 'ch_sale_xyz',
        transfer_group: 'sale:order_xyz',
      }),
      { idempotencyKey: 'pi_sale_xyz:seller' },
    );
  });

  it('credits ledger with maturationAt resolved per role', async () => {
    const stripe = makeStripeStub();
    const connect = makeConnectStub({
      acct_supplier: 'cab_supplier',
      acct_affiliate: 'cab_affiliate',
      acct_seller: 'cab_seller',
    });
    const ledger = makeLedgerStub();
    const processor = await buildProcessor(stripe, connect, ledger);

    const matureFn = jest.fn((role: SplitRole) => {
      const days = role === 'seller' ? 30 : role === 'affiliate' ? 7 : 14;
      return new Date(`2026-05-${String(days).padStart(2, '0')}T00:00:00Z`);
    });

    await processor.processSaleSucceeded(
      buildPaymentIntent({
        metadata: {
          type: 'sale',
          split_lines: JSON.stringify([
            { role: 'supplier', accountId: 'acct_supplier', amountCents: '100' },
            { role: 'affiliate', accountId: 'acct_affiliate', amountCents: '200' },
            { role: 'seller', accountId: 'acct_seller', amountCents: '300' },
          ]),
        },
      }),
      matureFn,
    );

    expect(matureFn).toHaveBeenCalledWith('supplier');
    expect(matureFn).toHaveBeenCalledWith('affiliate');
    expect(matureFn).toHaveBeenCalledWith('seller');

    expect(ledger.creditPending).toHaveBeenCalledWith(
      expect.objectContaining({
        accountBalanceId: 'cab_seller',
        matureAt: new Date('2026-05-30T00:00:00Z'),
      }),
    );
  });
});

describe('StripeWebhookProcessor.processSaleSucceeded — short-circuits', () => {
  it('skips when metadata.type is not "sale"', async () => {
    const stripe = makeStripeStub();
    const connect = makeConnectStub({});
    const ledger = makeLedgerStub();
    const processor = await buildProcessor(stripe, connect, ledger);

    const result = await processor.processSaleSucceeded(
      buildPaymentIntent({ metadata: { type: 'wallet_topup' } }),
      matureAt,
    );

    expect(result.skippedReason).toBe('no_metadata');
    expect(stripe.stripe.transfers.create).not.toHaveBeenCalled();
    expect(ledger.creditPending).not.toHaveBeenCalled();
  });

  it('skips when split_lines metadata is missing', async () => {
    const stripe = makeStripeStub();
    const connect = makeConnectStub({});
    const ledger = makeLedgerStub();
    const processor = await buildProcessor(stripe, connect, ledger);

    const result = await processor.processSaleSucceeded(
      buildPaymentIntent({ metadata: { type: 'sale' } }),
      matureAt,
    );

    expect(result.skippedReason).toBe('no_lines');
    expect(stripe.stripe.transfers.create).not.toHaveBeenCalled();
  });

  it('skips when latest_charge is missing (cannot associate fan-out transfers to the source charge)', async () => {
    const stripe = makeStripeStub();
    const connect = makeConnectStub({ acct_supplier: 'cab_supplier' });
    const ledger = makeLedgerStub();
    const processor = await buildProcessor(stripe, connect, ledger);

    const result = await processor.processSaleSucceeded(
      buildPaymentIntent({
        latest_charge: null,
        metadata: {
          type: 'sale',
          split_lines: JSON.stringify([
            { role: 'supplier', accountId: 'acct_supplier', amountCents: '100' },
          ]),
        },
      }),
      matureAt,
    );

    expect(result.skippedReason).toBe('no_metadata');
  });

  it('throws when a split line references a Stripe account without local balance mapping', async () => {
    const stripe = makeStripeStub();
    const connect = makeConnectStub({
      acct_unknown: null,
      acct_seller: 'cab_seller',
    });
    const ledger = makeLedgerStub();
    const processor = await buildProcessor(stripe, connect, ledger);

    await expect(
      processor.processSaleSucceeded(
        buildPaymentIntent({
          metadata: {
            type: 'sale',
            split_lines: JSON.stringify([
              { role: 'affiliate', accountId: 'acct_unknown', amountCents: '500' },
              { role: 'seller', accountId: 'acct_seller', amountCents: '200' },
            ]),
          },
        }),
        matureAt,
      ),
    ).rejects.toThrow(
      'Missing local ConnectAccountBalance for stripeAccountId=acct_unknown role=affiliate paymentIntent=pi_sale_xyz',
    );

    expect(stripe.stripe.transfers.create).not.toHaveBeenCalled();
    expect(ledger.creditPending).not.toHaveBeenCalled();
  });

  it('skips zero-amount lines entirely', async () => {
    const stripe = makeStripeStub();
    const connect = makeConnectStub({ acct_seller: 'cab_seller' });
    const ledger = makeLedgerStub();
    const processor = await buildProcessor(stripe, connect, ledger);

    const result = await processor.processSaleSucceeded(
      buildPaymentIntent({
        metadata: {
          type: 'sale',
          split_lines: JSON.stringify([
            { role: 'manager', accountId: 'acct_manager', amountCents: '0' },
            { role: 'seller', accountId: 'acct_seller', amountCents: '500' },
          ]),
        },
      }),
      matureAt,
    );

    expect(result.transfersDispatched).toBe(1); // zero-amount manager skipped, seller transferred
    expect(result.ledgerEntriesCreated).toBe(1); // only seller
  });

  it('returns no_lines on malformed split_lines json', async () => {
    const stripe = makeStripeStub();
    const connect = makeConnectStub({});
    const ledger = makeLedgerStub();
    const processor = await buildProcessor(stripe, connect, ledger);

    const result = await processor.processSaleSucceeded(
      buildPaymentIntent({
        metadata: {
          type: 'sale',
          split_lines: 'not-json',
        },
      }),
      matureAt,
    );

    expect(result.skippedReason).toBe('no_lines');
  });
});
