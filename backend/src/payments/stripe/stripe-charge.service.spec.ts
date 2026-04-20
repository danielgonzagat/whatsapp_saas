import { Test, type TestingModule } from '@nestjs/testing';

import { StripeService } from '../../billing/stripe.service';

import { StripeChargeService } from './stripe-charge.service';
import type { CreateSaleChargeInput } from './stripe-charge.types';

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
  platformFeeCents: 990n,
  currency: 'BRL',
  idempotencyKey: 'order_123',
  buyerEmail: 'buyer@example.com',
  ...overrides,
});

describe('StripeChargeService.createSaleCharge', () => {
  it('creates a separate-charge PaymentIntent with seller settlement merchant on behalf_of', async () => {
    const stripe = makeStripeStub();
    stripe.stripe.paymentIntents.create.mockResolvedValue({
      id: 'pi_sale_1',
      client_secret: 'pi_sale_1_secret',
    });
    const service = await buildService(stripe);

    const result = await service.createSaleCharge(baseInput());

    expect(stripe.stripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 13_990,
        currency: 'brl',
        payment_method_types: ['card', 'boleto'],
        on_behalf_of: 'acct_seller',
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
    const callArgs = stripe.stripe.paymentIntents.create.mock.calls[0][0];
    expect(callArgs.transfer_data).toBeUndefined();

    expect(result.paymentIntentId).toBe('pi_sale_1');
    expect(result.applicationFeeCents).toBe(4_980n);
    expect(result.transferGroup).toBe('sale:order_123');
    expect(result.split.splits).toHaveLength(1);
    expect(result.split.splits[0]).toEqual(
      expect.objectContaining({ role: 'seller', amountCents: 9_010n }),
    );
  });

  it('emits split_lines metadata that round-trips the SplitEngine output', async () => {
    const stripe = makeStripeStub();
    stripe.stripe.paymentIntents.create.mockResolvedValue({ id: 'pi_split', client_secret: null });
    const service = await buildService(stripe);

    await service.createSaleCharge(
      baseInput({
        splitConfig: {
          supplier: { accountId: 'acct_supplier', amountCents: 4_210n },
          affiliate: { accountId: 'acct_affiliate', percentBp: 4_000 },
          coproducer: { accountId: 'acct_coproducer', percentBp: 400 },
          manager: { accountId: 'acct_manager', percentBp: 200 },
        },
      }),
    );

    const callArgs = stripe.stripe.paymentIntents.create.mock.calls[0][0];
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
    stripe.stripe.paymentIntents.create.mockResolvedValue({ id: 'pi_meta', client_secret: null });
    const service = await buildService(stripe);

    await service.createSaleCharge(
      baseInput({
        metadata: {
          campaign_id: 'camp_42',
          attribution_token: 'utm_xyz',
        },
      }),
    );

    const callArgs = stripe.stripe.paymentIntents.create.mock.calls[0][0];
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
    stripe.stripe.paymentIntents.create.mockResolvedValue({ id: 'pi_pmt', client_secret: null });
    const service = await buildService(stripe);

    await service.createSaleCharge(baseInput({ paymentMethodTypes: ['card', 'pix'] }));

    const callArgs = stripe.stripe.paymentIntents.create.mock.calls[0][0];
    expect(callArgs.payment_method_types).toEqual(['card', 'pix']);
  });

  it('forwards confirm + payment_method_data for server-confirmed pix flows', async () => {
    const stripe = makeStripeStub();
    stripe.stripe.paymentIntents.create.mockResolvedValue({
      id: 'pi_pix_confirmed',
      client_secret: 'pi_pix_confirmed_secret',
      status: 'requires_action',
      next_action: {
        type: 'pix_display_qr_code',
        pix_display_qr_code: {
          data: '000201pix',
          image_url_png: 'data:image/png;base64,qr',
        },
      },
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
    stripe.stripe.paymentIntents.create.mockResolvedValue({ id: 'pi_idem', client_secret: null });
    const service = await buildService(stripe);

    await service.createSaleCharge(baseInput({ idempotencyKey: 'order_idem_xyz' }));

    expect(stripe.stripe.paymentIntents.create).toHaveBeenCalledWith(expect.anything(), {
      idempotencyKey: 'sale:order_idem_xyz',
    });
  });

  it('lowercases the currency code before sending to Stripe', async () => {
    const stripe = makeStripeStub();
    stripe.stripe.paymentIntents.create.mockResolvedValue({ id: 'pi_cur', client_secret: null });
    const service = await buildService(stripe);

    await service.createSaleCharge(baseInput({ currency: 'BRL' }));

    const callArgs = stripe.stripe.paymentIntents.create.mock.calls[0][0];
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
});
