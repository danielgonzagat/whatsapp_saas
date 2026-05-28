import type { PrismaService } from '../prisma/prisma.service';

import { CheckoutPublicPayloadBuilder } from './checkout-public-payload.builder';

const ENV_KEYS = [
  'STRIPE_PUBLISHABLE_KEY',
  'MERCADOPAGO_ACCESS_TOKEN',
  'MERCADOPAGO_PUBLIC_KEY',
] as const;

type EnvKey = (typeof ENV_KEYS)[number];

function setEnv(key: EnvKey, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

function makePlan() {
  return {
    id: 'plan_1',
    name: 'Plano PDRN',
    slug: 'pdrn',
    referenceCode: 'PDRN1',
    product: { workspaceId: 'ws_1', name: 'PDRN' },
    checkoutConfig: {},
  };
}

function makeBuilder(sellerStripeAccountId: string | null = 'acct_seller_1') {
  const prisma = {
    workspace: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'ws_1',
        name: 'Workspace PDRN',
        customDomain: null,
        branding: null,
        fiscalData: null,
      }),
    },
    connectAccountBalance: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          sellerStripeAccountId ? { id: 'cab_1', stripeAccountId: sellerStripeAccountId } : null,
        ),
    },
  } as unknown as PrismaService;

  return new CheckoutPublicPayloadBuilder(prisma);
}

describe('CheckoutPublicPayloadBuilder payment provider rails', () => {
  const savedEnv = new Map<EnvKey, string | undefined>();

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      savedEnv.set(key, process.env[key]);
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      setEnv(key, savedEnv.get(key));
    }
    savedEnv.clear();
  });

  it('exposes card as Stripe and PIX/boleto as Mercado Pago when both rails are configured', async () => {
    setEnv('STRIPE_PUBLISHABLE_KEY', 'pk_live_card');
    setEnv('MERCADOPAGO_ACCESS_TOKEN', 'APP_USR-token');
    setEnv('MERCADOPAGO_PUBLIC_KEY', 'APP_USR-public');

    const payload = await makeBuilder().build(makePlan());

    expect(payload.paymentProvider).toMatchObject({
      provider: 'stripe',
      cardProvider: 'stripe',
      pixProvider: 'mercadopago',
      boletoProvider: 'mercadopago',
      checkoutEnabled: true,
      publicKey: 'pk_live_card',
      unavailableReason: null,
      availablePaymentMethodIds: ['card', 'pix', 'boleto'],
      availablePaymentMethodTypes: ['card', 'pix', 'boleto'],
      supportsCreditCard: true,
      supportsPix: true,
      supportsBoleto: true,
    });
  });

  it('keeps checkout enabled for Mercado Pago PIX/boleto without a Stripe public key', async () => {
    setEnv('STRIPE_PUBLISHABLE_KEY', undefined);
    setEnv('MERCADOPAGO_ACCESS_TOKEN', 'APP_USR-token');
    setEnv('MERCADOPAGO_PUBLIC_KEY', 'APP_USR-public');

    const payload = await makeBuilder(null).build(makePlan());

    expect(payload.paymentProvider).toMatchObject({
      connected: true,
      checkoutEnabled: true,
      publicKey: null,
      unavailableReason: null,
      availablePaymentMethodIds: ['pix', 'boleto'],
      availablePaymentMethodTypes: ['pix', 'boleto'],
      supportsCreditCard: false,
      supportsPix: true,
      supportsBoleto: true,
    });
  });
});
