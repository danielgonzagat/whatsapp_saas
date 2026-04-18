'use client';

import { checkoutPublicApi } from '@/lib/api/misc';
import { buildCheckoutPricing } from '@/lib/checkout-pricing';
import type {
  CheckoutDisplayTestimonial,
  PublicCheckoutConfig,
  PublicCheckoutMerchantInfo,
  PublicCheckoutThemeProps,
} from '@/lib/public-checkout-contract';
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
  const [form, setForm] = useState({
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
  });

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
      ? product.images.find((entry) => typeof entry === 'string' && entry.trim())
      : '');
  const checkoutUnavailableReason =
    paymentProvider?.checkoutEnabled === false
      ? paymentProvider.unavailableReason || 'Conecte sua conta Stripe para começar a vender.'
      : '';
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
    `© ${new Date().getFullYear()} ${merchant?.companyName || brandName}${merchant?.cnpj ? ` - CNPJ: ${formatCnpj(merchant.cnpj)}` : ''}`;
  const mobileCanOpenStep1 = step > 1;
  const mobileCanOpenStep2 = step > 2;
  const headerPrimary = config?.headerMessage || 'Envio Imediato após o Pagamento';
  const headerSecondary = config?.headerSubMessage || 'OFERTA ESPECIAL DO MÊS!!!';

  useEffect(() => {
    const availableMethods = [
      supportsCard ? 'card' : null,
      supportsPix ? 'pix' : null,
      supportsBoleto ? 'boleto' : null,
    ].filter(Boolean) as Array<'card' | 'pix' | 'boleto'>;

    if (availableMethods.length > 0 && !availableMethods.includes(payMethod)) {
      setPayMethod(availableMethods[0]);
    }
  }, [payMethod, supportsBoleto, supportsCard, supportsPix]);

  useEffect(
    () => () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!couponApplied) return;
    setCouponApplied(false);
    setDiscount(0);
  }, [qty]);

  useEffect(() => {
    if (shippingMode !== 'VARIABLE') {
      setDynamicShippingInCents(null);
      setDynamicShippingLoading(false);
      return;
    }

    const cepDigits = form.cep.replace(D_RE, '').slice(0, 8);
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
        if (cancelled) return;
        const options = response?.data?.options || [];
        const nextPrice = Math.max(
          0,
          Math.round(Number(options[0]?.price || variableShippingFloorInCents)),
        );
        setDynamicShippingInCents(nextPrice);
      })
      .catch(() => {
        if (cancelled) return;
        setDynamicShippingInCents(variableShippingFloorInCents);
      })
      .finally(() => {
        if (cancelled) return;
        setDynamicShippingLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [form.cep, shippingMode, slug, variableShippingFloorInCents]);

  useEffect(() => {
    if (!couponPopupEligible || couponApplied || couponPopupHandled) return;
    const timer = window.setTimeout(
      () => {
        setCouponCode(popupCouponCode);
        setCouponError('');
        setShowCouponPopup(true);
      },
      Math.max(600, Number(config?.couponPopupDelay || 1800)),
    );

    return () => window.clearTimeout(timer);
  }, [
    config?.couponPopupDelay,
    couponApplied,
    couponPopupEligible,
    couponPopupHandled,
    popupCouponCode,
  ]);

  const updateField = useCallback(
    (field: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      let value = e.target.value;
      if (field === 'cpf' || field === 'cardCpf') value = fmt.cpf(value);
      if (field === 'phone') value = fmt.phone(value);
      if (field === 'cep') value = fmt.cep(value);
      if (field === 'cardNumber') value = fmt.card(value);
      if (field === 'cardExp') value = fmt.exp(value);
      if (field === 'cardCvv') value = value.replace(D_RE, '').slice(0, 4);
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    [fmt],
  );

  const validateStep1 = useCallback(() => {
    if (!form.name.trim() || !form.email.trim()) return false;
    if ((config?.requireCPF ?? true) && form.cpf.replace(D_RE, '').length < 11) return false;
    if ((config?.requirePhone ?? true) && form.phone.replace(D_RE, '').length < 10) return false;
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

  const applyCoupon = useCallback(
    async (explicitCode?: string) => {
      setCouponError('');
      if (config?.enableCoupon === false) return false;
      const nextCode = String(explicitCode || couponCode || '')
        .trim()
        .toUpperCase();
      if (!nextCode) {
        setCouponError('Digite um cupom.');
        return false;
      }
      if (!workspaceId || !plan?.id) {
        setCouponError('Checkout sem contexto para validar cupom.');
        return false;
      }
      try {
        const result = await validateCoupon(workspaceId, nextCode, plan.id, subtotal);
        if (!result.valid) {
          setCouponApplied(false);
          setDiscount(0);
          setCouponError(result.message || 'Cupom inválido ou expirado.');
          return false;
        }
        setDiscount(Math.max(0, Math.round(Number(result.discountAmount || 0))));
        setCouponApplied(true);
        setCouponCode((result.code || nextCode).toUpperCase());
        setCouponPopupHandled(true);
        setShowCouponPopup(false);
        return true;
      } catch (error) {
        setCouponApplied(false);
        setDiscount(0);
        setCouponError(error instanceof Error ? error.message : 'Cupom inválido ou expirado.');
        return false;
      }
    },
    [config?.enableCoupon, couponCode, plan?.id, subtotal, workspaceId],
  );

  const resolveSuccessRedirect = useCallback(
    (result: Record<string, unknown>) => {
      const data = result?.data as Record<string, unknown> | undefined;
      const orderId = result?.id || data?.id;
      if (!orderId) return null;
      if (payMethod === 'pix') return `/order/${orderId}/pix`;
      if (payMethod === 'boleto') return `/order/${orderId}/boleto`;
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

  const finalizeOrder = useCallback(async () => {
    setSubmitError('');

    if (!validateStep1()) {
      setSubmitError('Revise os dados pessoais antes de finalizar.');
      setStep(1);
      return;
    }

    if (!validateStep2()) {
      setSubmitError('Revise o endereço antes de finalizar.');
      setStep(2);
      return;
    }

    if (!workspaceId || !plan?.id) {
      setSubmitError('Checkout sem vínculo com workspace ou plano.');
      return;
    }

    if (checkoutUnavailableReason) {
      setSubmitError(checkoutUnavailableReason);
      return;
    }

    if (payMethod === 'card' && !supportsCard) {
      setSubmitError('Cartão indisponível neste checkout.');
      return;
    }

    if (payMethod === 'pix' && !supportsPix) {
      setSubmitError('Pix indisponível neste checkout.');
      return;
    }

    if (payMethod === 'boleto' && !supportsBoleto) {
      setSubmitError('Boleto indisponível neste checkout.');
      return;
    }

    if (payMethod === 'boleto' && form.cpf.replace(D_RE, '').length < 11) {
      setSubmitError('CPF válido é obrigatório para gerar boleto.');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload: CreateOrderData = {
        planId: plan.id,
        workspaceId,
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
        shippingMethod:
          shippingMode === 'VARIABLE'
            ? 'kloel-variable'
            : shippingInCents > 0
              ? 'standard'
              : 'free',
        shippingPrice: shippingInCents,
        orderQuantity: qty,
        subtotalInCents: subtotal,
        discountInCents: discount,
        totalInCents: total,
        couponCode: couponApplied ? couponCode : undefined,
        couponDiscount: couponApplied ? discount : undefined,
        paymentMethod:
          payMethod === 'card' ? 'CREDIT_CARD' : payMethod === 'pix' ? 'PIX' : 'BOLETO',
        installments: payMethod === 'card' ? installments : 1,
        affiliateId: affiliateContext?.affiliateWorkspaceId,
      };

      if (payMethod === 'card') {
        payload.cardHolderName = form.cardName || form.name;
      }

      const result = (await createOrder(payload)) as Record<string, unknown>;
      setPixelEvent('Purchase');

      const successPath = resolveSuccessRedirect(result);
      if (!successPath) {
        throw new Error('Pedido criado sem rota de continuidade.');
      }

      if (payMethod === 'card') {
        const resultData = result?.data as Record<string, unknown> | undefined;
        setSuccessOrderNumber(String(result?.orderNumber || resultData?.orderNumber || ''));
        setShowSuccess(true);
        redirectTimer.current = window.setTimeout(() => {
          window.location.href = successPath;
        }, 1200);
      } else {
        window.location.href = successPath;
      }
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Erro ao processar o checkout. Tente novamente.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    affiliateContext?.affiliateWorkspaceId,
    checkoutCode,
    checkoutUnavailableReason,
    couponApplied,
    couponCode,
    discount,
    form.cardCpf,
    form.cardCvv,
    form.cardExp,
    form.cardName,
    form.cardNumber,
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
    paymentProvider?.provider,
    plan?.id,
    qty,
    resolveSuccessRedirect,
    shippingInCents,
    shippingMode,
    subtotal,
    supportsCard,
    supportsBoleto,
    supportsPix,
    total,
    validateStep1,
    validateStep2,
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
