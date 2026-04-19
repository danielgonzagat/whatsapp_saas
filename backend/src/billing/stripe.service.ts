import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
  private readonly logger = new Logger(StripeService.name);
  private client: StripeClient | null = null;

  constructor(private readonly config: ConfigService) {}

  /**
   * Returns the Stripe client. Throws if STRIPE_SECRET_KEY is missing — every
   * payment-touching code path assumes a working client and silently degrading
   * would mask configuration errors that must surface immediately.
   */
  get stripe(): StripeClient {
    if (this.client) return this.client;

    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      throw new Error(
        'STRIPE_SECRET_KEY is not configured. Set it in env (sk_test_* in dev, sk_live_* only in production).',
      );
    }

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
