import { buildCheckoutPricing } from '@/lib/checkout-pricing';
import type {
  CheckoutExperienceFormState,
  CheckoutFormDraft,
  Formatters,
  PreflightContext,
  PreflightOutcome,
  ShippingMode,
  UseCheckoutExperienceOptions,
} from './useCheckoutExperience.types';

const D_RE = /\D/g;

export const CHECKOUT_FORM_DRAFT_VERSION = 1;

export const EMPTY_CHECKOUT_EXPERIENCE_FORM: CheckoutExperienceFormState = {
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

export function buildCheckoutFormDraftKey(
  slug?: string,
  checkoutCode?: string,
  planId?: string,
): string {
  return `kloel:checkout-form-draft:${slug || checkoutCode || planId || 'public'}`;
}

export function sanitizeCheckoutFormDraft(
  form: CheckoutExperienceFormState,
): CheckoutExperienceFormState {
  return { ...form, cardNumber: '', cardExp: '', cardCvv: '' };
}

export function readCheckoutFormDraft(raw: string | null): CheckoutFormDraft | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<CheckoutFormDraft>;
    if (parsed.version !== CHECKOUT_FORM_DRAFT_VERSION || !parsed.form) {
      return null;
    }
    return {
      version: CHECKOUT_FORM_DRAFT_VERSION,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
      form: sanitizeCheckoutFormDraft({
        ...EMPTY_CHECKOUT_EXPERIENCE_FORM,
        ...parsed.form,
      }),
      payMethod:
        parsed.payMethod === 'pix' || parsed.payMethod === 'boleto' ? parsed.payMethod : 'card',
      qty: Math.max(1, Number(parsed.qty || 1)),
      couponCode: typeof parsed.couponCode === 'string' ? parsed.couponCode : '',
    };
  } catch {
    return null;
  }
}

export function resolveShippingMode(
  config: UseCheckoutExperienceOptions['config'],
  plan: UseCheckoutExperienceOptions['plan'],
): ShippingMode {
  if (config?.shippingMode) {
    return config.shippingMode;
  }
  if (plan?.freeShipping) {
    return 'FREE';
  }
  return Number(plan?.shippingPrice || 0) > 0 ? 'FIXED' : 'FREE';
}

export function computeShippingInCents(
  shippingMode: ShippingMode,
  fixedShippingInCents: number,
  variableShippingFloorInCents: number,
  dynamicShippingInCents: number | null,
): number {
  if (shippingMode === 'VARIABLE') {
    return dynamicShippingInCents ?? variableShippingFloorInCents;
  }
  if (shippingMode === 'FIXED') {
    return fixedShippingInCents;
  }
  return 0;
}

export function resolveProductImage(
  config: UseCheckoutExperienceOptions['config'],
  product: UseCheckoutExperienceOptions['product'],
): string {
  if (config?.productImage) {
    return config.productImage;
  }
  if (product?.imageUrl) {
    return product.imageUrl;
  }
  if (Array.isArray(product?.images)) {
    return product.images.find((entry) => typeof entry === 'string' && entry.trim()) || '';
  }
  return '';
}

export function resolveCheckoutUnavailableReason(
  paymentProvider: UseCheckoutExperienceOptions['paymentProvider'],
): string {
  if (paymentProvider?.checkoutEnabled !== false) {
    return '';
  }
  return paymentProvider.unavailableReason || 'Conecte sua conta Stripe para começar a vender.';
}

export function applyFieldFormatter(field: string, raw: string, fmt: Formatters): string {
  if (field === 'cpf' || field === 'cardCpf') {
    return fmt.cpf(raw);
  }
  if (field === 'phone') {
    return fmt.phone(raw);
  }
  if (field === 'cep') {
    return fmt.cep(raw);
  }
  if (field === 'cardNumber') {
    return fmt.card(raw);
  }
  if (field === 'cardExp') {
    return fmt.exp(raw);
  }
  if (field === 'cardCvv') {
    return raw.replace(D_RE, '').slice(0, 4);
  }
  return raw;
}

export function resolvePaymentMethodCode(
  method: 'card' | 'pix' | 'boleto',
): 'CREDIT_CARD' | 'PIX' | 'BOLETO' {
  if (method === 'card') {
    return 'CREDIT_CARD';
  }
  return method === 'pix' ? 'PIX' : 'BOLETO';
}

export function resolveShippingMethodLabel(
  shippingMode: ShippingMode,
  shippingInCents: number,
): string {
  if (shippingMode === 'VARIABLE') {
    return 'kloel-variable';
  }
  return shippingInCents > 0 ? 'standard' : 'free';
}

export function resolveCouponPopupDelay(delay: number | undefined): number {
  return Math.max(600, Number(delay || 1800));
}

const PAYMENT_UNAVAILABLE_MESSAGES = {
  card: 'Cartão indisponível neste checkout.',
  pix: 'Pix indisponível neste checkout.',
  boleto: 'Boleto indisponível neste checkout.',
} as const;

const PAYMENT_SUPPORT_KEYS = {
  card: 'supportsCard',
  pix: 'supportsPix',
  boleto: 'supportsBoleto',
} as const;

const PREFLIGHT_RULES: Array<(ctx: PreflightContext) => PreflightOutcome> = [
  (ctx) =>
    ctx.validateStep1() ? null : { error: 'Revise os dados pessoais antes de finalizar.', step: 1 },
  (ctx) =>
    ctx.validateStep2() ? null : { error: 'Revise o endereço antes de finalizar.', step: 2 },
  (ctx) =>
    ctx.workspaceId && ctx.planId
      ? null
      : { error: 'Checkout sem vínculo com workspace ou plano.' },
  (ctx) => (ctx.checkoutUnavailableReason ? { error: ctx.checkoutUnavailableReason } : null),
  (ctx) =>
    ctx[PAYMENT_SUPPORT_KEYS[ctx.payMethod]]
      ? null
      : { error: PAYMENT_UNAVAILABLE_MESSAGES[ctx.payMethod] },
  (ctx) =>
    ctx.payMethod === 'boleto' && ctx.cpf.replace(D_RE, '').length < 11
      ? { error: 'CPF válido é obrigatório para gerar boleto.' }
      : null,
];

export function preflightFinalizeOrder(ctx: PreflightContext): PreflightOutcome {
  for (const rule of PREFLIGHT_RULES) {
    const outcome = rule(ctx);
    if (outcome) {
      return outcome;
    }
  }
  return null;
}

/** Build installment option list for the checkout payment selector. */
export function buildInstallmentOptions(
  total: number,
  maxInstallments: number,
  installmentInterestMonthlyPercent: number,
  fmt: Formatters,
): { value: number; label: string }[] {
  return Array.from({ length: Math.max(1, Math.min(maxInstallments, 12)) }, (_, index) => {
    const value = index + 1;
    const pricing = buildCheckoutPricing({
      baseTotalInCents: total,
      paymentMethod: 'credit',
      installments: value,
      installmentInterestMonthlyPercent,
    });
    return {
      value,
      label:
        value === 1
          ? `1x de ${fmt.brl(pricing.chargedTotalInCents)} sem juros`
          : `${value}x de ${fmt.brl(pricing.perInstallmentInCents)}`,
    };
  });
}
