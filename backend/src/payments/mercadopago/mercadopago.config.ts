import { Injectable, Logger } from '@nestjs/common';

import type { MercadoPagoConfig } from './mercadopago.types';

/**
 * Loads and validates Mercado Pago configuration from environment.
 *
 * Behavior:
 * - If `MERCADOPAGO_ACCESS_TOKEN` is empty/missing, marks the adapter as
 *   `unavailable`; the router falls back to a setup-required state instead
 *   of crashing the boot (per CLAUDE.md REGRA DE INTEGRAÇÕES EXTERNAS:
 *   "Falha externa deve gerar estado honesto, nunca fallback falso").
 * - Never logs the secret values. Logs only the boolean presence + sandbox
 *   mode.
 */
@Injectable()
export class MercadoPagoConfigService {
  private readonly logger = new Logger(MercadoPagoConfigService.name);
  private readonly config: MercadoPagoConfig | null;

  constructor() {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN ?? '';
    const publicKey = process.env.MERCADOPAGO_PUBLIC_KEY ?? '';
    const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET ?? '';
    const sandbox = process.env.MERCADOPAGO_SANDBOX !== 'false';

    if (!accessToken || !publicKey) {
      this.logger.warn(
        'MercadoPago adapter UNAVAILABLE — MERCADOPAGO_ACCESS_TOKEN or ' +
          'MERCADOPAGO_PUBLIC_KEY missing. PIX charges will route to ' +
          'setup-required.',
      );
      this.config = null;
      return;
    }

    if (!webhookSecret) {
      this.logger.warn(
        'MercadoPago webhook secret missing — incoming webhooks will be ' +
          'rejected. Set MERCADOPAGO_WEBHOOK_SECRET in env.',
      );
    }

    this.config = { accessToken, publicKey, webhookSecret, sandbox };
    this.logger.log(
      `MercadoPago adapter READY (sandbox=${sandbox}, webhookSecretSet=${Boolean(
        webhookSecret,
      )})`,
    );
  }

  /** True when MP can accept charges. */
  isAvailable(): boolean {
    return this.config !== null;
  }

  /** Returns config; callers must check `isAvailable()` first. */
  get(): MercadoPagoConfig {
    if (!this.config) {
      throw new Error(
        'MercadoPago is not configured. Set MERCADOPAGO_ACCESS_TOKEN + ' +
          'MERCADOPAGO_PUBLIC_KEY before calling MP services.',
      );
    }
    return this.config;
  }

  /** API base URL — switches sandbox vs prod. MP uses the same host. */
  get baseUrl(): string {
    return 'https://api.mercadopago.com';
  }
}
