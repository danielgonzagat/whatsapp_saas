import { ConfigService } from '@nestjs/config';
import { PaymentMethodService } from './payment-method.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * P6-10 — focused spec for PaymentMethodService.
 *
 * The Wave 1 hardening already validated several invariants of this
 * service (the `getOrCreateCustomerId` $transaction wrapper that
 * prevents duplicate Stripe customer creation, the UUID-based Stripe
 * idempotency key that replaced the time-bucket race). This spec
 * locks those invariants in as executable assertions so a future
 * refactor cannot silently regress them.
 *
 * Strategy:
 *   - Stripe is fully mocked. We DO NOT exercise the real SDK.
 *   - PrismaService and ConfigService are stubbed.
 *   - We assert OBSERVABLE behavior: which Stripe methods are called
 *     with which arguments, what is returned, and what errors are
 *     thrown when infrastructure is missing.
 */

function makePrisma() {
  return {
    workspace: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
}

function makeConfig(env: Record<string, string | undefined> = {}) {
  return {
    get: jest.fn((key: string) => env[key]),
  };
}

function attachStripe(service: PaymentMethodService, stripe: any) {
  // The constructor only instantiates Stripe when STRIPE_SECRET_KEY is
  // present in the config. To test the happy paths without exercising
  // the real SDK, replace the private field with a fake.
  (service as unknown as { stripe: any }).stripe = stripe;
}

describe('PaymentMethodService (P6-10)', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let config: ReturnType<typeof makeConfig>;
  let service: PaymentMethodService;
  let stripe: any;

  beforeEach(() => {
    prisma = makePrisma();
    config = makeConfig();
    service = new PaymentMethodService(prisma as any, config as unknown as ConfigService);
    stripe = {
      customers: { create: jest.fn(), retrieve: jest.fn(), update: jest.fn() },
      paymentMethods: {
        attach: jest.fn(),
        detach: jest.fn(),
        retrieve: jest.fn(),
        list: jest.fn(),
      },
      checkout: { sessions: { create: jest.fn() } },
    };
    attachStripe(service, stripe);
  });

  describe('getOrCreateCustomerId — Wave 1 P0-4 idempotency contract', () => {
    it('runs the read-then-create inside a $transaction at ReadCommitted', async () => {
      let isolationLevel: string | undefined;
      prisma.$transaction.mockImplementation(async (cb: any, opts: any) => {
        isolationLevel = opts?.isolationLevel;
        const tx = {
          workspace: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'ws-1',
              name: 'Workspace 1',
              stripeCustomerId: null,
            }),
            update: jest.fn().mockResolvedValue({}),
          },
        };
        return cb(tx);
      });
      stripe.customers.create.mockResolvedValue({ id: 'cus_new_123' });

      const result = await service.getOrCreateCustomerId('ws-1');

      expect(result).toBe('cus_new_123');
      expect(isolationLevel).toBe('ReadCommitted');
      expect(stripe.customers.create).toHaveBeenCalledTimes(1);
    });

    it('returns the existing stripeCustomerId without hitting Stripe', async () => {
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = {
          workspace: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'ws-1',
              name: 'Workspace 1',
              stripeCustomerId: 'cus_existing_456',
            }),
            update: jest.fn(),
          },
        };
        return cb(tx);
      });

      const result = await service.getOrCreateCustomerId('ws-1');

      expect(result).toBe('cus_existing_456');
      expect(stripe.customers.create).not.toHaveBeenCalled();
    });

    it('throws when the workspace does not exist', async () => {
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = {
          workspace: {
            findUnique: jest.fn().mockResolvedValue(null),
            update: jest.fn(),
          },
        };
        return cb(tx);
      });

      await expect(service.getOrCreateCustomerId('missing')).rejects.toThrow(
        /Workspace n.o encontrado/,
      );
    });

    it('throws "Infraestrutura de cobrança indisponível" when Stripe is not configured', async () => {
      attachStripe(service, null);
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = {
          workspace: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'ws-1',
              name: 'Workspace 1',
              stripeCustomerId: null,
            }),
            update: jest.fn(),
          },
        };
        return cb(tx);
      });

      await expect(service.getOrCreateCustomerId('ws-1')).rejects.toThrow(
        /Infraestrutura de cobran.a indispon.vel/,
      );
    });

    it('persists the new stripeCustomerId on the workspace before returning', async () => {
      const update = jest.fn().mockResolvedValue({});
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = {
          workspace: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'ws-1',
              name: 'Workspace 1',
              stripeCustomerId: null,
            }),
            update,
          },
        };
        return cb(tx);
      });
      stripe.customers.create.mockResolvedValue({ id: 'cus_xyz' });

      await service.getOrCreateCustomerId('ws-1');

      expect(update).toHaveBeenCalledWith({
        where: { id: 'ws-1' },
        data: { stripeCustomerId: 'cus_xyz' },
      });
    });
  });

  describe('createSetupIntent — Wave 1 P0-4 UUID idempotency key', () => {
    beforeEach(() => {
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = {
          workspace: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'ws-1',
              name: 'Workspace 1',
              stripeCustomerId: 'cus_existing',
            }),
            update: jest.fn(),
          },
        };
        return cb(tx);
      });
      stripe.checkout.sessions.create.mockResolvedValue({
        url: 'https://checkout.stripe.com/c/sess_x',
      });
    });

    it('forwards a UUID-suffixed idempotency key to Stripe (no time-bucket race)', async () => {
      await service.createSetupIntent('ws-1');

      expect(stripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
      const optionsArg = stripe.checkout.sessions.create.mock.calls[0][1];
      // Wave 1 P0-4 — idempotencyKey must NOT contain a time bucket like
      // Math.floor(Date.now() / 60000). It must be a UUID-suffixed string.
      expect(optionsArg.idempotencyKey).toMatch(
        /^setup-intent:ws-1:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('uses two distinct idempotency keys for two consecutive calls', async () => {
      await service.createSetupIntent('ws-1');
      await service.createSetupIntent('ws-1');

      const firstKey = stripe.checkout.sessions.create.mock.calls[0][1].idempotencyKey;
      const secondKey = stripe.checkout.sessions.create.mock.calls[1][1].idempotencyKey;
      expect(firstKey).not.toBe(secondKey);
    });

    it('uses the configured FRONTEND_URL as base for success/cancel URLs', async () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'FRONTEND_URL') return 'https://app.example.com/billing';
        return undefined;
      });

      await service.createSetupIntent('ws-1');

      const sessionArgs = stripe.checkout.sessions.create.mock.calls[0][0];
      expect(sessionArgs.success_url).toContain('https://app.example.com/billing');
      expect(sessionArgs.cancel_url).toContain('https://app.example.com/billing');
      expect(sessionArgs.success_url).toContain('setup=success');
      expect(sessionArgs.cancel_url).toContain('setup=canceled');
    });

    it('throws when Stripe is not configured', async () => {
      attachStripe(service, null);
      await expect(service.createSetupIntent('ws-1')).rejects.toThrow(
        /Infraestrutura de cobran.a indispon.vel/,
      );
    });

    it('returns { url, customerId }', async () => {
      const result = await service.createSetupIntent('ws-1');

      expect(result.url).toBe('https://checkout.stripe.com/c/sess_x');
      expect(result.customerId).toBe('cus_existing');
    });
  });

  describe('listPaymentMethods — graceful degradation', () => {
    it('returns an empty list when Stripe is not configured', async () => {
      attachStripe(service, null);

      const result = await service.listPaymentMethods('ws-1');

      expect(result).toEqual({ paymentMethods: [] });
    });
  });
});
