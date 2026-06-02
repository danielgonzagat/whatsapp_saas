'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  type CheckoutExperienceForm,
  EMPTY_CHECKOUT_EXPERIENCE_FORM,
  type UseCheckoutExperienceSocialOptions,
  computeFinalizeOrderPrecheckError,
  deriveCheckoutExperienceState,
  isCheckoutAddressStepValid,
  isCheckoutIdentityStepValid,
  resolveCheckoutCouponCode,
} from './checkout-experience-social-helpers';
import { finalizeCheckoutOrder } from './checkout-order-submit';
import { validateCoupon } from './useCheckout';
import { useCheckoutExperienceAutomation } from './useCheckoutExperienceAutomation';
import { useCheckoutSocialIdentity } from './useCheckoutSocialIdentity';
import {
  buildCheckoutFormDraftKey,
  readCheckoutFormDraft,
  sanitizeCheckoutFormDraft,
  CHECKOUT_FORM_DRAFT_VERSION,
  type CheckoutFormDraft,
} from './useCheckoutExperienceSocial.draft';
import {
  buildAddressLeadProgress,
  buildIdentityLeadProgress,
  buildSafeSuccessRedirect,
  countCpfDigits,
  formatCheckoutFieldValue,
  normalizeAcceptedCouponDiscount,
  resolveApplyCouponErrorMessage,
  resolveCouponPopupDelay,
  resolveFinalizeOrderErrorMessage,
  resolveStripeConfirmationErrorMessage,
} from './useCheckoutExperienceSocial.helpers';

/** Use checkout experience social. */
export function useCheckoutExperienceSocial({
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
}: UseCheckoutExperienceSocialOptions) {
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
  const [stripeClientSecret, setStripeClientSecret] = useState<string | null>(null);
  const [stripePaymentIntentId, setStripePaymentIntentId] = useState<string | null>(null);
  const [stripeReturnUrl, setStripeReturnUrl] = useState('');
  const [dynamicShippingInCents, setDynamicShippingInCents] = useState<number | null>(null);
  const [pixelEvent, setPixelEvent] = useState<
    'InitiateCheckout' | 'AddPaymentInfo' | 'Purchase' | null
  >(null);
  const [form, setForm] = useState<CheckoutExperienceForm>(EMPTY_CHECKOUT_EXPERIENCE_FORM);
  const [selectedBumpIds, setSelectedBumpIds] = useState<string[]>([]);
  const redirectTimer = useRef<number | null>(null);

  const { fmt } = helpers;
  const social = useCheckoutSocialIdentity({
    ...(slug !== undefined ? { slug } : {}),
    ...(checkoutCode !== undefined ? { checkoutCode } : {}),
    enabled: Boolean(slug),
  });
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
    queueMicrotask(() => {
      setForm((prev) => ({ ...prev, ...savedDraft.form }));
      setPayMethod(savedDraft.payMethod);
      setQty(savedDraft.qty);
      setCouponCode(savedDraft.couponCode);
    });
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

  const orderBumps = useMemo(() => plan?.orderBumps ?? [], [plan?.orderBumps]);
  const bumpTotalInCents = useMemo(
    () =>
      orderBumps
        .filter((bump) => selectedBumpIds.includes(bump.id))
        .reduce((sum, bump) => sum + Math.max(0, Math.round(Number(bump.priceInCents || 0))), 0),
    [orderBumps, selectedBumpIds],
  );
  const toggleBump = useCallback((bumpId: string) => {
    setSelectedBumpIds((prev) =>
      prev.includes(bumpId) ? prev.filter((id) => id !== bumpId) : [...prev, bumpId],
    );
  }, []);

  const derivedState = useMemo(
    () =>
      deriveCheckoutExperienceState({
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
        bumpTotalInCents,
      }),
    [
      bumpTotalInCents,
      config,
      defaults,
      discount,
      dynamicShippingInCents,
      form,
      helpers,
      merchant,
      payMethod,
      paymentProvider,
      plan,
      product,
      qty,
      step,
    ],
  );
  const {
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
  } = derivedState;

  useCheckoutExperienceAutomation({
    payMethod,
    setPayMethod,
    supportsCard,
    supportsPix,
    supportsBoleto,
    redirectTimer,
    socialIdentity: social.socialIdentity,
    setForm,
    couponApplied,
    setCouponApplied,
    setDiscount,
    qty,
    ...(slug !== undefined ? { slug } : {}),
    shippingMode,
    variableShippingFloorInCents,
    cep: form.cep,
    setDynamicShippingInCents,
    couponEnabled: config?.enableCoupon !== false,
    couponPopupEnabled: config?.showCouponPopup === true,
    couponPopupDelay: resolveCouponPopupDelay(config?.couponPopupDelay),
    popupCouponCode,
    couponPopupHandled,
    setCouponCode,
    setShowCouponPopup,
  });

  const updateField = useCallback(
    (field: keyof CheckoutExperienceForm) =>
      (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const value = formatCheckoutFieldValue(field, event.target.value, fmt);
        setForm((prev) => ({ ...prev, [field]: value }));
      },
    [fmt],
  );

  const validateStep1 = useCallback(
    () =>
      isCheckoutIdentityStepValid(form, {
        requireCPF: config?.requireCPF ?? true,
        requirePhone: config?.requirePhone ?? true,
      }),
    [config?.requireCPF, config?.requirePhone, form],
  );

  const validateStep2 = useCallback(() => isCheckoutAddressStepValid(form), [form]);

  const advanceToStep2 = useCallback(async () => {
    if (!validateStep1()) {
      setSubmitError('Preencha nome, e-mail, CPF e WhatsApp para continuar.');
      return;
    }

    setSubmitError('');
    setLoadingStep(true);
    setPixelEvent('InitiateCheckout');
    await social.updateLeadProgress({
      ...buildIdentityLeadProgress(form),
      stepReached: 2,
    });
    window.setTimeout(() => {
      setStep(2);
      setLoadingStep(false);
    }, 600);
  }, [form, social, validateStep1]);

  const advanceToStep3 = useCallback(async () => {
    if (!validateStep2()) {
      setSubmitError('Preencha o endereço completo para continuar ao pagamento.');
      return;
    }

    setSubmitError('');
    setPixelEvent('AddPaymentInfo');
    await social.updateLeadProgress({
      ...buildAddressLeadProgress(form),
      stepReached: 3,
    });
    setStep(3);
  }, [form, social, validateStep2]);

  const goStep = useCallback(
    async (target: number) => {
      if (target === 1 && mobileCanOpenStep1) {
        setStep(1);
        return;
      }

      if (target === 2) {
        if (step === 1) {
          await advanceToStep2();
          return;
        }
        if (mobileCanOpenStep2) {
          setStep(2);
        }
        return;
      }

      await advanceToStep3();
    },
    [advanceToStep2, advanceToStep3, mobileCanOpenStep1, mobileCanOpenStep2, step],
  );

  const rejectCoupon = useCallback((message: string) => {
    setCouponApplied(false);
    setDiscount(0);
    setCouponError(message);
    return false as const;
  }, []);

  const acceptCoupon = useCallback(
    (result: { valid: boolean; discountAmount?: number; code?: string }, nextCode: string) => {
      setDiscount(normalizeAcceptedCouponDiscount(result.discountAmount));
      setCouponApplied(true);
      setCouponCode((result.code || nextCode).toUpperCase());
      setCouponPopupHandled(true);
      setShowCouponPopup(false);
      return true as const;
    },
    [],
  );

  const applyCoupon = useCallback(
    async (explicitCode?: string) => {
      setCouponError('');
      if (config?.enableCoupon === false || !workspaceId || !plan?.id) {
        return false;
      }

      const nextCode = resolveCheckoutCouponCode(couponCode, explicitCode);
      if (!nextCode) {
        setCouponError('Digite um cupom.');
        return false;
      }

      try {
        const result = await validateCoupon(workspaceId, nextCode, plan.id, subtotal);
        if (!result.valid) {
          return rejectCoupon(result.message || 'Cupom inválido ou expirado.');
        }
        return acceptCoupon(result, nextCode);
      } catch (error) {
        return rejectCoupon(resolveApplyCouponErrorMessage(error));
      }
    },
    [acceptCoupon, config?.enableCoupon, couponCode, plan, rejectCoupon, subtotal, workspaceId],
  );

  const resetStripeConfirmation = useCallback(() => {
    setStripeClientSecret(null);
    setStripePaymentIntentId(null);
    setStripeReturnUrl('');
  }, []);

  const handleStripePaymentSuccess = useCallback(() => {
    if (!stripeReturnUrl) {
      return;
    }

    window.localStorage.removeItem(checkoutFormDraftKey);
    setShowSuccess(true);
    redirectTimer.current = window.setTimeout(() => {
      window.location.href = stripeReturnUrl;
    }, 1200);
  }, [checkoutFormDraftKey, stripeReturnUrl]);

  const handleStripePaymentError = useCallback((message: string) => {
    setSubmitError(resolveStripeConfirmationErrorMessage(message));
  }, []);

  const applyFinalizedCheckoutResult = useCallback(
    (result: Awaited<ReturnType<typeof finalizeCheckoutOrder>>) => {
      const safeRedirect = buildSafeSuccessRedirect(result.successPath, window.location.origin);

      setPixelEvent('Purchase');

      if (result.mode === 'stripe_confirmation') {
        setSuccessOrderNumber(result.orderNumber);
        setStripeClientSecret(result.clientSecret);
        setStripePaymentIntentId(result.paymentIntentId);
        setStripeReturnUrl(safeRedirect.href);
        return;
      }

      window.localStorage.removeItem(checkoutFormDraftKey);
      router.push(safeRedirect.path);
    },
    [checkoutFormDraftKey, router],
  );

  const runFinalizeOrderPrecheck = useCallback(
    (planId: string | undefined) =>
      computeFinalizeOrderPrecheckError({
        identityValid: validateStep1(),
        addressValid: validateStep2(),
        hasWorkspaceAndPlan: Boolean(workspaceId && planId),
        checkoutUnavailableReason,
        payMethod,
        supportsCard,
        supportsPix,
        supportsBoleto,
        cpfDigits: countCpfDigits(form.cpf),
      }),
    [
      checkoutUnavailableReason,
      form.cpf,
      payMethod,
      supportsBoleto,
      supportsCard,
      supportsPix,
      validateStep1,
      validateStep2,
      workspaceId,
    ],
  );

  const dispatchFinalizeCheckout = useCallback(
    (planId: string) =>
      finalizeCheckoutOrder({
        affiliateContext,
        capturedLeadId: social.socialIdentity?.leadId,
        checkoutCode,
        deviceFingerprint: social.deviceFingerprint,
        discount,
        form,
        installments,
        payMethod,
        paymentProvider,
        planId,
        qty,
        shippingInCents,
        shippingMode,
        subtotal,
        total,
        workspaceId: workspaceId as string,
        acceptedBumps: selectedBumpIds,
        bumpTotalInCents,
      }),
    [
      affiliateContext,
      bumpTotalInCents,
      selectedBumpIds,
      checkoutCode,
      discount,
      form,
      installments,
      payMethod,
      paymentProvider,
      qty,
      shippingInCents,
      shippingMode,
      social.deviceFingerprint,
      social.socialIdentity?.leadId,
      subtotal,
      total,
      workspaceId,
    ],
  );

  const finalizeOrder = useCallback(async () => {
    const planId = plan?.id;
    const precheckError = runFinalizeOrderPrecheck(planId);
    if (precheckError) {
      setSubmitError(precheckError.message);
      if (precheckError.targetStep) {
        setStep(precheckError.targetStep);
      }
      return;
    }
    if (!workspaceId || !planId) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');
    resetStripeConfirmation();

    try {
      const result = await dispatchFinalizeCheckout(planId);
      applyFinalizedCheckoutResult(result);
    } catch (error) {
      setSubmitError(resolveFinalizeOrderErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }, [
    applyFinalizedCheckoutResult,
    dispatchFinalizeCheckout,
    plan?.id,
    resetStripeConfirmation,
    runFinalizeOrderPrecheck,
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
    stripeClientSecret,
    stripePaymentIntentId,
    stripeReturnUrl,
    updateField,
    goStep,
    applyCoupon,
    finalizeOrder,
    orderBumps,
    selectedBumpIds,
    toggleBump,
    bumpTotalInCents,
    handleStripePaymentSuccess,
    handleStripePaymentError,
    socialIdentity: social.socialIdentity,
    socialLoadingProvider: social.loadingProvider,
    socialError: social.socialError,
    facebookAvailable: social.facebookAvailable,
    appleAvailable: social.appleAvailable,
    facebookSdkReady: social.facebookSdkReady,
    triggerFacebookSignIn: social.triggerFacebookSignIn,
    triggerAppleSignIn: social.triggerAppleSignIn,
    googleAvailable: social.googleAvailable,
    googleButtonRef: social.googleButtonRef,
  };
}
