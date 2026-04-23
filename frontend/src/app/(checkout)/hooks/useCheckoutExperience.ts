'use client';

import { checkoutPublicApi } from '@/lib/api/misc';
import { buildCheckoutPricing } from '@/lib/checkout-pricing';
import type {
  CheckoutDisplayTestimonial,
  PublicCheckoutConfig,
  PublicCheckoutMerchantInfo,
  PublicCheckoutThemeProps,
} from '@/lib/public-checkout-contract';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { type CreateOrderData, createOrder, validateCoupon } from './useCheckout';

const D_RE = /\D/g;

type Formatters = {
  cpf: (value: string) => string;
  phone: (value: string) => string;
  cep: (value: string) => string;
  card: (value: string) => string;
  exp: (value: string) => string;
  brl: (cents: number) => string;
};

type CheckoutExperienceFormState = {
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

type CheckoutFormDraft = {
  version: number;
  savedAt: string;
  form: CheckoutExperienceFormState;
  payMethod: 'card' | 'pix' | 'boleto';
  qty: number;
  couponCode: string;
};

const CHECKOUT_FORM_DRAFT_VERSION = 1;
const EMPTY_CHECKOUT_EXPERIENCE_FORM: CheckoutExperienceFormState = {
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

function buildCheckoutFormDraftKey(slug?: string, checkoutCode?: string, planId?: string): string {
  return `kloel:checkout-form-draft:${slug || checkoutCode || planId || 'public'}`;
}

function sanitizeCheckoutFormDraft(form: CheckoutExperienceFormState): CheckoutExperienceFormState {
  return {
    ...form,
    cardNumber: '',
    cardExp: '',
    cardCvv: '',
  };
}

function readCheckoutFormDraft(raw: string | null): CheckoutFormDraft | null {
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

type UseCheckoutExperienceOptions = PublicCheckoutThemeProps & {
  defaults: {
    product: {
      name: string;
      priceInCents: number;
      brand: string;
    };
    testimonials: CheckoutDisplayTestimonial[];
  };
  helpers: {
    fmt: Formatters;
    normalizeTestimonials: (
      brandName: string,
      testimonials: PublicCheckoutConfig['testimonials'],
      enabled: boolean | undefined,
    ) => CheckoutDisplayTestimonial[];
    buildFooterPrimaryLine: (brandName: string, merchant?: PublicCheckoutMerchantInfo) => string;
    formatCnpj: (value?: string | null) => string;
  };
};

type ShippingMode = 'FREE' | 'FIXED' | 'VARIABLE' | string;

function resolveShippingMode(
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

function computeShippingInCents(
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

function resolveProductImage(
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

function resolveCheckoutUnavailableReason(
  paymentProvider: UseCheckoutExperienceOptions['paymentProvider'],
): string {
  if (paymentProvider?.checkoutEnabled !== false) {
    return '';
  }
  return paymentProvider.unavailableReason || 'Conecte sua conta Stripe para começar a vender.';
}

function applyFieldFormatter(field: string, raw: string, fmt: Formatters): string {
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

function resolvePaymentMethodCode(
  method: 'card' | 'pix' | 'boleto',
): 'CREDIT_CARD' | 'PIX' | 'BOLETO' {
  if (method === 'card') {
    return 'CREDIT_CARD';
  }
  return method === 'pix' ? 'PIX' : 'BOLETO';
}

function resolveShippingMethodLabel(shippingMode: ShippingMode, shippingInCents: number): string {
  if (shippingMode === 'VARIABLE') {
    return 'kloel-variable';
  }
  return shippingInCents > 0 ? 'standard' : 'free';
}

type PreflightContext = {
  validateStep1: () => boolean;
  validateStep2: () => boolean;
  workspaceId: string | undefined;
  planId: string | undefined;
  checkoutUnavailableReason: string;
  payMethod: 'card' | 'pix' | 'boleto';
  supportsCard: boolean;
  supportsPix: boolean;
  supportsBoleto: boolean;
  cpf: string;
};

type PreflightOutcome = { error: string; step?: 1 | 2 } | null;

function useAutoSelectAvailablePayMethod(
  payMethod: 'card' | 'pix' | 'boleto',
  supports: { card: boolean; pix: boolean; boleto: boolean },
  setPayMethod: (next: 'card' | 'pix' | 'boleto') => void,
): void {
  useEffect(() => {
    const availableMethods = [
      supports.card ? 'card' : null,
      supports.pix ? 'pix' : null,
      supports.boleto ? 'boleto' : null,
    ].filter(Boolean) as Array<'card' | 'pix' | 'boleto'>;

    if (availableMethods.length > 0 && !availableMethods.includes(payMethod)) {
      setPayMethod(availableMethods[0]);
    }
  }, [payMethod, supports.boleto, supports.card, supports.pix, setPayMethod]);
}

function useRedirectTimerCleanup(redirectTimer: { current: number | null }): void {
  useEffect(
    () => () => {
      if (redirectTimer.current) {
        clearTimeout(redirectTimer.current);
      }
    },
    [redirectTimer],
  );
}

function useResetCouponOnQtyChange(
  qty: number,
  couponApplied: boolean,
  setCouponApplied: (v: boolean) => void,
  setDiscount: (v: number) => void,
): void {
  const couponAppliedRef = useRef(couponApplied);

  useEffect(() => {
    couponAppliedRef.current = couponApplied;
  }, [couponApplied]);

  useEffect(() => {
    if (!couponAppliedRef.current) {
      return;
    }
    setCouponApplied(false);
    setDiscount(0);
  }, [qty, setCouponApplied, setDiscount]);
}

type VariableShippingParams = {
  shippingMode: ShippingMode;
  cep: string;
  slug: string | undefined;
  variableShippingFloorInCents: number;
  setDynamicShippingInCents: (v: number | null) => void;
  setDynamicShippingLoading: (v: boolean) => void;
};

function useVariableShippingCalculation(params: VariableShippingParams): void {
  const {
    shippingMode,
    cep,
    slug,
    variableShippingFloorInCents,
    setDynamicShippingInCents,
    setDynamicShippingLoading,
  } = params;

  useEffect(() => {
    if (shippingMode !== 'VARIABLE') {
      setDynamicShippingInCents(null);
      setDynamicShippingLoading(false);
      return;
    }

    const cepDigits = cep.replace(D_RE, '').slice(0, 8);
    if (cepDigits.length < 8 || !slug) {
      setDynamicShippingInCents(variableShippingFloorInCents);
      setDynamicShippingLoading(false);
      return;
    }

    let cancelled = false;
    setDynamicShippingLoading(true);

    checkoutPublicApi
      .calculateShipping({ slug, cep: cepDigits })
      .then((response) => {
        if (cancelled) {
          return;
        }
        const options = response?.data?.options || [];
        const nextPrice = Math.max(
          0,
          Math.round(Number(options[0]?.price || variableShippingFloorInCents)),
        );
        setDynamicShippingInCents(nextPrice);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setDynamicShippingInCents(variableShippingFloorInCents);
      })
      .finally(() => {
        if (cancelled) {
          return;
        }
        setDynamicShippingLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    cep,
    shippingMode,
    slug,
    variableShippingFloorInCents,
    setDynamicShippingInCents,
    setDynamicShippingLoading,
  ]);
}

type StringSetter = (value: string) => void;
type BooleanSetter = (value: boolean) => void;

type CouponPopupTimerParams = {
  eligible: boolean;
  couponApplied: boolean;
  couponPopupHandled: boolean;
  popupCouponCode: string;
  delay: number | undefined;
  setCouponCode: StringSetter;
  setCouponError: StringSetter;
  setShowCouponPopup: BooleanSetter;
};

function resolveCouponPopupDelay(delay: number | undefined): number {
  return Math.max(600, Number(delay || 1800));
}

function useCouponPopupTimer(params: CouponPopupTimerParams): void {
  const eligible = params.eligible;
  const couponApplied = params.couponApplied;
  const couponPopupHandled = params.couponPopupHandled;
  const popupCouponCode = params.popupCouponCode;
  const delay = params.delay;
  const setCouponCode = params.setCouponCode;
  const setCouponError = params.setCouponError;
  const setShowCouponPopup = params.setShowCouponPopup;

  const scheduleCouponPopup = () => {
    if (!eligible || couponApplied || couponPopupHandled) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setCouponCode(popupCouponCode);
      setCouponError('');
      setShowCouponPopup(true);
    }, resolveCouponPopupDelay(delay));
    return () => window.clearTimeout(timer);
  };

  useEffect(scheduleCouponPopup, [
    delay,
    couponApplied,
    eligible,
    couponPopupHandled,
    popupCouponCode,
    setCouponCode,
    setCouponError,
    setShowCouponPopup,
  ]);
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

function preflightFinalizeOrder(ctx: PreflightContext): PreflightOutcome {
  for (const rule of PREFLIGHT_RULES) {
    const outcome = rule(ctx);
    if (outcome) {
      return outcome;
    }
  }
  return null;
}

/** Use checkout experience. */
export function useCheckoutExperience({
  product,
  config,
  plan,
  slug,
  workspaceId,
  checkoutCode,
  paymentProvider,
  affiliateContext,
  merchant,
  defaults,
  helpers,
}: UseCheckoutExperienceOptions) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponApplied, setCouponApplied] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [payMethod, setPayMethod] = useState<'card' | 'pix' | 'boleto'>('card');
  const [showSuccess, setShowSuccess] = useState(false);
  const [successOrderNumber, setSuccessOrderNumber] = useState('');
  const [qty, setQty] = useState(1);
  const [loadingStep, setLoadingStep] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [couponError, setCouponError] = useState('');
  const [showCouponPopup, setShowCouponPopup] = useState(false);
  const [couponPopupHandled, setCouponPopupHandled] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [dynamicShippingInCents, setDynamicShippingInCents] = useState<number | null>(null);
  const [dynamicShippingLoading, setDynamicShippingLoading] = useState(false);
  const [pixelEvent, setPixelEvent] = useState<
    'InitiateCheckout' | 'AddPaymentInfo' | 'Purchase' | null
  >(null);
  const redirectTimer = useRef<number | null>(null);
  const [form, setForm] = useState<CheckoutExperienceFormState>(EMPTY_CHECKOUT_EXPERIENCE_FORM);

  const { fmt, normalizeTestimonials, buildFooterPrimaryLine, formatCnpj } = helpers;
  const checkoutFormDraftKey = useMemo(
    () => buildCheckoutFormDraftKey(slug, checkoutCode, plan?.id),
    [checkoutCode, plan?.id, slug],
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const savedDraft = readCheckoutFormDraft(window.localStorage.getItem(checkoutFormDraftKey));
    if (!savedDraft) {
      return;
    }
    setForm((prev) => ({ ...prev, ...savedDraft.form }));
    setPayMethod(savedDraft.payMethod);
    setQty(savedDraft.qty);
    setCouponCode(savedDraft.couponCode);
  }, [checkoutFormDraftKey]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const payload: CheckoutFormDraft = {
      version: CHECKOUT_FORM_DRAFT_VERSION,
      savedAt: new Date().toISOString(),
      form: sanitizeCheckoutFormDraft(form),
      payMethod,
      qty,
      couponCode,
    };
    window.localStorage.setItem(checkoutFormDraftKey, JSON.stringify(payload));
  }, [checkoutFormDraftKey, couponCode, form, payMethod, qty]);

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
  const shippingMode = resolveShippingMode(config, plan);
  const fixedShippingInCents = Math.max(0, Math.round(Number(plan?.shippingPrice || 0)));
  const variableShippingFloorInCents = Math.max(
    0,
    Math.round(Number(config?.shippingVariableMinInCents || 0)),
  );
  const shippingInCents = computeShippingInCents(
    shippingMode,
    fixedShippingInCents,
    variableShippingFloorInCents,
    dynamicShippingInCents,
  );
  const supportsCard =
    config?.enableCreditCard !== false && paymentProvider?.supportsCreditCard !== false;
  const supportsPix = config?.enablePix !== false && paymentProvider?.supportsPix !== false;
  const supportsBoleto = config?.enableBoleto === true && paymentProvider?.supportsBoleto !== false;
  const productImage = resolveProductImage(config, product);
  const checkoutUnavailableReason = resolveCheckoutUnavailableReason(paymentProvider);
  const testimonials = useMemo(
    () =>
      normalizeTestimonials(
        brandName,
        config?.testimonials?.length ? config.testimonials : defaults.testimonials,
        config?.enableTestimonials,
      ),
    [
      brandName,
      config?.enableTestimonials,
      config?.testimonials,
      defaults.testimonials,
      normalizeTestimonials,
    ],
  );
  const pixels = config?.pixels || [];
  const subtotal = unitPriceInCents * qty;
  const total = Math.max(0, subtotal + shippingInCents - discount);
  const installments = Math.max(1, Number.parseInt(form.installments || '1', 10) || 1);
  const popupCouponCode = String(config?.autoCouponCode || '')
    .trim()
    .toUpperCase();
  const couponPopupEligible =
    config?.enableCoupon !== false && config?.showCouponPopup === true && Boolean(popupCouponCode);
  const pricing = useMemo(
    () =>
      buildCheckoutPricing({
        baseTotalInCents: total,
        paymentMethod: payMethod === 'card' ? 'credit' : payMethod,
        installments,
        installmentInterestMonthlyPercent:
          paymentProvider?.installmentInterestMonthlyPercent ?? 3.99,
      }),
    [installments, payMethod, paymentProvider?.installmentInterestMonthlyPercent, total],
  );
  const totalWithInterest = payMethod === 'card' ? pricing.chargedTotalInCents : total;
  const installmentOptions = useMemo(() => {
    const maxInstallments = Math.max(1, Math.min(Number(plan?.maxInstallments || 12), 12));
    return Array.from({ length: maxInstallments }, (_, index) => {
      const value = index + 1;
      const optionPricing = buildCheckoutPricing({
        baseTotalInCents: total,
        paymentMethod: 'credit',
        installments: value,
        installmentInterestMonthlyPercent:
          paymentProvider?.installmentInterestMonthlyPercent ?? 3.99,
      });
      return {
        value,
        label:
          value === 1
            ? `1x de ${fmt.brl(optionPricing.chargedTotalInCents)} sem juros`
            : `${value}x de ${fmt.brl(optionPricing.perInstallmentInCents)}`,
      };
    });
  }, [fmt, paymentProvider?.installmentInterestMonthlyPercent, plan?.maxInstallments, total]);

  const footerPrimary = buildFooterPrimaryLine(brandName, merchant);
  const footerSecondary = merchant?.addressLine || '';
  const footerLegal =
    config?.footerText ||
    `Copyright ${new Date().getFullYear()} ${merchant?.companyName || brandName}${merchant?.cnpj ? ` - CNPJ: ${formatCnpj(merchant.cnpj)}` : ''}`;
  const mobileCanOpenStep1 = step > 1;
  const mobileCanOpenStep2 = step > 2;
  const headerPrimary = config?.headerMessage || 'Envio Imediato após o Pagamento';
  const headerSecondary = config?.headerSubMessage || 'OFERTA ESPECIAL DO MÊS!!!';

  useAutoSelectAvailablePayMethod(
    payMethod,
    { card: supportsCard, pix: supportsPix, boleto: supportsBoleto },
    setPayMethod,
  );
  useRedirectTimerCleanup(redirectTimer);
  useResetCouponOnQtyChange(qty, couponApplied, setCouponApplied, setDiscount);
  useVariableShippingCalculation({
    shippingMode,
    cep: form.cep,
    slug,
    variableShippingFloorInCents,
    setDynamicShippingInCents,
    setDynamicShippingLoading,
  });
  useCouponPopupTimer({
    eligible: couponPopupEligible,
    couponApplied,
    couponPopupHandled,
    popupCouponCode,
    delay: config?.couponPopupDelay,
    setCouponCode,
    setCouponError,
    setShowCouponPopup,
  });

  const updateField = useCallback(
    (field: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = applyFieldFormatter(field, e.target.value, fmt);
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    [fmt],
  );

  const validateStep1 = useCallback(() => {
    if (!form.name.trim() || !form.email.trim()) {
      return false;
    }
    if ((config?.requireCPF ?? true) && form.cpf.replace(D_RE, '').length < 11) {
      return false;
    }
    if ((config?.requirePhone ?? true) && form.phone.replace(D_RE, '').length < 10) {
      return false;
    }
    return true;
  }, [config?.requireCPF, config?.requirePhone, form.cpf, form.email, form.name, form.phone]);

  const validateStep2 = useCallback(() => {
    return Boolean(
      form.cep.trim() &&
      form.street.trim() &&
      form.number.trim() &&
      form.neighborhood.trim() &&
      form.city.trim() &&
      form.state.trim(),
    );
  }, [form.cep, form.city, form.neighborhood, form.number, form.state, form.street]);

  const goStep = useCallback(
    (target: number) => {
      if (target === 1 && mobileCanOpenStep1) {
        setStep(1);
        return;
      }
      if (target === 2) {
        if (step === 1) {
          if (!validateStep1()) {
            setSubmitError('Preencha nome, e-mail, CPF e WhatsApp para continuar.');
            return;
          }
          setSubmitError('');
          setLoadingStep(true);
          setPixelEvent('InitiateCheckout');
          window.setTimeout(() => {
            setStep(2);
            setLoadingStep(false);
          }, 600);
          return;
        }
        if (mobileCanOpenStep2) {
          setStep(2);
        }
        return;
      }
      if (target === 3) {
        if (!validateStep2()) {
          setSubmitError('Preencha o endereço completo para continuar ao pagamento.');
          return;
        }
        setSubmitError('');
        setPixelEvent('AddPaymentInfo');
        setStep(3);
      }
    },
    [mobileCanOpenStep1, mobileCanOpenStep2, step, validateStep1, validateStep2],
  );

  const resolveCouponCodeForSubmission = useCallback(
    (explicitCode?: string) => {
      return String(explicitCode || couponCode || '')
        .trim()
        .toUpperCase();
    },
    [couponCode],
  );

  const handleCouponFailure = useCallback((message: string) => {
    setCouponApplied(false);
    setDiscount(0);
    setCouponError(message);
  }, []);

  const handleCouponSuccess = useCallback(
    (nextCode: string, result: Awaited<ReturnType<typeof validateCoupon>>) => {
      setDiscount(Math.max(0, Math.round(Number(result.discountAmount || 0))));
      setCouponApplied(true);
      setCouponCode((result.code || nextCode).toUpperCase());
      setCouponPopupHandled(true);
      setShowCouponPopup(false);
    },
    [],
  );

  const validateCouponPrerequisites = useCallback(
    (nextCode: string): string | null => {
      if (!nextCode) {
        return 'Digite um cupom.';
      }
      if (!workspaceId || !plan?.id) {
        return 'Checkout sem contexto para validar cupom.';
      }
      return null;
    },
    [plan?.id, workspaceId],
  );

  const runCouponValidation = useCallback(
    async (nextCode: string): Promise<boolean> => {
      try {
        const result = await validateCoupon(
          workspaceId as string,
          nextCode,
          plan?.id as string,
          subtotal,
        );
        if (!result.valid) {
          handleCouponFailure(result.message || 'Cupom inválido ou expirado.');
          return false;
        }
        handleCouponSuccess(nextCode, result);
        return true;
      } catch (error) {
        handleCouponFailure(error instanceof Error ? error.message : 'Cupom inválido ou expirado.');
        return false;
      }
    },
    [handleCouponFailure, handleCouponSuccess, plan?.id, subtotal, workspaceId],
  );

  const applyCoupon = useCallback(
    async (explicitCode?: string) => {
      setCouponError('');
      if (config?.enableCoupon === false) {
        return false;
      }
      const nextCode = resolveCouponCodeForSubmission(explicitCode);
      const prerequisiteError = validateCouponPrerequisites(nextCode);
      if (prerequisiteError) {
        setCouponError(prerequisiteError);
        return false;
      }
      return runCouponValidation(nextCode);
    },
    [
      config?.enableCoupon,
      resolveCouponCodeForSubmission,
      runCouponValidation,
      validateCouponPrerequisites,
    ],
  );

  const resolveSuccessRedirect = useCallback(
    (result: Record<string, unknown>) => {
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
    },
    [payMethod],
  );

  const buildOrderPayload = useCallback(
    (resolvedPlanId: string, resolvedWorkspaceId: string): CreateOrderData => {
      const payload: CreateOrderData = {
        planId: resolvedPlanId,
        workspaceId: resolvedWorkspaceId,
        checkoutCode,
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
        shippingMethod: resolveShippingMethodLabel(shippingMode, shippingInCents),
        shippingPrice: shippingInCents,
        orderQuantity: qty,
        subtotalInCents: subtotal,
        discountInCents: discount,
        totalInCents: total,
        couponCode: couponApplied ? couponCode : undefined,
        couponDiscount: couponApplied ? discount : undefined,
        paymentMethod: resolvePaymentMethodCode(payMethod),
        installments: payMethod === 'card' ? installments : 1,
        affiliateId: affiliateContext?.affiliateWorkspaceId,
      };

      if (payMethod === 'card') {
        payload.cardHolderName = form.cardName || form.name;
      }
      return payload;
    },
    [
      affiliateContext?.affiliateWorkspaceId,
      checkoutCode,
      couponApplied,
      couponCode,
      discount,
      form.cardName,
      form.cep,
      form.city,
      form.complement,
      form.cpf,
      form.destinatario,
      form.email,
      form.name,
      form.neighborhood,
      form.number,
      form.phone,
      form.state,
      form.street,
      installments,
      payMethod,
      qty,
      shippingInCents,
      shippingMode,
      subtotal,
      total,
    ],
  );

  const dispatchOrderCompletion = useCallback(
    (result: Record<string, unknown>, successPath: string) => {
      // successPath is built locally by resolveSuccessRedirect() as `/order/${orderId}/...` —
      // always a same-origin relative path with orderId from our own backend response.
      if (payMethod === 'card') {
        const resultData = result?.data as Record<string, unknown> | undefined;
        window.localStorage.removeItem(checkoutFormDraftKey);
        setSuccessOrderNumber(String(result?.orderNumber || resultData?.orderNumber || ''));
        setShowSuccess(true);
        redirectTimer.current = window.setTimeout(() => {
          router.push(successPath);
        }, 1200);
        return;
      }
      window.localStorage.removeItem(checkoutFormDraftKey);
      router.push(successPath);
    },
    [checkoutFormDraftKey, payMethod, router],
  );

  const runPreflightForFinalize = useCallback((): PreflightOutcome => {
    return preflightFinalizeOrder({
      validateStep1,
      validateStep2,
      workspaceId,
      planId: plan?.id,
      checkoutUnavailableReason,
      payMethod,
      supportsCard,
      supportsPix,
      supportsBoleto,
      cpf: form.cpf,
    });
  }, [
    checkoutUnavailableReason,
    form.cpf,
    payMethod,
    plan?.id,
    supportsBoleto,
    supportsCard,
    supportsPix,
    validateStep1,
    validateStep2,
    workspaceId,
  ]);

  const finalizeOrder = useCallback(async () => {
    setSubmitError('');

    const preflight = runPreflightForFinalize();
    if (preflight) {
      setSubmitError(preflight.error);
      if (preflight.step) {
        setStep(preflight.step);
      }
      return;
    }

    // Safe after preflight: workspaceId and plan.id were asserted present.
    const resolvedPlanId = plan?.id as string;
    const resolvedWorkspaceId = workspaceId as string;

    setIsSubmitting(true);

    try {
      const payload = buildOrderPayload(resolvedPlanId, resolvedWorkspaceId);
      const result = (await createOrder(payload)) as Record<string, unknown>;
      setPixelEvent('Purchase');

      const successPath = resolveSuccessRedirect(result);
      if (!successPath) {
        throw new Error('Pedido criado sem rota de continuidade.');
      }

      dispatchOrderCompletion(result, successPath);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Erro ao processar o checkout. Tente novamente.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    buildOrderPayload,
    dispatchOrderCompletion,
    plan?.id,
    resolveSuccessRedirect,
    runPreflightForFinalize,
    workspaceId,
  ]);

  return {
    step,
    setStep,
    summaryOpen,
    setSummaryOpen,
    couponCode,
    setCouponCode,
    couponApplied,
    discount,
    payMethod,
    setPayMethod,
    showSuccess,
    successOrderNumber,
    qty,
    setQty,
    loadingStep,
    isSubmitting,
    couponError,
    showCouponPopup,
    setShowCouponPopup,
    setCouponPopupHandled,
    submitError,
    dynamicShippingLoading,
    pixelEvent,
    form,
    productName,
    brandName,
    unitPriceInCents,
    shippingInCents,
    supportsCard,
    supportsPix,
    supportsBoleto,
    productImage,
    checkoutUnavailableReason,
    testimonials,
    pixels,
    subtotal,
    total,
    pricing,
    totalWithInterest,
    installmentOptions,
    footerPrimary,
    footerSecondary,
    footerLegal,
    mobileCanOpenStep1,
    mobileCanOpenStep2,
    headerPrimary,
    headerSecondary,
    popupCouponCode,
    updateField,
    goStep,
    applyCoupon,
    finalizeOrder,
  };
}
