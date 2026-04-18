import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { STRIPE_API_VERSION } from './stripe.constants';
import { StripeService } from './stripe.service';

const buildModule = async (env: Record<string, string | undefined>): Promise<TestingModule> => {
  return Test.createTestingModule({
    providers: [
      StripeService,
      {
        provide: ConfigService,
        useValue: {
          get: <T>(key: string): T | undefined => env[key] as T | undefined,
        },
      },
    ],
  }).compile();
};

describe('StripeService', () => {
  describe('configuration guards', () => {
    it('throws when STRIPE_SECRET_KEY is missing', async () => {
      const moduleRef = await buildModule({});
      const service = moduleRef.get(StripeService);

      expect(() => service.stripe).toThrow(/STRIPE_SECRET_KEY is not configured/);
    });

    it('instantiates the SDK when STRIPE_SECRET_KEY is provided', async () => {
      const moduleRef = await buildModule({ STRIPE_SECRET_KEY: 'sk_test_dummy_for_unit_test' });
      const service = moduleRef.get(StripeService);

      const client = service.stripe;
      expect(client).toBeDefined();
      expect(client.getApiField('version')).toBe(STRIPE_API_VERSION);
    });

    it('reuses the same SDK instance across calls (lazy singleton)', async () => {
      const moduleRef = await buildModule({ STRIPE_SECRET_KEY: 'sk_test_dummy_for_unit_test' });
      const service = moduleRef.get(StripeService);

      expect(service.stripe).toBe(service.stripe);
    });
  });

  describe('liveness probe (real network call)', () => {
    const realKey = process.env.STRIPE_SECRET_KEY;
    const isUsableTestKey =
      typeof realKey === 'string' &&
      (realKey.startsWith('sk_test_') || realKey.startsWith('rk_test_'));

    const maybeIt = isUsableTestKey ? it : it.skip;

    maybeIt(
      'retrieveBalance() succeeds against Stripe test mode',
      async () => {
        const moduleRef = await buildModule({ STRIPE_SECRET_KEY: realKey });
        const service = moduleRef.get(StripeService);

        const balance = await service.retrieveBalance();
        expect(balance.object).toBe('balance');
        expect(balance.livemode).toBe(false);
      },
      15_000,
    );
  });
});
