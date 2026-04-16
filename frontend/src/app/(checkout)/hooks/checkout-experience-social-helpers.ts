'use client';

import { buildCheckoutPricing } from '@/lib/checkout-pricing';
import type {
  CheckoutDisplayTestimonial,
  PublicCheckoutConfig,
  PublicCheckoutMerchantInfo,
  PublicCheckoutThemeProps,
} from '@/lib/public-checkout-contract';

const D_RE = /\D/g;

export type Formatters = {
  cpf: (value: string) => string;
  phone: (value: string) => string;
  cep: (value: string) => string;
  brl: (cents: number) => string;
};

export type CheckoutExperienceForm = {
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

export type UseCheckoutExperienceSocialOptions = PublicCheckoutThemeProps & {
  defaults: {
    product: { name: string; priceInCents: number; brand: string };
    testimonials: CheckoutDisplayTestimonial[];
  };
  helpers: {
    fmt: Formatters;
    normalizeTestimonials: (
      brandName: string,
      fallbackTestimonials: CheckoutDisplayTestimonial[],
      testimonials: PublicCheckoutConfig['testimonials'],
      enabled: boolean | undefined,
    ) => CheckoutDisplayTestimonial[];
    buildFooterPrimaryLine: (brandName: string, merchant?: PublicCheckoutMerchantInfo) => string;
    formatCnpj: (value?: string | null) => string;
  };
};

export const EMPTY_CHECKOUT_EXPERIENCE_FORM: CheckoutExperienceForm = {
  name: '',
  email: '',
  cpf: '',
  phone: '',
  cep: '',
  street: '',
  number: '',
  neighborhood: '',
  complement: '',
  city: '',
  state: '',
  destinatario: '',
  cardNumber: '',
  cardExp: '',
  cardCvv: '',
  cardName: '',
  cardCpf: '',
  installments: '1',
};

type DerivedStateArgs = {
  product: UseCheckoutExperienceSocialOptions['product'];
  config: UseCheckoutExperienceSocialOptions['config'];
  plan: UseCheckoutExperienceSocialOptions['plan'];
  paymentProvider: UseCheckoutExperienceSocialOptions['paymentProvider'];
  merchant: UseCheckoutExperienceSocialOptions['merchant'];
  defaults: UseCheckoutExperienceSocialOptions['defaults'];
  helpers: UseCheckoutExperienceSocialOptions['helpers'];
  form: CheckoutExperienceForm;
  qty: number;
  discount: number;
  payMethod: 'card' | 'pix' | 'boleto';
  dynamicShippingInCents: number | null;
  step: number;
};

export function deriveCheckoutExperienceState({
  product,
  config,
  plan,
  paymentProvider,
  merchant,
  defaults,
  helpers,
  form,
  qty,
  discount,
  payMethod,
  dynamicShippingInCents,
  step,
}: DerivedStateArgs) {
  const { fmt, normalizeTestimonials, buildFooterPrimaryLine, formatCnpj } = helpers;
  const productName =
    config?.productDisplayName || plan?.name || product?.name || defaults.product.name;
  const brandName =
    config?.brandName ||
    merchant?.companyName ||
    merchant?.workspaceName ||
    product?.name ||
    defaults.product.brand;
  const unitPriceInCents = Math.max(
    0,
    Math.round(Number(plan?.priceInCents || defaults.product.priceInCents)),
  );
  const shippingMode =
    config?.shippingMode ||
    (plan?.freeShipping ? 'FREE' : Number(plan?.shippingPrice || 0) > 0 ? 'FIXED' : 'FREE');
  const fixedShippingInCents = Math.max(0, Math.round(Number(plan?.shippingPrice || 0)));
  const variableShippingFloorInCents = Math.max(
    0,
    Math.round(Number(config?.shippingVariableMinInCents || 0)),
  );
  const shippingInCents =
    shippingMode === 'VARIABLE'
      ? (dynamicShippingInCents ?? variableShippingFloorInCents)
      : shippingMode === 'FIXED'
        ? fixedShippingInCents
        : 0;
  const supportsCard =
    config?.enableCreditCard !== false && paymentProvider?.supportsCreditCard !== false;
  const supportsPix = config?.enablePix !== false && paymentProvider?.supportsPix !== false;
  const supportsBoleto = config?.enableBoleto === true && paymentProvider?.supportsBoleto !== false;
  const productImage =
    config?.productImage ||
    product?.imageUrl ||
    (Array.isArray(product?.images)
      ? product.images.find((entry) => typeof entry === 'string' && entry.trim()) || ''
      : '');
  const checkoutUnavailableReason =
    paymentProvider?.checkoutEnabled === false
      ? paymentProvider.unavailableReason || 'Conecte seu Mercado Pago para começar a vender.'
      : '';
  const testimonials = normalizeTestimonials(
    brandName,
    defaults.testimonials,
    config?.testimonials,
    config?.enableTestimonials,
  );
  const subtotal = unitPriceInCents * qty;
  const total = Math.max(0, subtotal + shippingInCents - discount);
  const installments = Math.max(1, Number.parseInt(form.installments || '1', 10) || 1);
  const pricing = buildCheckoutPricing({
    baseTotalInCents: total,
    paymentMethod: payMethod === 'card' ? 'credit' : payMethod,
    installments,
    installmentInterestMonthlyPercent: paymentProvider?.installmentInterestMonthlyPercent ?? 3.99,
  });
  const totalWithInterest = payMethod === 'card' ? pricing.chargedTotalInCents : total;
  const maxInstallments = Math.max(1, Math.min(Number(plan?.maxInstallments || 12), 12));
  const installmentOptions = Array.from({ length: maxInstallments }, (_, index) => {
    const value = index + 1;
    const optionPricing = buildCheckoutPricing({
      baseTotalInCents: total,
      paymentMethod: 'credit',
      installments: value,
      installmentInterestMonthlyPercent: paymentProvider?.installmentInterestMonthlyPercent ?? 3.99,
    });
    return {
      value,
      label:
        value === 1
          ? `1x de ${fmt.brl(optionPricing.chargedTotalInCents)} sem juros`
          : `${value}x de ${fmt.brl(optionPricing.perInstallmentInCents)}`,
    };
  });
  const footerPrimary = buildFooterPrimaryLine(brandName, merchant);
  const footerSecondary = merchant?.addressLine || '';
  const footerLegal =
    config?.footerText ||
    `Copyright ${new Date().getFullYear()} ${merchant?.companyName || brandName}${merchant?.cnpj ? ` - CNPJ: ${formatCnpj(merchant.cnpj)}` : ''}`;
  const popupCouponCode = String(config?.autoCouponCode || '')
    .trim()
    .toUpperCase();
  const headerPrimary = config?.headerMessage || 'Envio Imediato após o Pagamento';
  const headerSecondary = config?.headerSubMessage || 'OFERTA ESPECIAL DO MÊS!!!';
  const mobileCanOpenStep1 = step > 1;
  const mobileCanOpenStep2 = step > 2;
  const mercadoPagoPublicKey =
    paymentProvider?.publicKey || process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY || '';

  return {
    productName,
    brandName,
    unitPriceInCents,
    shippingMode,
    variableShippingFloorInCents,
    shippingInCents,
    supportsCard,
    supportsPix,
    supportsBoleto,
    productImage,
    checkoutUnavailableReason,
    testimonials,
    subtotal,
    total,
    installments,
    pricing,
    totalWithInterest,
    installmentOptions,
    footerPrimary,
    footerSecondary,
    footerLegal,
    popupCouponCode,
    headerPrimary,
    headerSecondary,
    mobileCanOpenStep1,
    mobileCanOpenStep2,
    mercadoPagoPublicKey,
  };
}

export function isCheckoutIdentityStepValid(
  form: CheckoutExperienceForm,
  options: { requireCPF: boolean; requirePhone: boolean },
) {
  return Boolean(
    form.name.trim() &&
    form.email.trim() &&
    (!options.requireCPF || form.cpf.replace(D_RE, '').length >= 11) &&
    (!options.requirePhone || form.phone.replace(D_RE, '').length >= 10),
  );
}

export function isCheckoutAddressStepValid(form: CheckoutExperienceForm) {
  return Boolean(
    form.cep.trim() &&
    form.street.trim() &&
    form.number.trim() &&
    form.neighborhood.trim() &&
    form.city.trim() &&
    form.state.trim(),
  );
}
