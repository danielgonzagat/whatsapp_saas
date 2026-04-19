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

type DerivedShippingMode = 'FREE' | 'FIXED' | 'VARIABLE';

type DerivedShipping = {
  shippingMode: DerivedShippingMode;
  fixedShippingInCents: number;
  variableShippingFloorInCents: number;
  shippingInCents: number;
};

function resolveShippingModeDerived(
  config: DerivedStateArgs['config'],
  plan: DerivedStateArgs['plan'],
): DerivedShippingMode {
  if (config?.shippingMode) return config.shippingMode;
  if (plan?.freeShipping) return 'FREE';
  return Number(plan?.shippingPrice || 0) > 0 ? 'FIXED' : 'FREE';
}

function computeShippingInCentsDerived(
  shippingMode: DerivedShippingMode,
  fixedShippingInCents: number,
  variableShippingFloorInCents: number,
  dynamicShippingInCents: number | null,
): number {
  if (shippingMode === 'VARIABLE') {
    return dynamicShippingInCents ?? variableShippingFloorInCents;
  }
  if (shippingMode === 'FIXED') return fixedShippingInCents;
  return 0;
}

function deriveShipping(
  config: DerivedStateArgs['config'],
  plan: DerivedStateArgs['plan'],
  dynamicShippingInCents: number | null,
): DerivedShipping {
  const shippingMode = resolveShippingModeDerived(config, plan);
  const fixedShippingInCents = Math.max(0, Math.round(Number(plan?.shippingPrice || 0)));
  const variableShippingFloorInCents = Math.max(
    0,
    Math.round(Number(config?.shippingVariableMinInCents || 0)),
  );
  const shippingInCents = computeShippingInCentsDerived(
    shippingMode,
    fixedShippingInCents,
    variableShippingFloorInCents,
    dynamicShippingInCents,
  );
  return { shippingMode, fixedShippingInCents, variableShippingFloorInCents, shippingInCents };
}

function resolveDerivedProductImage(
  config: DerivedStateArgs['config'],
  product: DerivedStateArgs['product'],
): string {
  if (config?.productImage) return config.productImage;
  if (product?.imageUrl) return product.imageUrl;
  if (Array.isArray(product?.images)) {
    return product.images.find((entry) => typeof entry === 'string' && entry.trim()) || '';
  }
  return '';
}

function resolveDerivedUnavailableReason(
  paymentProvider: DerivedStateArgs['paymentProvider'],
): string {
  if (paymentProvider?.checkoutEnabled !== false) return '';
  return paymentProvider.unavailableReason || 'Conecte sua conta Stripe para começar a vender.';
}

function resolveDerivedBrandName(
  config: DerivedStateArgs['config'],
  merchant: DerivedStateArgs['merchant'],
  product: DerivedStateArgs['product'],
  defaults: DerivedStateArgs['defaults'],
): string {
  return (
    config?.brandName ||
    merchant?.companyName ||
    merchant?.workspaceName ||
    product?.name ||
    defaults.product.brand
  );
}

function buildDerivedInstallmentOptions(
  total: number,
  plan: DerivedStateArgs['plan'],
  paymentProvider: DerivedStateArgs['paymentProvider'],
  fmt: Formatters,
) {
  const maxInstallments = Math.max(1, Math.min(Number(plan?.maxInstallments || 12), 12));
  return Array.from({ length: maxInstallments }, (_, index) => {
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
}

function buildDerivedFooterLegal(
  config: DerivedStateArgs['config'],
  merchant: DerivedStateArgs['merchant'],
  brandName: string,
  formatCnpj: (value?: string | null) => string,
): string {
  if (config?.footerText) return config.footerText;
  const companyName = merchant?.companyName || brandName;
  const cnpjSuffix = merchant?.cnpj ? ` - CNPJ: ${formatCnpj(merchant.cnpj)}` : '';
  return `Copyright ${new Date().getFullYear()} ${companyName}${cnpjSuffix}`;
}

function resolveSupportedMethods(
  config: DerivedStateArgs['config'],
  paymentProvider: DerivedStateArgs['paymentProvider'],
) {
  return {
    supportsCard:
      config?.enableCreditCard !== false && paymentProvider?.supportsCreditCard !== false,
    supportsPix: config?.enablePix !== false && paymentProvider?.supportsPix !== false,
    supportsBoleto: config?.enableBoleto === true && paymentProvider?.supportsBoleto !== false,
  };
}

function buildDerivedPricing(
  total: number,
  payMethod: DerivedStateArgs['payMethod'],
  installments: number,
  paymentProvider: DerivedStateArgs['paymentProvider'],
) {
  return buildCheckoutPricing({
    baseTotalInCents: total,
    paymentMethod: payMethod === 'card' ? 'credit' : payMethod,
    installments,
    installmentInterestMonthlyPercent: paymentProvider?.installmentInterestMonthlyPercent ?? 3.99,
  });
}

function buildDerivedFooter(
  config: DerivedStateArgs['config'],
  merchant: DerivedStateArgs['merchant'],
  brandName: string,
  helpers: DerivedStateArgs['helpers'],
) {
  return {
    footerPrimary: helpers.buildFooterPrimaryLine(brandName, merchant),
    footerSecondary: merchant?.addressLine || '',
    footerLegal: buildDerivedFooterLegal(config, merchant, brandName, helpers.formatCnpj),
  };
}

function buildDerivedHeader(config: DerivedStateArgs['config']) {
  return {
    headerPrimary: config?.headerMessage || 'Envio Imediato após o Pagamento',
    headerSecondary: config?.headerSubMessage || 'OFERTA ESPECIAL DO MÊS!!!',
    popupCouponCode: String(config?.autoCouponCode || '')
      .trim()
      .toUpperCase(),
  };
}

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
  const { fmt, normalizeTestimonials } = helpers;
  const productName =
    config?.productDisplayName || plan?.name || product?.name || defaults.product.name;
  const brandName = resolveDerivedBrandName(config, merchant, product, defaults);
  const unitPriceInCents = Math.max(
    0,
    Math.round(Number(plan?.priceInCents || defaults.product.priceInCents)),
  );
  const { shippingMode, variableShippingFloorInCents, shippingInCents } = deriveShipping(
    config,
    plan,
    dynamicShippingInCents,
  );
  const { supportsCard, supportsPix, supportsBoleto } = resolveSupportedMethods(
    config,
    paymentProvider,
  );
  const productImage = resolveDerivedProductImage(config, product);
  const checkoutUnavailableReason = resolveDerivedUnavailableReason(paymentProvider);
  const testimonials = normalizeTestimonials(
    brandName,
    defaults.testimonials,
    config?.testimonials,
    config?.enableTestimonials,
  );
  const subtotal = unitPriceInCents * qty;
  const total = Math.max(0, subtotal + shippingInCents - discount);
  const installments = Math.max(1, Number.parseInt(form.installments || '1', 10) || 1);
  const pricing = buildDerivedPricing(total, payMethod, installments, paymentProvider);
  const totalWithInterest = payMethod === 'card' ? pricing.chargedTotalInCents : total;
  const installmentOptions = buildDerivedInstallmentOptions(total, plan, paymentProvider, fmt);
  const { footerPrimary, footerSecondary, footerLegal } = buildDerivedFooter(
    config,
    merchant,
    brandName,
    helpers,
  );
  const { headerPrimary, headerSecondary, popupCouponCode } = buildDerivedHeader(config);
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
    mobileCanOpenStep1: step > 1,
    mobileCanOpenStep2: step > 2,
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

/**
 * Normalize an incoming coupon code (explicit > current state), uppercased and trimmed.
 * Returns an empty string when neither source yielded a usable code.
 */
export function resolveCheckoutCouponCode(currentCode: string, explicitCode?: string) {
  return String(explicitCode || currentCode || '')
    .trim()
    .toUpperCase();
}

/**
 * Pure precondition check for finalize-order. Returns the first error encountered
 * (so the hook can set submitError / bounce the user back) or null when every
 * precondition holds. Kept as a small data-only function to tame the cyclomatic
 * complexity of the orchestrator.
 */
interface FinalizeOrderPrecheckInput {
  identityValid: boolean;
  addressValid: boolean;
  hasWorkspaceAndPlan: boolean;
  checkoutUnavailableReason: string;
  payMethod: 'card' | 'pix' | 'boleto';
  supportsCard: boolean;
  supportsPix: boolean;
  supportsBoleto: boolean;
  cpfDigits: number;
}

type PrecheckError = { message: string; targetStep?: 1 | 2 };

const PRECHECK_IDENTITY_ERROR: PrecheckError = {
  message: 'Revise os dados pessoais antes de finalizar.',
  targetStep: 1,
};
const PRECHECK_ADDRESS_ERROR: PrecheckError = {
  message: 'Revise o endereço antes de finalizar.',
  targetStep: 2,
};
const PRECHECK_NO_WORKSPACE_ERROR: PrecheckError = {
  message: 'Checkout sem vínculo com workspace ou plano.',
};
const PRECHECK_METHOD_ERROR: PrecheckError = {
  message: 'Forma de pagamento indisponível neste checkout.',
};
const PRECHECK_BOLETO_CPF_ERROR: PrecheckError = {
  message: 'CPF válido é obrigatório para gerar boleto.',
};

function isPayMethodUnsupported(input: FinalizeOrderPrecheckInput): boolean {
  const method = input.payMethod;
  if (method === 'card') return !input.supportsCard;
  if (method === 'pix') return !input.supportsPix;
  return !input.supportsBoleto;
}

function findFinalizePrecheckError(
  input: FinalizeOrderPrecheckInput,
): PrecheckError | null {
  if (!input.identityValid) return PRECHECK_IDENTITY_ERROR;
  if (!input.addressValid) return PRECHECK_ADDRESS_ERROR;
  if (!input.hasWorkspaceAndPlan) return PRECHECK_NO_WORKSPACE_ERROR;
  if (input.checkoutUnavailableReason) {
    return { message: input.checkoutUnavailableReason };
  }
  if (isPayMethodUnsupported(input)) return PRECHECK_METHOD_ERROR;
  if (input.payMethod === 'boleto' && input.cpfDigits < 11) {
    return PRECHECK_BOLETO_CPF_ERROR;
  }
  return null;
}

export function computeFinalizeOrderPrecheckError(
  input: FinalizeOrderPrecheckInput,
): PrecheckError | null {
  return findFinalizePrecheckError(input);
}
