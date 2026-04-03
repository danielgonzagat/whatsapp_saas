import type {
  Address,
  OrderResponse,
  PaymentMethodResponse,
} from 'mercadopago/dist/clients/order/commonTypes';
import type { PaymentResponse } from 'mercadopago/dist/clients/payment/commonTypes';
import type {
  PaymentMethodRequest,
  PaymentRequest,
} from 'mercadopago/dist/clients/order/create/types';

export type MercadoPagoCheckoutPaymentMethod = 'CREDIT_CARD' | 'PIX' | 'BOLETO';

export type MercadoPagoOrderPaymentBuilderInput = {
  paymentMethod: MercadoPagoCheckoutPaymentMethod;
  amountInCents: number;
  cardToken?: string;
  cardPaymentMethodId?: string;
  cardPaymentType?: string;
  installments?: number;
  pixExpirationMinutes?: number;
  boletoExpirationDays?: number;
};

export type NormalizedMercadoPagoOrderPayment = {
  externalId: string | null;
  status: string;
  statusDetail: string | null;
  approved: boolean;
  pixQrCode: string | null;
  pixCopyPaste: string | null;
  pixExpiresAt: string | null;
  boletoUrl: string | null;
  boletoBarcode: string | null;
  boletoExpiresAt: string | null;
  cardBrand: string | null;
  rawPaymentMethod: PaymentMethodResponse | null;
};

const DEFAULT_PIX_EXPIRATION_MINUTES = 30;
const DEFAULT_BOLETO_EXPIRATION_DAYS = 3;

function centsToMercadoPagoAmount(value: number) {
  return (Math.max(0, Math.round(Number(value || 0))) / 100).toFixed(2);
}

function buildDuration({ days = 0, minutes = 0 }: { days?: number; minutes?: number }) {
  const safeDays = Math.max(0, Math.round(days));
  const safeMinutes = Math.max(0, Math.round(minutes));
  const parts = ['P'];

  if (safeDays > 0) {
    parts.push(`${safeDays}D`);
  }

  if (safeMinutes > 0) {
    const hours = Math.floor(safeMinutes / 60);
    const remainingMinutes = safeMinutes % 60;
    parts.push('T');
    if (hours > 0) {
      parts.push(`${hours}H`);
    }
    if (remainingMinutes > 0) {
      parts.push(`${remainingMinutes}M`);
    }
  }

  if (parts.length === 1) {
    parts.push('T1M');
  }

  return parts.join('');
}

function normalizeBase64QrCode(value?: string | null) {
  if (!value) return null;
  if (value.startsWith('data:')) return value;
  return `data:image/png;base64,${value}`;
}

function normalizeNumberLike(value: unknown) {
  if (value === null || value === undefined) return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
}

function normalizeZipCode(value: unknown) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits || undefined;
}

function firstDefinedString(...values: unknown[]) {
  for (const value of values) {
    const normalized = normalizeNumberLike(value);
    if (normalized) return normalized;
  }
  return undefined;
}

export function normalizeMercadoPagoPayerAddress(raw: unknown): Address | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }

  const address = raw as Record<string, unknown>;
  const streetName = firstDefinedString(address.street, address.streetName, address.address);
  const streetNumber = firstDefinedString(address.number, address.streetNumber);
  const zipCode = normalizeZipCode(address.cep ?? address.zip ?? address.zipCode);
  const neighborhood = firstDefinedString(address.neighborhood, address.district);
  const state = firstDefinedString(address.state, address.uf, address.province);
  const city = firstDefinedString(address.city, address.town);
  const complement = firstDefinedString(address.complement, address.complemento);
  const country = firstDefinedString(address.country, address.countryCode) || 'BR';

  const normalized: Address = {
    street_name: streetName,
    street_number: streetNumber,
    zip_code: zipCode,
    neighborhood,
    state,
    city,
    complement,
    country,
  };

  return Object.values(normalized).some(Boolean) ? normalized : undefined;
}

export function buildMercadoPagoOrderPaymentRequest(
  input: MercadoPagoOrderPaymentBuilderInput,
): PaymentRequest {
  const amount = centsToMercadoPagoAmount(input.amountInCents);

  if (input.paymentMethod === 'CREDIT_CARD') {
    const installments = Math.max(1, Math.round(input.installments || 1));

    return {
      amount,
      payment_method: {
        id: input.cardPaymentMethodId,
        type: input.cardPaymentType || 'credit_card',
        token: input.cardToken,
        installments,
        statement_descriptor: 'KLOEL',
      } satisfies PaymentMethodRequest,
    };
  }

  if (input.paymentMethod === 'PIX') {
    const expirationMinutes = Math.max(
      1,
      Math.round(input.pixExpirationMinutes || DEFAULT_PIX_EXPIRATION_MINUTES),
    );

    return {
      amount,
      expiration_time: buildDuration({ minutes: expirationMinutes }),
      payment_method: {
        id: 'pix',
        type: 'bank_transfer',
      } satisfies PaymentMethodRequest,
    };
  }

  const expirationDays = Math.max(
    1,
    Math.round(input.boletoExpirationDays || DEFAULT_BOLETO_EXPIRATION_DAYS),
  );

  return {
    amount,
    expiration_time: buildDuration({ days: expirationDays }),
    payment_method: {
      id: 'boleto',
      type: 'ticket',
    } satisfies PaymentMethodRequest,
  };
}

function resolvePrimaryPaymentMethod(order: OrderResponse) {
  const primaryPayment = order.transactions?.payments?.[0];
  const attemptMethod = primaryPayment?.attempts?.find(
    (attempt) => attempt?.payment_method,
  )?.payment_method;
  return {
    primaryPayment,
    paymentMethod: primaryPayment?.payment_method || attemptMethod || null,
  };
}

export function normalizeMercadoPagoOrderPayment(
  order: OrderResponse,
): NormalizedMercadoPagoOrderPayment {
  const { primaryPayment, paymentMethod } = resolvePrimaryPaymentMethod(order);
  const status = String(primaryPayment?.status || order.status || 'pending').toLowerCase();
  const expiration =
    primaryPayment?.date_of_expiration ||
    primaryPayment?.expiration_time ||
    order.expiration_time ||
    null;

  return {
    externalId: primaryPayment?.id ? String(primaryPayment.id) : null,
    status,
    statusDetail: primaryPayment?.status_detail || order.status_detail || null,
    approved: status === 'approved',
    pixQrCode: normalizeBase64QrCode(paymentMethod?.qr_code_base64),
    pixCopyPaste: paymentMethod?.qr_code || null,
    pixExpiresAt: paymentMethod?.type === 'bank_transfer' ? expiration : null,
    boletoUrl: paymentMethod?.ticket_url || null,
    boletoBarcode: paymentMethod?.digitable_line || paymentMethod?.barcode_content || null,
    boletoExpiresAt: paymentMethod?.type === 'ticket' ? expiration : null,
    cardBrand: paymentMethod?.id || null,
    rawPaymentMethod: paymentMethod,
  };
}

export function normalizeMercadoPagoPaymentResponse(
  payment: PaymentResponse,
): NormalizedMercadoPagoOrderPayment {
  const pointOfInteraction = payment.point_of_interaction?.transaction_data;
  const status = String(payment.status || 'pending').toLowerCase();

  return {
    externalId: payment.id ? String(payment.id) : null,
    status,
    statusDetail: payment.status_detail || null,
    approved: status === 'approved',
    pixQrCode: normalizeBase64QrCode(pointOfInteraction?.qr_code_base64),
    pixCopyPaste: pointOfInteraction?.qr_code || null,
    pixExpiresAt:
      payment.payment_type_id === 'bank_transfer' || payment.payment_method_id === 'pix'
        ? payment.date_of_expiration || null
        : null,
    boletoUrl: pointOfInteraction?.ticket_url || null,
    boletoBarcode:
      payment.transaction_details?.digitable_line ||
      payment.transaction_details?.barcode?.content ||
      null,
    boletoExpiresAt:
      payment.payment_type_id === 'ticket' ? payment.date_of_expiration || null : null,
    cardBrand: payment.payment_method_id || null,
    rawPaymentMethod: null,
  };
}
