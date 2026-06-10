import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { StructuredLogger } from '../logging/structured-logger';
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

    it('rejects live Stripe keys outside production', async () => {
      const moduleRef = await buildModule({
        STRIPE_SECRET_KEY: 'sk_live_dummy_for_unit_test',
        NODE_ENV: 'development',
      });
      const service = moduleRef.get(StripeService);

      expect(() => service.stripe).toThrow(/NODE_ENV=production and KLOEL_LIVE_MODE=confirmed/);
    });

    it('rejects live Stripe keys in production until KLOEL_LIVE_MODE is confirmed', async () => {
      const moduleRef = await buildModule({
        STRIPE_SECRET_KEY: 'sk_live_dummy_for_unit_test',
        NODE_ENV: 'production',
      });
      const service = moduleRef.get(StripeService);

      expect(() => service.stripe).toThrow(/NODE_ENV=production and KLOEL_LIVE_MODE=confirmed/);
    });

    it('allows live Stripe keys only when production mode is explicitly confirmed', async () => {
      const moduleRef = await buildModule({
        STRIPE_SECRET_KEY: 'sk_live_dummy_for_unit_test',
        NODE_ENV: 'production',
        KLOEL_LIVE_MODE: 'confirmed',
      });
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

  describe('test-key-in-production guard (issue #412)', () => {
    const savedRailwayEnv = process.env.RAILWAY_ENVIRONMENT;
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
      // Hermetic: a CI runner exporting RAILWAY_ENVIRONMENT must not leak
      // into the process.env fallback used by the guard.
      delete process.env.RAILWAY_ENVIRONMENT;
      errorSpy = jest.spyOn(StructuredLogger.prototype, 'error');
    });

    afterEach(() => {
      errorSpy.mockRestore();
      if (savedRailwayEnv === undefined) {
        delete process.env.RAILWAY_ENVIRONMENT;
      } else {
        process.env.RAILWAY_ENVIRONMENT = savedRailwayEnv;
      }
    });

    it('blocks sk_test_* keys when NODE_ENV=production and logs stripe_test_key_in_production', async () => {
      const moduleRef = await buildModule({
        STRIPE_SECRET_KEY: 'sk_test_dummy_for_unit_test',
        NODE_ENV: 'production',
      });
      const service = moduleRef.get(StripeService);

      expect(() => service.stripe).toThrow(/test-mode key \(sk_test_\*\).*real charges are blocked/s);
      expect(errorSpy).toHaveBeenCalledWith(
        'stripe_test_key_in_production',
        expect.objectContaining({ event: 'stripe_test_key_in_production' }),
      );
    });

    it('blocks sk_test_* keys when RAILWAY_ENVIRONMENT=production even if NODE_ENV is not production', async () => {
      const moduleRef = await buildModule({
        STRIPE_SECRET_KEY: 'sk_test_dummy_for_unit_test',
        NODE_ENV: 'development',
        RAILWAY_ENVIRONMENT: 'production',
      });
      const service = moduleRef.get(StripeService);

      expect(() => service.stripe).toThrow(/real charges are blocked/);
      expect(errorSpy).toHaveBeenCalledWith(
        'stripe_test_key_in_production',
        expect.objectContaining({ event: 'stripe_test_key_in_production' }),
      );
    });

    it('re-fires the alarm on every access while misconfigured (no client caching on failure)', async () => {
      const moduleRef = await buildModule({
        STRIPE_SECRET_KEY: 'sk_test_dummy_for_unit_test',
        NODE_ENV: 'production',
      });
      const service = moduleRef.get(StripeService);

      expect(() => service.stripe).toThrow(/real charges are blocked/);
      expect(() => service.stripe).toThrow(/real charges are blocked/);
      expect(errorSpy).toHaveBeenCalledTimes(2);
    });

    it('stays silent for sk_test_* keys outside production (dev)', async () => {
      const moduleRef = await buildModule({
        STRIPE_SECRET_KEY: 'sk_test_dummy_for_unit_test',
        NODE_ENV: 'development',
      });
      const service = moduleRef.get(StripeService);

      expect(service.stripe).toBeDefined();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('stays silent for sk_live_* keys in confirmed production', async () => {
      const moduleRef = await buildModule({
        STRIPE_SECRET_KEY: 'sk_live_dummy_for_unit_test',
        NODE_ENV: 'production',
        KLOEL_LIVE_MODE: 'confirmed',
      });
      const service = moduleRef.get(StripeService);

      expect(service.stripe).toBeDefined();
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe('liveness probe (real network call)', () => {
    const realKey = process.env.STRIPE_SECRET_KEY;

    it('does not require a real Stripe key for the unit test gate', () => {
      if (!realKey) {
        expect(realKey).toBeUndefined();
        return;
      }

      expect(realKey).toMatch(/^(sk_test_|rk_test_)/);
    });

    if (realKey?.match(/^(sk_test_|rk_test_)/)) {
      it('retrieveBalance() succeeds against Stripe test mode', async () => {
        const moduleRef = await buildModule({ STRIPE_SECRET_KEY: realKey });
        const service = moduleRef.get(StripeService);

        const balance = await service.retrieveBalance();
        expect(balance.object).toBe('balance');
        expect(balance.livemode).toBe(false);
      }, 15_000);
    }
  });
});
