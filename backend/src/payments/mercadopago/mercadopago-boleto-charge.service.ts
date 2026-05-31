import { Injectable, Logger } from '@nestjs/common';

import { MercadoPagoConfigService } from './mercadopago.config';
import type { BoletoChargeResult, CreateBoletoChargeInput } from './mercadopago.types';
import { toPixChargeStatus } from './mercadopago.types';

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

/** Creates boleto charges through Mercado Pago. */
@Injectable()
export class MercadoPagoBoletoChargeService {
  private readonly logger = new Logger(MercadoPagoBoletoChargeService.name);

  /** Hard timeout for MP API calls (ms). */
  private static readonly REQUEST_TIMEOUT_MS = 15_000;

  constructor(private readonly config: MercadoPagoConfigService) {}

  async create(input: CreateBoletoChargeInput): Promise<BoletoChargeResult> {
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
      payment_method_id: 'bolbradesco',
      payer: {
        email: input.payerEmail,
        ...(input.payerName ? { first_name: input.payerName } : {}),
        identification: {
          type: input.payerDocument.length === 11 ? 'CPF' : 'CNPJ',
          number: input.payerDocument,
        },
        address: {
          zip_code: input.payerAddress.zipCode,
          street_name: input.payerAddress.street,
          street_number: input.payerAddress.number,
          ...(input.payerAddress.neighborhood
            ? { neighborhood: input.payerAddress.neighborhood }
            : {}),
          city: input.payerAddress.city,
          federal_unit: input.payerAddress.state,
        },
      },
      date_of_expiration: input.expiresAt.toISOString(),
      external_reference: input.externalReference,
      notification_url: input.notificationUrl,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      MercadoPagoBoletoChargeService.REQUEST_TIMEOUT_MS,
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
        `mp_boleto_charge_request_failed externalRef=${input.externalReference} err=${msg}`,
      );
      throw new Error(`mp_boleto_request_failed: ${msg}`);
    } finally {
      clearTimeout(timeoutId);
    }

    const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok || !json) {
      this.logger.error(
        `mp_boleto_charge_error externalRef=${input.externalReference} status=${response.status}`,
      );
      const errorMsg =
        json && typeof json === 'object' && typeof json['message'] === 'string'
          ? json['message']
          : `http_${response.status}`;
      throw new Error(`mp_boleto_create_failed: ${errorMsg}`);
    }

    const idVal = json['id'];
    const externalId = typeof idVal === 'string' || typeof idVal === 'number' ? String(idVal) : '';
    if (!externalId) {
      throw new Error('mp_boleto_response_missing_id');
    }

    const status = toPixChargeStatus(
      typeof json['status'] === 'string' ? json['status'] : undefined,
    );
    const transactionDetails =
      json['transaction_details'] && typeof json['transaction_details'] === 'object'
        ? (json['transaction_details'] as Record<string, unknown>)
        : {};

    const ticketUrl =
      readString(transactionDetails, 'external_resource_url') || readString(json, 'ticket_url');
    const barcodeContent =
      readString(transactionDetails, 'barcode_content') ||
      readString(json, 'barcode_content') ||
      readString(transactionDetails, 'payment_method_reference_id');
    const digitableLine =
      readString(transactionDetails, 'digitable_line') ||
      readString(json, 'digitable_line') ||
      barcodeContent;

    if (!ticketUrl || !digitableLine) {
      throw new Error('mp_boleto_response_missing_payment_data');
    }

    this.logger.log(
      `mp_boleto_charge_created externalRef=${input.externalReference} externalId=${externalId} status=${status}`,
    );

    return {
      externalId,
      status,
      ticketUrl,
      barcodeContent,
      digitableLine,
      expiresAt: input.expiresAt,
      raw: json,
    };
  }
}
