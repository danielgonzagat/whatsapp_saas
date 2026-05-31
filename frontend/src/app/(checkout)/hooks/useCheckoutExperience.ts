'use client';

import { buildCheckoutPricing } from '@/lib/checkout-pricing';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { type CreateOrderData, createOrder, validateCoupon } from './useCheckout';
import {
  useAutoSelectAvailablePayMethod,
  useCouponPopupTimer,
  useCheckoutFormDraftPersistence,
  useRedirectTimerCleanup,
  useResetCouponOnQtyChange,
  useVariableShippingCalculation,
} from './useCheckoutExperience.effects';
import type { UseCheckoutExperienceOptions } from './useCheckoutExperience.types';
import {
  isCouponFlowEnabled,
  normalizeCouponDiscountInCents,
  resolveAppliedCouponCode,
  resolveCouponCodeForSubmission as resolveCouponCodeForSubmissionHelper,
  resolveCouponErrorMessage,
  validateCouponPrerequisites as validateCouponPrerequisitesHelper,
} from './useCheckoutExperience.coupon.helpers';
import {
  buildOrderPayload as buildOrderPayloadHelper,
  computeSubtotal,
  computeTotal,
  isCouponPopupEligible,
  isStep1Valid,
  isStep2Valid,
  normalizePopupCouponCode,
  parseInstallments,
  resolveBrandName,
  resolveFixedShippingInCents,
  resolveFooterLegal,
  resolveHeaderPrimary,
  resolveHeaderSecondary,
  resolveProductName,
  resolveSubmitErrorMessage,
  resolveSuccessRedirect as resolveSuccessRedirectHelper,
  resolveUnitPriceInCents,
  resolveVariableShippingFloorInCents,
} from './useCheckoutExperience.helpers';
import { EMPTY_CHECKOUT_EXPERIENCE_FORM, applyFieldFormatter, buildCheckoutFormDraftKey, buildInstallmentOptions, computeShippingInCents, preflightFinalizeOrder, resolveCheckoutUnavailableReason, resolveProductImage, resolveShippingMode } from './useCheckoutExperience.utils';

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
  const [form, setForm] = useState(EMPTY_CHECKOUT_EXPERIENCE_FORM);

  const { fmt, normalizeTestimonials, buildFooterPrimaryLine, formatCnpj } = helpers;
  const checkoutFormDraftKey = useMemo(
    () => buildCheckoutFormDraftKey(slug, checkoutCode, plan?.id),
    [checkoutCode, plan?.id, slug],
  );

  useCheckoutFormDraftPersistence({
    checkoutFormDraftKey,
    form,
    payMethod,
    qty,
    couponCode,
    setForm,
    setPayMethod,
    setQty,
    setCouponCode,
  });

  const productName = resolveProductName(config, plan, product, defaults.product.name);
  const brandName = resolveBrandName(config, merchant, product, defaults.product.brand);
  const unitPriceInCents = resolveUnitPriceInCents(plan, defaults.product.priceInCents);
  const shippingMode = resolveShippingMode(config, plan);
  const fixedShippingInCents = resolveFixedShippingInCents(plan);
  const variableShippingFloorInCents = resolveVariableShippingFloorInCents(config);
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
  const subtotal = computeSubtotal(unitPriceInCents, qty);
  const total = computeTotal(subtotal, shippingInCents, discount);
  const installments = parseInstallments(form.installments);
  const popupCouponCode = normalizePopupCouponCode(config?.autoCouponCode);
  const couponPopupEligible = isCouponPopupEligible(config, popupCouponCode);
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
  const installmentOptions = useMemo(
    () =>
      buildInstallmentOptions(
        total,
        Math.max(1, Math.min(Number(plan?.maxInstallments || 12), 12)),
        paymentProvider?.installmentInterestMonthlyPercent ?? 3.99,
        fmt,
      ),
    [fmt, paymentProvider?.installmentInterestMonthlyPercent, plan?.maxInstallments, total],
  );

  const footerPrimary = buildFooterPrimaryLine(brandName, merchant);
  const footerSecondary = merchant?.addressLine || '';
  const footerLegal = resolveFooterLegal(
    config,
    merchant,
    brandName,
    formatCnpj,
    new Date().getFullYear(),
  );
  const mobileCanOpenStep1 = step > 1;
  const mobileCanOpenStep2 = step > 2;
  const headerPrimary = resolveHeaderPrimary(config);
  const headerSecondary = resolveHeaderSecondary(config);

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

  const validateStep1 = useCallback(
    () => isStep1Valid(form, config),
    [config, form],
  );

  const validateStep2 = useCallback(() => isStep2Valid(form), [form]);

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

  const handleCouponFailure = useCallback((message: string) => {
    setCouponApplied(false);
    setDiscount(0);
    setCouponError(message);
  }, []);

  const handleCouponSuccess = useCallback(
    (nextCode: string, result: Awaited<ReturnType<typeof validateCoupon>>) => {
      setDiscount(normalizeCouponDiscountInCents(result.discountAmount));
      setCouponApplied(true);
      setCouponCode(resolveAppliedCouponCode(result.code, nextCode));
      setCouponPopupHandled(true);
      setShowCouponPopup(false);
    },
    [],
  );

  const runCouponValidation = useCallback(
    async (nextCode: string): Promise<boolean> => {
      if (!workspaceId || !plan?.id) {
        handleCouponFailure('Checkout sem contexto para validar cupom.');
        return false;
      }
      try {
        const result = await validateCoupon(workspaceId, nextCode, plan.id, subtotal);
        if (!result.valid) {
          handleCouponFailure(result.message || 'Cupom inválido ou expirado.');
          return false;
        }
        handleCouponSuccess(nextCode, result);
        return true;
      } catch (error) {
        handleCouponFailure(resolveCouponErrorMessage(error));
        return false;
      }
    },
    [handleCouponFailure, handleCouponSuccess, plan, subtotal, workspaceId],
  );

  const applyCoupon = useCallback(
    async (explicitCode?: string) => {
      setCouponError('');
      if (!isCouponFlowEnabled(config?.enableCoupon)) {
        return false;
      }
      const nextCode = resolveCouponCodeForSubmissionHelper(explicitCode, couponCode);
      const prerequisiteError = validateCouponPrerequisitesHelper(
        nextCode,
        workspaceId,
        plan?.id,
      );
      if (prerequisiteError) {
        setCouponError(prerequisiteError);
        return false;
      }
      return runCouponValidation(nextCode);
    },
    [config?.enableCoupon, couponCode, plan?.id, runCouponValidation, workspaceId],
  );

  const resolveSuccessRedirect = useCallback(
    (result: Record<string, unknown>) => {
      return resolveSuccessRedirectHelper(result, payMethod);
    },
    [payMethod],
  );

  const buildOrderPayload = useCallback(
    (resolvedPlanId: string, resolvedWorkspaceId: string): CreateOrderData => {
      return buildOrderPayloadHelper(resolvedPlanId, resolvedWorkspaceId, {
        checkoutCode,
        form: {
          name: form.name,
          email: form.email,
          cpf: form.cpf,
          phone: form.phone,
          cep: form.cep,
          street: form.street,
          number: form.number,
          neighborhood: form.neighborhood,
          complement: form.complement,
          city: form.city,
          state: form.state,
          destinatario: form.destinatario || form.name,
          cardName: form.cardName,
        },
        payMethod,
        shippingMode,
        shippingInCents,
        qty,
        subtotal,
        discount,
        total,
        couponApplied,
        couponCode,
        installments,
        affiliateWorkspaceId: affiliateContext?.affiliateWorkspaceId,
      });
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

  const runPreflightForFinalize = useCallback(() => {
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
      const result = await createOrder(payload);
      setPixelEvent('Purchase');

      const successPath = resolveSuccessRedirect(result);
      if (!successPath) {
        throw new Error('Pedido criado sem rota de continuidade.');
      }

      dispatchOrderCompletion(result, successPath);
    } catch (error) {
      setSubmitError(resolveSubmitErrorMessage(error));
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
