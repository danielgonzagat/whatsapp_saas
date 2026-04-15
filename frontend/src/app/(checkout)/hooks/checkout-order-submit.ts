'use client';

import { getMercadoPagoDeviceSessionId, tokenizeMercadoPagoCard } from '@/lib/mercado-pago';
import type {
  PublicCheckoutAffiliateContext,
  PublicCheckoutPaymentProvider,
} from '@/lib/public-checkout-contract';
import { createOrder, type CreateOrderData } from './useCheckout';

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
  mercadoPagoPublicKey: string;
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

export async function finalizeCheckoutOrder(args: FinalizeCheckoutOrderArgs) {
  const {
    affiliateContext,
    capturedLeadId,
    checkoutCode,
    deviceFingerprint,
    discount,
    form,
    installments,
    mercadoPagoPublicKey,
    payMethod,
    paymentProvider,
    planId,
    qty,
    shippingInCents,
    shippingMode,
    subtotal,
    total,
    workspaceId,
  } = args;

  const meliSessionId =
    paymentProvider?.provider === 'mercado_pago' ? await getMercadoPagoDeviceSessionId() : null;

  if (paymentProvider?.provider === 'mercado_pago' && !meliSessionId) {
    throw new Error(
      'Não foi possível validar este dispositivo para o Mercado Pago. Atualize a página e tente novamente.',
    );
  }

  const payload: CreateOrderData = {
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
    shippingMethod:
      shippingMode === 'VARIABLE' ? 'kloel-variable' : shippingInCents > 0 ? 'standard' : 'free',
    shippingPrice: shippingInCents,
    orderQuantity: qty,
    subtotalInCents: subtotal,
    discountInCents: discount,
    totalInCents: total,
    paymentMethod: payMethod === 'card' ? 'CREDIT_CARD' : payMethod === 'pix' ? 'PIX' : 'BOLETO',
    installments: payMethod === 'card' ? installments : 1,
    affiliateId: affiliateContext?.affiliateWorkspaceId,
  };

  if (payMethod === 'card') {
    const [expMonth = '', expYearSuffix = ''] = form.cardExp.split('/');
    const token = await tokenizeMercadoPagoCard(mercadoPagoPublicKey, {
      cardNumber: form.cardNumber,
      cardholderName: form.cardName || form.name,
      identificationNumber: form.cardCpf || form.cpf,
      securityCode: form.cardCvv,
      cardExpirationMonth: expMonth,
      cardExpirationYear: `20${expYearSuffix}`,
    });

    Object.assign(payload, {
      cardHolderName: form.cardName || form.name,
      mercadoPagoToken: token.token,
      mercadoPagoPaymentMethodId: token.paymentMethodId,
      mercadoPagoPaymentType: token.paymentType,
      mercadoPagoCardLast4: token.last4,
    });
  }

  const result = await createOrder(payload, { meliSessionId });
  const successPath = resolveSuccessPath(payMethod, result);
  if (!successPath) {
    throw new Error('Pedido criado sem rota de continuidade.');
  }

  return {
    successPath,
    orderNumber: resolveOrderNumber(result),
  };
}

function resolveSuccessPath(payMethod: 'card' | 'pix' | 'boleto', result: unknown) {
  const record = isRecord(result) ? result : null;
  const orderId = readString(record, 'id') || readNestedString(record, ['data', 'id']);
  if (!orderId) return null;
  if (payMethod === 'pix') return `/order/${orderId}/pix`;
  if (payMethod === 'boleto') return `/order/${orderId}/boleto`;
  const hasUpsells = Array.isArray(readNestedValue(record, ['plan', 'upsells']));
  const approved = readNestedValue(record, ['paymentData', 'approved']) === true;
  if (approved && hasUpsells) return `/order/${orderId}/upsell`;
  return `/order/${orderId}/success`;
}

function resolveOrderNumber(result: unknown) {
  const record = isRecord(result) ? result : null;
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

function readNestedValue(value: Record<string, unknown> | null, path: string[]) {
  let current: unknown = value;
  for (const segment of path) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
