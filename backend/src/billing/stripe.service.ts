import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredLogger } from '../logging/structured-logger';

import { STRIPE_API_VERSION } from './stripe.constants';
import { StripeRuntime } from './stripe-runtime';
import type { StripeBalance, StripeClient } from './stripe-types';

/**
 * Single source for the Stripe SDK instance used by every consumer in the
 * backend (billing, payments, webhooks, wallet, connect). Centralizes
 * apiVersion pinning, key validation, and lazy instantiation so individual
 * services never call `new Stripe(...)` directly.
 *
 * Per ADR 0003: live keys must never appear in test/dev. The launcher and
 * env loader enforce sk_test_* in development; this service treats any
 * provided value as opaque and only verifies prefix sanity in logs.
 */
@Injectable()
export class StripeService {
  private readonly logger = StructuredLogger.from(StripeService.name);
  private client: StripeClient | null = null;

  constructor(private readonly config: ConfigService) {}

  private resolveEnv(name: string): string | undefined {
    return this.config.get<string>(name) ?? process.env[name];
  }

  /**
   * Production must never run on a test-mode key: charges would silently
   * succeed against Stripe's sandbox and no real money would move (issue
   * #412). Fires on NODE_ENV=production OR RAILWAY_ENVIRONMENT=production so
   * a misconfigured NODE_ENV on Railway cannot mask the problem. Throwing
   * here (instead of at app bootstrap) blocks every payment-touching code
   * path with a clear message while keeping the rest of the app alive, and
   * because the client is never cached on failure the structured
   * `stripe_test_key_in_production` error re-fires on every attempt —
   * a persistent alarm until the live key is swapped in (operational).
   */
  private assertTestKeyNotInProduction(secretKey: string): void {
    if (!secretKey.startsWith('sk_test_')) {
      return;
    }

    const nodeEnv = this.resolveEnv('NODE_ENV');
    const railwayEnv = this.resolveEnv('RAILWAY_ENVIRONMENT');
    if (nodeEnv !== 'production' && railwayEnv !== 'production') {
      return;
    }

    this.logger.error('stripe_test_key_in_production', {
      event: 'stripe_test_key_in_production',
      nodeEnv,
      railwayEnv,
      keyPrefix: 'sk_test_',
    });
    throw new Error(
      'STRIPE_SECRET_KEY is a test-mode key (sk_test_*) while running in production — ' +
        'real charges are blocked. Swap STRIPE_SECRET_KEY to the live key (sk_live_*) ' +
        'in the production environment (operational action).',
    );
  }

  private assertLiveModeGuard(secretKey: string): void {
    if (!secretKey.startsWith('sk_live_')) {
      return;
    }

    const nodeEnv = this.config.get<string>('NODE_ENV') ?? process.env.NODE_ENV;
    const liveMode = this.config.get<string>('KLOEL_LIVE_MODE') ?? process.env.KLOEL_LIVE_MODE;
    if (nodeEnv !== 'production' || liveMode !== 'confirmed') {
      throw new Error(
        'Refusing to initialize Stripe with sk_live_* unless NODE_ENV=production and KLOEL_LIVE_MODE=confirmed.',
      );
    }
  }

  /**
   * Returns the Stripe client. Throws if STRIPE_SECRET_KEY is missing — every
   * payment-touching code path assumes a working client and silently degrading
   * would mask configuration errors that must surface immediately.
   */
  get stripe(): StripeClient {
    if (this.client) {
      return this.client;
    }

    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      throw new Error(
        'STRIPE_SECRET_KEY is not configured. Set it in env (sk_test_* in dev, sk_live_* only in production).',
      );
    }
    this.assertTestKeyNotInProduction(secretKey);
    this.assertLiveModeGuard(secretKey);

    this.client = new StripeRuntime(secretKey, {
      apiVersion: STRIPE_API_VERSION,
      appInfo: {
        name: 'kloel-backend',
        url: 'https://kloel.com',
      },
      maxNetworkRetries: 2,
      timeout: 30_000,
    });

    const mode = secretKey.startsWith('sk_live_') ? 'LIVE' : 'TEST';
    this.logger.log(`Stripe SDK ready (apiVersion=${STRIPE_API_VERSION}, mode=${mode})`);
    return this.client;
  }

  /**
   * Lightweight liveness probe. Used by the smoke spec and by health checks.
   * Returns the available balance (zero is a valid response — empty accounts
   * still authenticate successfully).
   */
  async retrieveBalance(): Promise<StripeBalance> {
    return this.stripe.balance.retrieve();
  }
}
