import { Injectable } from '@nestjs/common';

import type {
  PaymentMethod,
  ProviderRoutingDecision,
  ProviderRoutingInput,
} from './provider-router.types';

/**
 * Picks the canonical payment provider for a given method.
 *
 * Per ADR-0009:
 *   method='pix'   → mercadopago
 *   method='card'  → stripe
 *   method='boleto' → mercadopago (kept for legacy, MP handles it)
 *
 * This is the only place in the codebase that maps method → provider.
 * Adding a new method or splitting by country goes here, not in the
 * checkout/charge services.
 */
@Injectable()
export class PaymentProviderRouterService {
  resolve(input: ProviderRoutingInput): ProviderRoutingDecision {
    return PaymentProviderRouterService.resolveStatic(input.method);
  }

  /** Pure function — exposed for unit tests + integration without DI. */
  static resolveStatic(method: PaymentMethod): ProviderRoutingDecision {
    switch (method) {
      case 'pix':
        return {
          provider: 'mercadopago',
          reason: 'ADR-0009: MercadoPago is the canonical PIX BR provider',
        };
      case 'boleto':
        return {
          provider: 'mercadopago',
          reason: 'ADR-0009: MercadoPago handles boleto on the same account',
        };
      case 'card':
        return {
          provider: 'stripe',
          reason: 'ADR-0003 + ADR-0009: Stripe handles card + Connect',
        };
      default: {
        // exhaustiveness check; TS narrows `method` to never
        const _exhaustive: never = method;
        throw new Error(`unknown_payment_method: ${String(_exhaustive)}`);
      }
    }
  }
}
