import { type CreateOrderData } from '../useCheckout';
import {
  resolvePaymentMethodCode,
  resolveShippingMethodLabel,
} from '../useCheckoutExperience.utils';

export interface BuildOrderPayloadParams {
  checkoutCode: string | undefined;
  form: {
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
    cardName: string;
  };
  payMethod: 'card' | 'pix' | 'boleto';
  shippingMode: string;
  shippingInCents: number;
  qty: number;
  subtotal: number;
  discount: number;
  total: number;
  couponApplied: boolean;
  couponCode: string;
  installments: number;
  affiliateWorkspaceId?: string;
}

export function buildOrderPayload(
  resolvedPlanId: string,
  resolvedWorkspaceId: string,
  params: BuildOrderPayloadParams,
): CreateOrderData {
  const payload: CreateOrderData = {
    planId: resolvedPlanId,
    workspaceId: resolvedWorkspaceId,
    checkoutCode: params.checkoutCode,
    customerName: params.form.name.trim(),
    customerEmail: params.form.email.trim(),
    customerCPF: params.form.cpf,
    customerPhone: params.form.phone,
    shippingAddress: {
      cep: params.form.cep,
      street: params.form.street,
      number: params.form.number,
      neighborhood: params.form.neighborhood,
      complement: params.form.complement,
      city: params.form.city,
      state: params.form.state,
      destinatario: params.form.destinatario || params.form.name,
    },
    shippingMethod: resolveShippingMethodLabel(params.shippingMode, params.shippingInCents),
    shippingPrice: params.shippingInCents,
    orderQuantity: params.qty,
    subtotalInCents: params.subtotal,
    discountInCents: params.discount,
    totalInCents: params.total,
    couponCode: params.couponApplied ? params.couponCode : undefined,
    couponDiscount: params.couponApplied ? params.discount : undefined,
    paymentMethod: resolvePaymentMethodCode(params.payMethod),
    installments: params.payMethod === 'card' ? params.installments : 1,
    affiliateId: params.affiliateWorkspaceId,
  };

  if (params.payMethod === 'card') {
    payload.cardHolderName = params.form.cardName || params.form.name;
  }
  return payload;
}

export function resolveSuccessRedirect(
  result: Record<string, unknown>,
  payMethod: string,
): string | null {
  const data = result?.data as Record<string, unknown> | undefined;
  const orderId = result?.id || data?.id;
  if (!orderId) {
    return null;
  }
  if (payMethod === 'pix') {
    return `/order/${orderId}/pix`;
  }
  if (payMethod === 'boleto') {
    return `/order/${orderId}/boleto`;
  }
  const paymentData = result?.paymentData as Record<string, unknown> | undefined;
  const planData = result?.plan as Record<string, unknown> | undefined;
  if (
    paymentData?.approved &&
    Array.isArray(planData?.upsells) &&
    (planData.upsells as unknown[]).length > 0
  ) {
    return `/order/${orderId}/upsell`;
  }
  return `/order/${orderId}/success`;
}
