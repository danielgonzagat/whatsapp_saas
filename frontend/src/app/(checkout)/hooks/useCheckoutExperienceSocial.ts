'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  EMPTY_CHECKOUT_EXPERIENCE_FORM,
  deriveCheckoutExperienceState,
  isCheckoutAddressStepValid,
  isCheckoutIdentityStepValid,
  type CheckoutExperienceForm,
  type UseCheckoutExperienceSocialOptions,
} from './checkout-experience-social-helpers';
import { finalizeCheckoutOrder } from './checkout-order-submit';
import { useCheckoutExperienceAutomation } from './useCheckoutExperienceAutomation';
import { useCheckoutSocialIdentity } from './useCheckoutSocialIdentity';
import { validateCoupon } from './useCheckout';

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
  const [pixelEvent, setPixelEvent] = useState<
    'InitiateCheckout' | 'AddPaymentInfo' | 'Purchase' | null
  >(null);
  const [form, setForm] = useState<CheckoutExperienceForm>(EMPTY_CHECKOUT_EXPERIENCE_FORM);
  const redirectTimer = useRef<number | null>(null);

  const { fmt } = helpers;
  const social = useCheckoutSocialIdentity({ slug, checkoutCode, enabled: Boolean(slug) });

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
      }),
    [
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
    mercadoPagoPublicKey,
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
    slug,
    shippingMode,
    variableShippingFloorInCents,
    cep: form.cep,
    setDynamicShippingInCents,
    couponEnabled: config?.enableCoupon !== false,
    couponPopupEnabled: config?.showCouponPopup === true,
    couponPopupDelay: Number(config?.couponPopupDelay || 1800),
    popupCouponCode,
    couponPopupHandled,
    setCouponCode,
    setShowCouponPopup,
  });

  const updateField = useCallback(
    (field: keyof CheckoutExperienceForm) =>
      (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        let value = event.target.value;
        if (field === 'cpf' || field === 'cardCpf') value = fmt.cpf(value);
        if (field === 'phone') value = fmt.phone(value);
        if (field === 'cep') value = fmt.cep(value);
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
    [config?.requireCPF, config?.requirePhone, form.cpf, form.email, form.name, form.phone],
  );

  const validateStep2 = useCallback(() => isCheckoutAddressStepValid(form), [form]);

  const goStep = useCallback(
    async (target: number) => {
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
          await social.updateLeadProgress({ phone: form.phone, cpf: form.cpf, stepReached: 2 });
          window.setTimeout(() => {
            setStep(2);
            setLoadingStep(false);
          }, 600);
          return;
        }

        if (mobileCanOpenStep2) setStep(2);
        return;
      }

      if (!validateStep2()) {
        setSubmitError('Preencha o endereço completo para continuar ao pagamento.');
        return;
      }

      setSubmitError('');
      setPixelEvent('AddPaymentInfo');
      await social.updateLeadProgress({ phone: form.phone, cpf: form.cpf, stepReached: 3 });
      setStep(3);
    },
    [
      form.cpf,
      form.phone,
      mobileCanOpenStep1,
      mobileCanOpenStep2,
      social,
      step,
      validateStep1,
      validateStep2,
    ],
  );

  const applyCoupon = useCallback(
    async (explicitCode?: string) => {
      setCouponError('');
      if (config?.enableCoupon === false || !workspaceId || !plan?.id) return false;

      const nextCode = String(explicitCode || couponCode || '')
        .trim()
        .toUpperCase();
      if (!nextCode) {
        setCouponError('Digite um cupom.');
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

  const finalizeOrder = useCallback(async () => {
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
    if (
      (payMethod === 'card' && !supportsCard) ||
      (payMethod === 'pix' && !supportsPix) ||
      (payMethod === 'boleto' && !supportsBoleto)
    ) {
      setSubmitError('Forma de pagamento indisponível neste checkout.');
      return;
    }
    if (payMethod === 'boleto' && form.cpf.replace(/\D/g, '').length < 11) {
      setSubmitError('CPF válido é obrigatório para gerar boleto.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const { successPath, orderNumber } = await finalizeCheckoutOrder({
        affiliateContext,
        capturedLeadId: social.socialIdentity?.leadId,
        checkoutCode,
        deviceFingerprint: social.deviceFingerprint,
        discount,
        form,
        installments,
        mercadoPagoPublicKey,
        payMethod,
        paymentProvider,
        planId: plan.id,
        qty,
        shippingInCents,
        shippingMode,
        subtotal,
        total,
        workspaceId,
      });

      setPixelEvent('Purchase');
      if (payMethod === 'card') {
        setSuccessOrderNumber(orderNumber);
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
    affiliateContext,
    checkoutCode,
    checkoutUnavailableReason,
    discount,
    form,
    installments,
    mercadoPagoPublicKey,
    payMethod,
    paymentProvider,
    plan?.id,
    qty,
    shippingInCents,
    shippingMode,
    social.deviceFingerprint,
    social.socialIdentity?.leadId,
    subtotal,
    supportsBoleto,
    supportsCard,
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
    updateField,
    goStep,
    applyCoupon,
    finalizeOrder,
    socialIdentity: social.socialIdentity,
    socialLoadingProvider: social.loadingProvider,
    socialError: social.socialError,
    googleAvailable: social.googleAvailable,
    googleButtonRef: social.googleButtonRef,
  };
}
