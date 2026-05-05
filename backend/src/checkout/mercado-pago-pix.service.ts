import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

export interface CreatePixPaymentInput {
  idempotencyKey: string;
  orderMetadata: {
    orderId: string;
    workspaceId: string;
    productName?: string;
  };
  buyerName: string;
  buyerEmail: string;
  buyerDocument: string;
  buyerDocumentType?: 'CPF' | 'CNPJ';
  buyerPhone?: string;
  amountInCents: number;
  notificationUrl?: string;
}

export interface PixPaymentResult {
  externalId: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'refunded' | 'charged_back';
  qrCode: string | null;
  qrCodeBase64: string | null;
  copyPaste: string | null;
  expiresAt: string | null;
  providerRaw: Record<string, unknown>;
}

const MP_BASE_URL = 'https://api.mercadopago.com/v1';

function nameParts(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  const spaceIndex = trimmed.indexOf(' ');
  if (spaceIndex === -1) {
    return { firstName: trimmed, lastName: trimmed };
  }
  return {
    firstName: trimmed.slice(0, spaceIndex),
    lastName: trimmed.slice(spaceIndex + 1),
  };
}

function sanitizeForLog(payload: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...payload };
  if (copy.payer && typeof copy.payer === 'object' && copy.payer !== null) {
    const payer = { ...(copy.payer as Record<string, unknown>) };
    delete payer.first_name;
    delete payer.last_name;
    delete payer.email;
    delete payer.phone;
    if (payer.identification && typeof payer.identification === 'object') {
      const id = { ...(payer.identification as Record<string, unknown>) };
      id.number = '***';
      payer.identification = id;
    }
    copy.payer = payer;
  }
  if (copy.notification_url) {
    copy.notification_url = '<redacted>';
  }
  return copy;
}

function sanitizeResult(raw: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...raw };
  if (copy.payer && typeof copy.payer === 'object' && copy.payer !== null) {
    const payer = { ...(copy.payer as Record<string, unknown>) };
    if (payer.identification && typeof payer.identification === 'object') {
      const id = { ...(payer.identification as Record<string, unknown>) };
      id.number = '***';
      payer.identification = id;
    }
    copy.payer = payer;
  }
  return copy;
}

function extractExpiresAt(raw: Record<string, unknown>): string | null {
  const dateStr = raw.date_of_expiration;
  if (typeof dateStr === 'string') {
    return dateStr;
  }
  return null;
}

function extractQrData(raw: Record<string, unknown>): {
  qrCode: string | null;
  qrCodeBase64: string | null;
  copyPaste: string | null;
} {
  const poi = raw.point_of_interaction as Record<string, unknown> | undefined;
  const txnData = poi?.transaction_data as Record<string, unknown> | undefined;
  return {
    qrCode: typeof txnData?.qr_code === 'string' ? txnData.qr_code : null,
    qrCodeBase64: typeof txnData?.qr_code_base64 === 'string' ? txnData.qr_code_base64 : null,
    copyPaste: typeof txnData?.qr_code === 'string' ? txnData.qr_code : null,
  };
}

/** Mercado Pago Pix service — creates Pix payments without wiring into checkout flow. */
@Injectable()
export class MercadoPagoPixService {
  private readonly logger = new Logger(MercadoPagoPixService.name);

  /** Create a Pix payment at Mercado Pago. Does NOT mark the order as paid. */
  async createPixPayment(input: CreatePixPaymentInput): Promise<PixPaymentResult> {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
      throw new ServiceUnavailableException('Mercado Pago não configurado.');
    }

    const { firstName, lastName } = nameParts(input.buyerName);
    const docType = input.buyerDocumentType || 'CPF';
    const amount = input.amountInCents / 100;

    const payload: Record<string, unknown> = {
      transaction_amount: amount,
      description: input.orderMetadata.productName || `Pedido ${input.orderMetadata.orderId}`,
      payment_method_id: 'pix',
      payer: {
        first_name: firstName,
        last_name: lastName,
        email: input.buyerEmail,
        identification: {
          type: docType,
          number: input.buyerDocument,
        },
      },
      metadata: {
        kloel_order_id: input.orderMetadata.orderId,
        workspace_id: input.orderMetadata.workspaceId,
      },
    };

    if (input.buyerPhone) {
      (payload.payer as Record<string, unknown>).phone = {
        number: input.buyerPhone,
      };
    }

    if (input.notificationUrl) {
      payload.notification_url = input.notificationUrl;
    }

    const requestHeaders: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': input.idempotencyKey,
    };

    this.logger.log(
      JSON.stringify({
        event: 'mp_pix_request',
        orderId: input.orderMetadata.orderId,
        idempotencyKey: input.idempotencyKey,
        amountInCents: input.amountInCents,
      }),
    );

    let response: Response;
    try {
      response = await fetch(`${MP_BASE_URL}/payments`, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      });
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'mp_pix_network_error',
          orderId: input.orderMetadata.orderId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      throw new ServiceUnavailableException('Falha de rede ao criar Pix no Mercado Pago.');
    }

    let raw: Record<string, unknown>;
    try {
      raw = (await response.json()) as Record<string, unknown>;
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'mp_pix_invalid_json',
          orderId: input.orderMetadata.orderId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      throw new ServiceUnavailableException('Mercado Pago retornou uma resposta inválida.');
    }

    if (!response.ok) {
      this.logger.error(
        JSON.stringify({
          event: 'mp_pix_api_error',
          orderId: input.orderMetadata.orderId,
          status: response.status,
          body: sanitizeForLog(raw),
        }),
      );
      throw new ServiceUnavailableException('Mercado Pago rejeitou a criação do Pix.');
    }

    const status = normalizeStatus(raw.status);
    const qrData = extractQrData(raw);
    const externalId =
      typeof raw.id === 'number' || typeof raw.id === 'string' ? String(raw.id) : '';
    if (!externalId) {
      this.logger.error(
        JSON.stringify({
          event: 'mp_pix_missing_external_id',
          orderId: input.orderMetadata.orderId,
        }),
      );
      throw new ServiceUnavailableException('Mercado Pago retornou Pix sem identificador.');
    }

    this.logger.log(
      JSON.stringify({
        event: 'mp_pix_created',
        orderId: input.orderMetadata.orderId,
        externalId,
        status,
      }),
    );

    return {
      externalId,
      status,
      ...qrData,
      expiresAt: extractExpiresAt(raw),
      providerRaw: sanitizeResult(raw),
    };
  }
}

function normalizeStatus(mpStatus: unknown): PixPaymentResult['status'] {
  const s = typeof mpStatus === 'string' ? mpStatus.toLowerCase() : '';
  switch (s) {
    case 'approved':
      return 'approved';
    case 'rejected':
      return 'rejected';
    case 'cancelled':
      return 'cancelled';
    case 'refunded':
      return 'refunded';
    case 'charged_back':
      return 'charged_back';
    default:
      return 'pending';
  }
}
