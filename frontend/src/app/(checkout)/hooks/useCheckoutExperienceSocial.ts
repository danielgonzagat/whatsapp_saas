'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  useCheckoutSocialIdentity,
  type CheckoutSocialIdentitySnapshot,
} from './useCheckoutSocialIdentity';
import { validateCoupon } from './useCheckout';

const D_RE = /\D/g;
const GOOGLE_PREFILL_SESSION_KEY = 'kloel.checkout.google-prefill-dismissed.v1';

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
  const [stripeClientSecret, setStripeClientSecret] = useState<string | null>(null);
  const [stripePaymentIntentId, setStripePaymentIntentId] = useState<string | null>(null);
  const [stripeReturnUrl, setStripeReturnUrl] = useState('');
  const [dynamicShippingInCents, setDynamicShippingInCents] = useState<number | null>(null);
  const [pixelEvent, setPixelEvent] = useState<
    'InitiateCheckout' | 'AddPaymentInfo' | 'Purchase' | null
  >(null);
  const [form, setForm] = useState<CheckoutExperienceForm>(EMPTY_CHECKOUT_EXPERIENCE_FORM);
  const [googleExtendedPrefillDismissed, setGoogleExtendedPrefillDismissed] = useState(
    () => readGooglePrefillDismissed(),
  );
  const redirectTimer = useRef<number | null>(null);
  const googlePeoplePrefillEnabled =
    process.env.NEXT_PUBLIC_KLOEL_FEATURE_GOOGLE_PEOPLE_PREFILL?.trim().toLowerCase() ===
      'true' ||
    process.env.NEXT_PUBLIC_GOOGLE_PEOPLE_SCOPES_ENABLED?.trim().toLowerCase() === 'true';

  const { fmt } = helpers;
  const social = useCheckoutSocialIdentity({ slug, checkoutCode, enabled: Boolean(slug) });
  const googleExtendedPrefillAvailable = Boolean(
    googlePeoplePrefillEnabled &&
      social.socialIdentity?.provider === 'google' &&
      hasGoogleExtendedPrefillData(social.socialIdentity),
  );
  const googleExtendedPrefillActive =
    googleExtendedPrefillAvailable && !googleExtendedPrefillDismissed;

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
  } = derivedState;

  useCheckoutExperienceAutomation({
    payMethod,
    setPayMethod,
    supportsCard,
    supportsPix,
    supportsBoleto,
    redirectTimer,
    socialIdentity: social.socialIdentity,
    allowGoogleExtendedPrefill: googleExtendedPrefillActive,
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

  const dismissGooglePrefill = useCallback(() => {
    setGoogleExtendedPrefillDismissed(true);
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem(GOOGLE_PREFILL_SESSION_KEY, '1');
      } catch {
        // Ignore public-checkout storage failures.
      }
    }

    const snapshot = social.socialIdentity;
    if (!snapshot || snapshot.provider !== 'google') return;

    setForm((prev) => ({
      ...prev,
      phone: snapshot.phone && prev.phone === snapshot.phone ? '' : prev.phone,
      cep: snapshot.cep && prev.cep === snapshot.cep ? '' : prev.cep,
      street: snapshot.street && prev.street === snapshot.street ? '' : prev.street,
      number: snapshot.number && prev.number === snapshot.number ? '' : prev.number,
      neighborhood:
        snapshot.neighborhood && prev.neighborhood === snapshot.neighborhood
          ? ''
          : prev.neighborhood,
      city: snapshot.city && prev.city === snapshot.city ? '' : prev.city,
      state: snapshot.state && prev.state === snapshot.state ? '' : prev.state,
      complement:
        snapshot.complement && prev.complement === snapshot.complement ? '' : prev.complement,
    }));
  }, [social.socialIdentity]);

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
    [config?.requireCPF, config?.requirePhone, form],
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
          await social.updateLeadProgress({
            name: form.name,
            email: form.email,
            phone: form.phone,
            cpf: form.cpf,
            stepReached: 2,
          });
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
      await social.updateLeadProgress({
        name: form.name,
        email: form.email,
        phone: form.phone,
        cpf: form.cpf,
        cep: form.cep,
        street: form.street,
        number: form.number,
        neighborhood: form.neighborhood,
        city: form.city,
        state: form.state,
        complement: form.complement,
        stepReached: 3,
      });
      setStep(3);
    },
    [
      form.email,
      form.cpf,
      form.name,
      form.phone,
      form.cep,
      form.city,
      form.complement,
      form.neighborhood,
      form.number,
      form.state,
      form.street,
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

  const resetStripeConfirmation = useCallback(() => {
    setStripeClientSecret(null);
    setStripePaymentIntentId(null);
    setStripeReturnUrl('');
  }, []);

  const handleStripePaymentSuccess = useCallback(() => {
    if (!stripeReturnUrl) {
      return;
    }

    setShowSuccess(true);
    redirectTimer.current = window.setTimeout(() => {
      window.location.href = stripeReturnUrl;
    }, 1200);
  }, [stripeReturnUrl]);

  const handleStripePaymentError = useCallback((message: string) => {
    setSubmitError(message || 'Erro ao confirmar o pagamento no Stripe.');
  }, []);

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
    if (payMethod === 'boleto' && form.cpf.replace(D_RE, '').length < 11) {
      setSubmitError('CPF válido é obrigatório para gerar boleto.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');
    resetStripeConfirmation();

    try {
      const result = await finalizeCheckoutOrder({
        affiliateContext,
        capturedLeadId: social.socialIdentity?.leadId,
        checkoutCode,
        deviceFingerprint: social.deviceFingerprint,
        discount,
        form,
        installments,
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

      const safeSuccessUrl = new URL(result.successPath, window.location.origin);
      if (safeSuccessUrl.origin !== window.location.origin) {
        throw new Error('Redirecionamento bloqueado: destino externo detectado.');
      }
      const safeHref = safeSuccessUrl.href;

      setPixelEvent('Purchase');

      if (result.mode === 'stripe_confirmation') {
        setSuccessOrderNumber(result.orderNumber);
        setStripeClientSecret(result.clientSecret);
        setStripePaymentIntentId(result.paymentIntentId);
        setStripeReturnUrl(safeHref);
        return;
      }

      window.location.href = safeHref;
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
    payMethod,
    paymentProvider,
    plan?.id,
    resetStripeConfirmation,
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
    stripeClientSecret,
    stripePaymentIntentId,
    stripeReturnUrl,
    updateField,
    goStep,
    applyCoupon,
    finalizeOrder,
    handleStripePaymentSuccess,
    handleStripePaymentError,
    socialIdentity: social.socialIdentity,
    socialLoadingProvider: social.loadingProvider,
    socialError: social.socialError,
    googleAvailable: social.googleAvailable,
    facebookAvailable: social.facebookAvailable,
    appleAvailable: social.appleAvailable,
    googleButtonRef: social.googleButtonRef,
    startFacebookSignIn: social.startFacebookSignIn,
    startAppleSignIn: social.startAppleSignIn,
    googleExtendedPrefillActive,
    dismissGooglePrefill,
  };
}

function hasGoogleExtendedPrefillData(identity: CheckoutSocialIdentitySnapshot | null) {
  if (!identity) return false;

  return Boolean(
    identity.phone ||
      identity.cep ||
      identity.street ||
      identity.number ||
      identity.neighborhood ||
      identity.city ||
      identity.state ||
      identity.complement,
  );
}

function readGooglePrefillDismissed() {
  if (typeof window === 'undefined') return false;

  try {
    return window.sessionStorage.getItem(GOOGLE_PREFILL_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}
