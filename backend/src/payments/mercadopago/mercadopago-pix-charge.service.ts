import { Injectable, Logger } from '@nestjs/common';

import { MercadoPagoConfigService } from './mercadopago.config';
import type { CreatePixChargeInput, PixChargeResult } from './mercadopago.types';
import { toPixChargeStatus } from './mercadopago.types';

/**
 * Creates a PIX charge via Mercado Pago's `POST /v1/payments` endpoint.
 *
 * Per ADR-0009: this is the canonical PIX entrypoint. Cartão goes via
 * StripeChargeService.
 *
 * Key properties:
 * - Money in cents (`bigint`) throughout; converted to BRL float only at
 *   the HTTP boundary (MP API expects `transaction_amount` as float).
 * - Idempotency: every request sends `X-Idempotency-Key`. Re-posting with
 *   the same key returns the previously-created payment instead of
 *   double-charging.
 * - Timeout: 15s hard timeout (MP recommendation; PIX QR generation is
 *   fast but TLS handshake + JSON parse can stretch).
 * - Status mapping: provider strings normalized to canonical
 *   `PixChargeStatus` enum (`approved` | `pending` | `rejected` | etc.).
 * - No secret leakage: errors log the externalReference + status code, never
 *   the request body or Authorization header.
 */
@Injectable()
export class MercadoPagoPixChargeService {
  private readonly logger = new Logger(MercadoPagoPixChargeService.name);

  /** Hard timeout for MP API calls (ms). */
  private static readonly REQUEST_TIMEOUT_MS = 15_000;

  constructor(private readonly config: MercadoPagoConfigService) {}

  async create(input: CreatePixChargeInput): Promise<PixChargeResult> {
    if (!this.config.isAvailable()) {
      throw new Error('mercadopago_not_configured');
    }
    const cfg = this.config.get();

    const transactionAmount = Number(input.amountCents) / 100;
    if (!Number.isFinite(transactionAmount) || transactionAmount <= 0) {
      throw new Error(`invalid_amount: ${input.amountCents.toString()}`);
    }

    const body = {
      transaction_amount: transactionAmount,
      description: input.description,
      payment_method_id: 'pix',
      payer: {
        email: input.payerEmail,
        ...(input.payerName ? { first_name: input.payerName } : {}),
        ...(input.payerDocument
          ? {
              identification: {
                type: input.payerDocument.length === 11 ? 'CPF' : 'CNPJ',
                number: input.payerDocument,
              },
            }
          : {}),
      },
      date_of_expiration: input.expiresAt.toISOString(),
      external_reference: input.externalReference,
      notification_url: input.notificationUrl,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      MercadoPagoPixChargeService.REQUEST_TIMEOUT_MS,
    );

    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}/v1/payments`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${cfg.accessToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': input.idempotencyKey,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `mp_pix_charge_request_failed externalRef=${input.externalReference} err=${msg}`,
      );
      throw new Error(`mp_pix_request_failed: ${msg}`);
    } finally {
      clearTimeout(timeoutId);
    }

    const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok || !json) {
      this.logger.error(
        `mp_pix_charge_error externalRef=${input.externalReference} status=${response.status}`,
      );
      const errorMsg =
        json && typeof json === 'object' && typeof json['message'] === 'string'
          ? json['message']
          : `http_${response.status}`;
      throw new Error(`mp_pix_create_failed: ${errorMsg}`);
    }

    const idVal = json['id'];
    const externalId = typeof idVal === 'string' || typeof idVal === 'number' ? String(idVal) : '';
    if (!externalId) {
      throw new Error('mp_pix_response_missing_id');
    }

    const status = toPixChargeStatus(
      typeof json['status'] === 'string' ? json['status'] : undefined,
    );

    const pointOfInteraction = json['point_of_interaction'] as
      | { transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string } }
      | undefined;
    const td = pointOfInteraction?.transaction_data ?? {};

    this.logger.log(
      `mp_pix_charge_created externalRef=${input.externalReference} externalId=${externalId} status=${status}`,
    );

    return {
      externalId,
      status,
      qrCode: typeof td.qr_code === 'string' ? td.qr_code : '',
      qrCodeBase64: typeof td.qr_code_base64 === 'string' ? td.qr_code_base64 : '',
      ticketUrl: typeof td.ticket_url === 'string' ? td.ticket_url : '',
      expiresAt: input.expiresAt,
      raw: json,
    };
  }

  /**
   * Fetches the current status of a previously-created PIX charge by MP id.
   *
   * Used by the webhook handler to confirm the charge state independently
   * of the webhook body (defense-in-depth: webhook tells us "something
   * changed", we read MP source-of-truth).
   */
  async getStatus(
    externalId: string,
  ): Promise<{ status: ReturnType<typeof toPixChargeStatus>; raw: unknown }> {
    if (!this.config.isAvailable()) {
      throw new Error('mercadopago_not_configured');
    }
    const cfg = this.config.get();

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      MercadoPagoPixChargeService.REQUEST_TIMEOUT_MS,
    );
    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}/v1/payments/${externalId}`, {
        signal: controller.signal,
        headers: { Authorization: `Bearer ${cfg.accessToken}` },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`mp_pix_status_request_failed: ${msg}`);
    } finally {
      clearTimeout(timeoutId);
    }
    if (!response.ok) {
      throw new Error(`mp_pix_status_http_${response.status}`);
    }
    const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!json) {
      throw new Error('mp_pix_status_invalid_response');
    }
    const status = toPixChargeStatus(
      typeof json['status'] === 'string' ? json['status'] : undefined,
    );
    return { status, raw: json };
  }
}
