'use client';

import { kloelT } from '@/lib/i18n/t';
import type {
  PublicCheckoutAffiliateContext,
  PublicCheckoutPaymentProvider,
} from '@/lib/public-checkout-contract';

import { createOrder, type CreateOrderData } from './useCheckout';

const CHECKOUT_ORDER_ERRORS = {
  stripeConfirmation: kloelT(`Pedido criado sem dados do Stripe para confirmação do cartão.`),
  missingOrderId: kloelT(`Pedido criado sem ID.`),
  missingSuccessPath: kloelT(`Pedido criado sem rota de continuidade.`),
} as const;

function createCheckoutOrderError(message: string) {
  return new Error(message);
}

type FormState = {
  name: string;
  email: string;
  cpf: string;
  phone: string;
  cep: string;
  street: string;
  number: string;
  neighborhood: string;
  complement: string;
  city: string;
  state: string;
  destinatario: string;
  cardNumber: string;
  cardExp: string;
  cardCvv: string;
  cardName: string;
  cardCpf: string;
  installments: string;
};

type FinalizeCheckoutOrderArgs = {
  affiliateContext?: PublicCheckoutAffiliateContext | null;
  capturedLeadId?: string;
  checkoutCode?: string;
  deviceFingerprint?: string;
  discount: number;
  form: FormState;
  installments: number;
  payMethod: 'card' | 'pix' | 'boleto';
  paymentProvider?: PublicCheckoutPaymentProvider;
  planId: string;
  qty: number;
  shippingInCents: number;
  shippingMode: 'FREE' | 'FIXED' | 'VARIABLE';
  subtotal: number;
  total: number;
  workspaceId: string;
};

type RedirectFinalizeResult = {
  mode: 'redirect';
  successPath: string;
  orderNumber: string;
};

type StripeConfirmationFinalizeResult = {
  mode: 'stripe_confirmation';
  successPath: string;
  orderNumber: string;
  orderId: string;
  clientSecret: string;
  paymentIntentId: string;
};

/** Finalize checkout order result type. */
export type FinalizeCheckoutOrderResult = RedirectFinalizeResult | StripeConfirmationFinalizeResult;

function resolveShippingMethod(
  shippingMode: FinalizeCheckoutOrderArgs['shippingMode'],
  shippingInCents: number,
): string {
  if (shippingMode === 'VARIABLE') {
    return 'kloel-variable';
  }
  if (shippingInCents > 0) {
    return 'standard';
  }
  return 'free';
}

function resolvePaymentMethodCode(
  payMethod: FinalizeCheckoutOrderArgs['payMethod'],
): CreateOrderData['paymentMethod'] {
  if (payMethod === 'card') {
    return 'CREDIT_CARD';
  }
  if (payMethod === 'pix') {
    return 'PIX';
  }
  return 'BOLETO';
}

function buildOrderPayload(args: FinalizeCheckoutOrderArgs): CreateOrderData {
  const {
    affiliateContext,
    capturedLeadId,
    checkoutCode,
    deviceFingerprint,
    discount,
    form,
    installments,
    payMethod,
    planId,
    qty,
    shippingInCents,
    shippingMode,
    subtotal,
    total,
    workspaceId,
  } = args;

  return {
    planId,
    workspaceId,
    checkoutCode,
    capturedLeadId,
    deviceFingerprint,
    customerName: form.name.trim(),
    customerEmail: form.email.trim(),
    customerCPF: form.cpf,
    customerPhone: form.phone,
    shippingAddress: {
      cep: form.cep,
      street: form.street,
      number: form.number,
      neighborhood: form.neighborhood,
      complement: form.complement,
      city: form.city,
      state: form.state,
      destinatario: form.destinatario || form.name,
    },
    shippingMethod: resolveShippingMethod(shippingMode, shippingInCents),
    shippingPrice: shippingInCents,
    orderQuantity: qty,
    subtotalInCents: subtotal,
    discountInCents: discount,
    totalInCents: total,
    paymentMethod: resolvePaymentMethodCode(payMethod),
    installments: payMethod === 'card' ? installments : 1,
    affiliateId: affiliateContext?.affiliateWorkspaceId,
  };
}

function buildStripeResult(
  result: unknown,
  successPath: string,
  orderNumber: string,
  orderId: string,
): StripeConfirmationFinalizeResult {
  const clientSecret = readNestedString(asRecord(result), ['paymentData', 'clientSecret']);
  const paymentIntentId = readNestedString(asRecord(result), ['paymentData', 'paymentIntentId']);
  if (!clientSecret || !paymentIntentId) {
    throw createCheckoutOrderError(CHECKOUT_ORDER_ERRORS.stripeConfirmation);
  }
  return {
    mode: 'stripe_confirmation',
    successPath,
    orderNumber,
    orderId,
    clientSecret,
    paymentIntentId,
  };
}

function needsStripeConfirmation(
  payMethod: FinalizeCheckoutOrderArgs['payMethod'],
  paymentProvider: FinalizeCheckoutOrderArgs['paymentProvider'],
): boolean {
  return payMethod === 'card' && paymentProvider?.provider === 'stripe';
}

/** Finalize checkout order. */
export async function finalizeCheckoutOrder(
  args: FinalizeCheckoutOrderArgs,
): Promise<FinalizeCheckoutOrderResult> {
  const payload = buildOrderPayload(args);
  const result = await createOrder(payload);

  const orderId = resolveOrderId(result);
  if (!orderId) {
    throw createCheckoutOrderError(CHECKOUT_ORDER_ERRORS.missingOrderId);
  }

  const orderNumber = resolveOrderNumber(result);
  const successPath = resolveSuccessPath(args.payMethod, result, orderId);
  if (!successPath) {
    throw createCheckoutOrderError(CHECKOUT_ORDER_ERRORS.missingSuccessPath);
  }

  if (needsStripeConfirmation(args.payMethod, args.paymentProvider)) {
    return buildStripeResult(result, successPath, orderNumber, orderId);
  }

  return {
    mode: 'redirect',
    successPath,
    orderNumber,
  };
}

function resolveSuccessPath(
  payMethod: 'card' | 'pix' | 'boleto',
  result: unknown,
  orderId: string,
) {
  if (payMethod === 'pix') {
    return `/order/${orderId}/pix`;
  }
  if (payMethod === 'boleto') {
    return `/order/${orderId}/boleto`;
  }
  const record = asRecord(result);
  const hasUpsells = Array.isArray(readNestedValue(record, ['plan', 'upsells']));
  const approved = readNestedValue(record, ['paymentData', 'approved']) === true;
  if (approved && hasUpsells) {
    return `/order/${orderId}/upsell`;
  }
  return `/order/${orderId}/success`;
}

function resolveOrderId(result: unknown) {
  const record = asRecord(result);
  return readString(record, 'id') || readNestedString(record, ['data', 'id']);
}

function resolveOrderNumber(result: unknown) {
  const record = asRecord(result);
  return readString(record, 'orderNumber') || readNestedString(record, ['data', 'orderNumber']);
}

function readString(value: Record<string, unknown> | null, key: string) {
  const candidate = value?.[key];
  return typeof candidate === 'string' ? candidate : '';
}

function readNestedString(value: Record<string, unknown> | null, path: string[]) {
  const candidate = readNestedValue(value, path);
  return typeof candidate === 'string' ? candidate : '';
}

const BLOCKED_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

function readNestedValue(value: Record<string, unknown> | null, path: string[]) {
  let current: unknown = value;
  for (const segment of path) {
    const record = asRecord(current);
    if (!record) {
      return undefined;
    }
    if (BLOCKED_SEGMENTS.has(segment)) {
      return undefined;
    }
    if (!Object.prototype.hasOwnProperty.call(record, segment)) {
      return undefined;
    }
    current = record[segment];
  }
  return current;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}
