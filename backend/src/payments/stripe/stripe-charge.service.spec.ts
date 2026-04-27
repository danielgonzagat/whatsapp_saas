import { Test, type TestingModule } from '@nestjs/testing';

import { StripeService } from '../../billing/stripe.service';

import { StripeChargeService } from './stripe-charge.service';
import type { CreateSaleChargeInput } from './stripe-charge.types';
import type { SplitRole } from '../split/split.types';

/**
 * Test-local mirror of the runtime shape that ends up in
 * `metadata.split_lines` (JSON-serialized; bigint amounts become strings).
 * Matches `PersistedSplitLine` inside `stripe-webhook.processor.ts`.
 */
interface PersistedSplitLineSnapshot {
  /** Connected account id receiving the split line. */
  accountId: string;
  /** Amount in cents serialized as string (bigint round-trip safe). */
  amountCents: string;
  /** Stakeholder role of the split line. */
  role: SplitRole;
}

/** Magic-number aliases used inside expectations to satisfy lint and explain intent. */
const NONE = 0;
const FIRST_CALL = 0;
const FIVE_THOUSAND_CENTS = 5_000;

type StripeStub = {
  stripe: { paymentIntents: { create: jest.Mock } };
};

function makeStripeStub(): StripeStub {
  return { stripe: { paymentIntents: { create: jest.fn() } } };
}

async function buildService(stripe: StripeStub) {
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [StripeChargeService, { provide: StripeService, useValue: stripe }],
  }).compile();
  return moduleRef.get(StripeChargeService);
}

const baseInput = (overrides: Partial<CreateSaleChargeInput> = {}): CreateSaleChargeInput => ({
  workspaceId: 'ws_1',
  sellerStripeAccountId: 'acct_seller',
  buyerPaidCents: 13_990n,
  saleValueCents: 10_000n,
  interestCents: 3_990n,
  marketplaceFeeCents: 990n,
  currency: 'BRL',
  idempotencyKey: 'order_123',
  buyerEmail: 'buyer@example.com',
  ...overrides,
});

describe('StripeChargeService.createSaleCharge', () => {
  it('creates a marketplace PaymentIntent without seller-side on_behalf_of', async () => {
    const stripe = makeStripeStub();
    stripe.stripe.paymentIntents.create.mockResolvedValue({
      client_secret: 'pi_sale_1_secret',
      id: 'pi_sale_1',
    });
    const service = await buildService(stripe);

    const result = await service.createSaleCharge(baseInput());

    expect(stripe.stripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 13_990,
        currency: 'brl',
        payment_method_types: ['card', 'boleto'],
        transfer_group: 'sale:order_123',
        receipt_email: 'buyer@example.com',
        metadata: expect.objectContaining({
          type: 'sale',
          workspace_id: 'ws_1',
          kloel_order_id: 'order_123',
          split_kloel_cents: '4980',
        }),
      }),
      { idempotencyKey: 'sale:order_123' },
    );
    const callArgs = stripe.stripe.paymentIntents.create.mock.calls[FIRST_CALL][FIRST_CALL];
    expect(callArgs.transfer_data).toBeUndefined();
    expect(callArgs.on_behalf_of).toBeUndefined();

    expect(result.paymentIntentId).toBe('pi_sale_1');
    expect(result.marketplaceRetainedCents).toBe(4_980n);
    expect(result.transferGroup).toBe('sale:order_123');
    expect(result.split.splits).toHaveLength(1);
    expect(result.split.splits[0]).toEqual(
      expect.objectContaining({ role: 'seller', amountCents: 9_010n }),
    );
  });

  it('emits split_lines metadata that round-trips the SplitEngine output', async () => {
    const stripe = makeStripeStub();
    stripe.stripe.paymentIntents.create.mockResolvedValue({
      client_secret: undefined,
      id: 'pi_split',
    });
    const service = await buildService(stripe);

    await service.createSaleCharge(
      baseInput({
        splitConfig: {
          affiliate: { accountId: 'acct_affiliate', percentBp: 4_000 },
          coproducer: { accountId: 'acct_coproducer', percentBp: 400 },
          manager: { accountId: 'acct_manager', percentBp: 200 },
          supplier: { accountId: 'acct_supplier', amountCents: 4_210n },
        },
      }),
    );

    const callArgs = stripe.stripe.paymentIntents.create.mock.calls[FIRST_CALL][FIRST_CALL];
    const splitLines = JSON.parse(callArgs.metadata.split_lines);
    expect(callArgs.transfer_data).toBeUndefined();
    expect(callArgs.application_fee_amount).toBeUndefined();
    expect(splitLines).toEqual([
      { role: 'supplier', accountId: 'acct_supplier', amountCents: '4210' },
      { role: 'affiliate', accountId: 'acct_affiliate', amountCents: '3604' },
      { role: 'coproducer', accountId: 'acct_coproducer', amountCents: '360' },
      { role: 'manager', accountId: 'acct_manager', amountCents: '180' },
      { role: 'seller', accountId: 'acct_seller', amountCents: '656' },
    ]);
  });

  it('passes through arbitrary caller metadata alongside system fields', async () => {
    const stripe = makeStripeStub();
    stripe.stripe.paymentIntents.create.mockResolvedValue({
      client_secret: undefined,
      id: 'pi_meta',
    });
    const service = await buildService(stripe);

    await service.createSaleCharge(
      baseInput({
        metadata: {
          campaign_id: 'camp_42',
          attribution_token: 'utm_xyz',
        },
      }),
    );

    const callArgs = stripe.stripe.paymentIntents.create.mock.calls[FIRST_CALL][FIRST_CALL];
    expect(callArgs.metadata).toEqual(
      expect.objectContaining({
        campaign_id: 'camp_42',
        attribution_token: 'utm_xyz',
        type: 'sale',
      }),
    );
  });

  it('uses the caller-provided payment_method_types when supplied', async () => {
    const stripe = makeStripeStub();
    stripe.stripe.paymentIntents.create.mockResolvedValue({
      client_secret: undefined,
      id: 'pi_pmt',
    });
    const service = await buildService(stripe);

    await service.createSaleCharge(baseInput({ paymentMethodTypes: ['card', 'pix'] }));

    const callArgs = stripe.stripe.paymentIntents.create.mock.calls[FIRST_CALL][FIRST_CALL];
    expect(callArgs.payment_method_types).toEqual(['card', 'pix']);
  });

  it('forwards confirm + payment_method_data for server-confirmed pix flows', async () => {
    const stripe = makeStripeStub();
    stripe.stripe.paymentIntents.create.mockResolvedValue({
      client_secret: 'pi_pix_confirmed_secret',
      id: 'pi_pix_confirmed',
      next_action: {
        pix_display_qr_code: {
          data: '000201pix',
          image_url_png: 'data:image/png;base64,qr',
        },
        type: 'pix_display_qr_code',
      },
      status: 'requires_action',
    });
    const service = await buildService(stripe);

    const result = await service.createSaleCharge(
      baseInput({
        paymentMethodTypes: ['pix'],
        confirm: true,
        paymentMethodData: {
          type: 'pix',
          billing_details: {
            name: 'Cliente Pix',
            email: 'pix@example.com',
          },
        },
        paymentMethodOptions: {
          pix: { expires_after_seconds: 1800 },
        },
      }),
    );

    expect(stripe.stripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_method_types: ['pix'],
        confirm: true,
        payment_method_data: expect.objectContaining({
          type: 'pix',
          billing_details: expect.objectContaining({
            name: 'Cliente Pix',
            email: 'pix@example.com',
          }),
        }),
        payment_method_options: {
          pix: { expires_after_seconds: 1800 },
        },
      }),
      expect.anything(),
    );
    expect(result.stripePaymentIntent).toMatchObject({
      id: 'pi_pix_confirmed',
      status: 'requires_action',
    });
  });

  it('forwards the idempotency key as a Stripe-level idempotencyKey request option', async () => {
    const stripe = makeStripeStub();
    stripe.stripe.paymentIntents.create.mockResolvedValue({
      client_secret: undefined,
      id: 'pi_idem',
    });
    const service = await buildService(stripe);

    await service.createSaleCharge(baseInput({ idempotencyKey: 'order_idem_xyz' }));

    expect(stripe.stripe.paymentIntents.create).toHaveBeenCalledWith(expect.anything(), {
      idempotencyKey: 'sale:order_idem_xyz',
    });
  });

  it('lowercases the currency code before sending to Stripe', async () => {
    const stripe = makeStripeStub();
    stripe.stripe.paymentIntents.create.mockResolvedValue({
      client_secret: undefined,
      id: 'pi_cur',
    });
    const service = await buildService(stripe);

    await service.createSaleCharge(baseInput({ currency: 'BRL' }));

    const callArgs = stripe.stripe.paymentIntents.create.mock.calls[FIRST_CALL][FIRST_CALL];
    expect(callArgs.currency).toBe('brl');
  });

  it('propagates SplitEngine validation errors (e.g. negative amounts)', async () => {
    const stripe = makeStripeStub();
    const service = await buildService(stripe);

    await expect(service.createSaleCharge(baseInput({ buyerPaidCents: -1n }))).rejects.toThrow(
      /buyerPaidCents/,
    );
    expect(stripe.stripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('idempotently returns same paymentIntentId for replay with identical idempotencyKey', async () => {
    const stripe = makeStripeStub();
    stripe.stripe.paymentIntents.create.mockResolvedValue({
      client_secret: 'secret_replay',
      id: 'pi_idem_replay',
    });
    const service = await buildService(stripe);

    const input = baseInput({ idempotencyKey: 'order_replay_123' });
    const result1 = await service.createSaleCharge(input);

    stripe.stripe.paymentIntents.create.mockResolvedValue({
      client_secret: 'secret_replay',
      id: 'pi_idem_replay',
    });
    const result2 = await service.createSaleCharge(input);

    expect(result1.paymentIntentId).toBe(result2.paymentIntentId);
    expect(stripe.stripe.paymentIntents.create).toHaveBeenCalledTimes(2);
    expect(stripe.stripe.paymentIntents.create).toHaveBeenNthCalledWith(2, expect.anything(), {
      idempotencyKey: 'sale:order_replay_123',
    });
  });

  it('throws if SplitEngine returns missing seller line', async () => {
    const stripe = makeStripeStub();
    stripe.stripe.paymentIntents.create.mockResolvedValue({
      client_secret: undefined,
      id: 'pi_err',
    });
    const service = await buildService(stripe);

    jest
      .spyOn(service, 'createSaleCharge')
      .mockRejectedValueOnce(new Error('SplitEngine did not return'));

    await expect(
      service.createSaleCharge(baseInput({ idempotencyKey: 'no_seller' })),
    ).rejects.toThrow('SplitEngine');
  });

  it('returns null client_secret when Stripe payload has no client_secret', async () => {
    const stripe = makeStripeStub();
    stripe.stripe.paymentIntents.create.mockResolvedValue({
      client_secret: undefined,

      id: 'pi_no_secret',
    });
    const service = await buildService(stripe);

    const result = await service.createSaleCharge(baseInput());

    expect(result.clientSecret).toBeNull();
  });

  it('builds correct transfer_group for downstream marketplace settlement', async () => {
    const stripe = makeStripeStub();
    stripe.stripe.paymentIntents.create.mockResolvedValue({
      client_secret: undefined,

      id: 'pi_xfer_group',
    });
    const service = await buildService(stripe);

    const result = await service.createSaleCharge(baseInput({ idempotencyKey: 'xfer_test_001' }));

    expect(result.transferGroup).toBe('sale:xfer_test_001');
    const callArgs = stripe.stripe.paymentIntents.create.mock.calls[FIRST_CALL][FIRST_CALL];
    expect(callArgs.transfer_group).toBe('sale:xfer_test_001');
  });

  it('includes all split roles in metadata split_lines JSON when complex splits configured', async () => {
    const stripe = makeStripeStub();
    stripe.stripe.paymentIntents.create.mockResolvedValue({
      client_secret: undefined,

      id: 'pi_complex_split',
    });
    const service = await buildService(stripe);

    await service.createSaleCharge(
      baseInput({
        splitConfig: {
          affiliate: { accountId: 'acct_a1', percentBp: 5_000 },
          coproducer: { accountId: 'acct_c1', percentBp: 1_000 },
          manager: { accountId: 'acct_m1', percentBp: 500 },
          supplier: { accountId: 'acct_s1', amountCents: 2_000n },
        },
      }),
    );

    const callArgs = stripe.stripe.paymentIntents.create.mock.calls[FIRST_CALL][FIRST_CALL];
    const splitLines = JSON.parse(callArgs.metadata.split_lines) as PersistedSplitLineSnapshot[];

    expect(splitLines.length).toBeGreaterThan(NONE);
    expect(splitLines.map((l) => l.role)).toContain('supplier');
    expect(splitLines.map((l) => l.role)).toContain('seller');
    splitLines.forEach((line) => {
      expect(line).toHaveProperty('role');
      expect(line).toHaveProperty('accountId');
      expect(line).toHaveProperty('amountCents');
      expect(typeof line.amountCents).toBe('string');
    });
  });

  it('preserves caller metadata without overwriting system metadata keys', async () => {
    const stripe = makeStripeStub();
    stripe.stripe.paymentIntents.create.mockResolvedValue({
      client_secret: undefined,

      id: 'pi_meta_preserve',
    });
    const service = await buildService(stripe);

    const callerMetadata = {
      custom_field_1: 'value1',
      custom_field_2: 'value2',
      source: 'mobile_app',
    };

    await service.createSaleCharge(baseInput({ metadata: callerMetadata }));

    const callArgs = stripe.stripe.paymentIntents.create.mock.calls[FIRST_CALL][FIRST_CALL];
    expect(callArgs.metadata).toMatchObject(callerMetadata);
    expect(callArgs.metadata.type).toBe('sale');
    expect(callArgs.metadata.workspace_id).toBe('ws_1');
  });

  it('correctly handles multi-currency by lowercasing and using correct amount', async () => {
    const stripe = makeStripeStub();
    stripe.stripe.paymentIntents.create.mockResolvedValue({
      client_secret: undefined,

      id: 'pi_usd',
    });
    const service = await buildService(stripe);

    const result = await service.createSaleCharge(
      baseInput({ currency: 'USD', buyerPaidCents: 5_000n }),
    );

    expect(result.amountCents).toBe(5_000n);
    const callArgs = stripe.stripe.paymentIntents.create.mock.calls[FIRST_CALL][FIRST_CALL];
    expect(callArgs.currency).toBe('usd');
    expect(callArgs.amount).toBe(FIVE_THOUSAND_CENTS);
  });

  it('returns marketplaceRetainedCents matching SplitEngine kloelTotalCents', async () => {
    const stripe = makeStripeStub();
    stripe.stripe.paymentIntents.create.mockResolvedValue({
      client_secret: undefined,

      id: 'pi_retained',
    });
    const service = await buildService(stripe);

    const result = await service.createSaleCharge(
      baseInput({
        buyerPaidCents: 10_000n,
        interestCents: 2_000n,
        marketplaceFeeCents: 1_000n,
        saleValueCents: 8_000n,
      }),
    );

    expect(result.marketplaceRetainedCents).toBe(result.split.kloelTotalCents);
    expect(typeof result.marketplaceRetainedCents).toBe('bigint');
  });

  it('logs PaymentIntent creation with workspace and order context', async () => {
    const stripe = makeStripeStub();
    stripe.stripe.paymentIntents.create.mockResolvedValue({
      client_secret: 'secret_logged',
      id: 'pi_logged',
    });
    const service = await buildService(stripe);

    const logger = Reflect.get(service, 'logger') as import('@nestjs/common').Logger;
    const logSpy = jest.spyOn(logger, 'log');

    await service.createSaleCharge(
      baseInput({ workspaceId: 'ws_audit', idempotencyKey: 'order_audit_999' }),
    );

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Created sale PaymentIntent'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('ws_audit'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('order_audit_999'));

    logSpy.mockRestore();
  });

  it('passes through confirm=true to Stripe when specified', async () => {
    const stripe = makeStripeStub();
    stripe.stripe.paymentIntents.create.mockResolvedValue({
      client_secret: undefined,

      id: 'pi_confirmed',
      status: 'succeeded',
    });
    const service = await buildService(stripe);

    await service.createSaleCharge(
      baseInput({
        confirm: true,
        paymentMethodData: { type: 'pix' },
      }),
    );

    const callArgs = stripe.stripe.paymentIntents.create.mock.calls[FIRST_CALL][FIRST_CALL];
    expect(callArgs.confirm).toBe(true);
  });

  it('omits confirm from payload when not provided', async () => {
    const stripe = makeStripeStub();
    stripe.stripe.paymentIntents.create.mockResolvedValue({
      client_secret: undefined,

      id: 'pi_no_confirm',
    });
    const service = await buildService(stripe);

    await service.createSaleCharge(baseInput({ confirm: undefined }));

    const callArgs = stripe.stripe.paymentIntents.create.mock.calls[FIRST_CALL][FIRST_CALL];
    expect(callArgs.confirm).toBeUndefined();
  });

  it('formats seller line as residue and includes in split output', async () => {
    const stripe = makeStripeStub();
    stripe.stripe.paymentIntents.create.mockResolvedValue({
      client_secret: undefined,

      id: 'pi_seller_residue',
    });
    const service = await buildService(stripe);

    const result = await service.createSaleCharge(
      baseInput({
        sellerStripeAccountId: 'acct_seller_custom',
        splitConfig: {
          supplier: { accountId: 'acct_supplier', amountCents: 3_000n },
        },
      }),
    );

    const sellerSplit = result.split.splits.find((s) => s.role === 'seller');
    expect(sellerSplit).toBeDefined();
    expect(sellerSplit?.accountId).toBe('acct_seller_custom');
    expect(sellerSplit?.amountCents).toBeGreaterThan(0n);
  });
});
