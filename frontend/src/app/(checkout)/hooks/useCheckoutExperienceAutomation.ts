'use client';

import { checkoutPublicApi } from '@/lib/api/misc';
import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { CheckoutExperienceForm } from './checkout-experience-social-helpers';
import type { CheckoutSocialIdentitySnapshot } from './useCheckoutSocialIdentity';

const D_RE = /\D/g;

type UseCheckoutExperienceAutomationOptions = {
  payMethod: 'card' | 'pix' | 'boleto';
  setPayMethod: (value: 'card' | 'pix' | 'boleto') => void;
  supportsCard: boolean;
  supportsPix: boolean;
  supportsBoleto: boolean;
  redirectTimer: MutableRefObject<number | null>;
  socialIdentity: CheckoutSocialIdentitySnapshot | null;
  setForm: Dispatch<SetStateAction<CheckoutExperienceForm>>;
  couponApplied: boolean;
  setCouponApplied: (value: boolean) => void;
  setDiscount: (value: number) => void;
  qty: number;
  slug?: string;
  shippingMode: string;
  variableShippingFloorInCents: number;
  cep: string;
  setDynamicShippingInCents: (value: number | null) => void;
  couponEnabled: boolean;
  couponPopupEnabled: boolean;
  couponPopupDelay: number;
  popupCouponCode: string;
  couponPopupHandled: boolean;
  setCouponCode: (value: string) => void;
  setShowCouponPopup: (value: boolean) => void;
};

export function useCheckoutExperienceAutomation({
  payMethod,
  setPayMethod,
  supportsCard,
  supportsPix,
  supportsBoleto,
  redirectTimer,
  socialIdentity,
  setForm,
  couponApplied,
  setCouponApplied,
  setDiscount,
  qty,
  slug,
  shippingMode,
  variableShippingFloorInCents,
  cep,
  setDynamicShippingInCents,
  couponEnabled,
  couponPopupEnabled,
  couponPopupDelay,
  popupCouponCode,
  couponPopupHandled,
  setCouponCode,
  setShowCouponPopup,
}: UseCheckoutExperienceAutomationOptions) {
  useEffect(() => {
    const availableMethods = [
      supportsCard ? 'card' : null,
      supportsPix ? 'pix' : null,
      supportsBoleto ? 'boleto' : null,
    ].filter(Boolean) as Array<'card' | 'pix' | 'boleto'>;
    if (availableMethods.length > 0 && !availableMethods.includes(payMethod)) {
      setPayMethod(availableMethods[0]);
    }
  }, [payMethod, setPayMethod, supportsBoleto, supportsCard, supportsPix]);

  useEffect(
    () => () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    },
    [redirectTimer],
  );

  useEffect(() => {
    if (!socialIdentity) return;
    setForm((prev) => ({
      ...prev,
      name: socialIdentity.name || prev.name,
      email: socialIdentity.email || prev.email,
      phone: socialIdentity.phone || prev.phone,
      cpf: socialIdentity.cpf || prev.cpf,
      cep: socialIdentity.cep || prev.cep,
      street: socialIdentity.street || prev.street,
      number: socialIdentity.number || prev.number,
      neighborhood: socialIdentity.neighborhood || prev.neighborhood,
      city: socialIdentity.city || prev.city,
      state: socialIdentity.state || prev.state,
      complement: socialIdentity.complement || prev.complement,
    }));
  }, [setForm, socialIdentity]);

  useEffect(() => {
    if (!couponApplied) return;
    setCouponApplied(false);
    setDiscount(0);
  }, [couponApplied, qty, setCouponApplied, setDiscount]);

  useEffect(() => {
    if (!slug || shippingMode !== 'VARIABLE') {
      setDynamicShippingInCents(shippingMode === 'VARIABLE' ? variableShippingFloorInCents : null);
      return;
    }

    const cepDigits = cep.replace(D_RE, '').slice(0, 8);
    if (cepDigits.length < 8) return;

    let cancelled = false;
    checkoutPublicApi
      .calculateShipping({ slug, cep: cepDigits })
      .then((response) => {
        if (cancelled) return;
        const options = response?.data?.options || [];
        setDynamicShippingInCents(
          Math.max(0, Math.round(Number(options[0]?.price || variableShippingFloorInCents))),
        );
      })
      .catch(() => {
        if (!cancelled) setDynamicShippingInCents(variableShippingFloorInCents);
      });

    return () => {
      cancelled = true;
    };
  }, [cep, setDynamicShippingInCents, shippingMode, slug, variableShippingFloorInCents]);

  useEffect(() => {
    if (
      !couponEnabled ||
      !couponPopupEnabled ||
      !popupCouponCode ||
      couponApplied ||
      couponPopupHandled
    ) {
      return;
    }

    const timer = window.setTimeout(
      () => {
        setCouponCode(popupCouponCode);
        setShowCouponPopup(true);
      },
      Math.max(600, couponPopupDelay),
    );

    return () => window.clearTimeout(timer);
  }, [
    couponApplied,
    couponPopupDelay,
    couponPopupHandled,
    couponEnabled,
    popupCouponCode,
    setCouponCode,
    setShowCouponPopup,
    couponPopupEnabled,
  ]);
}
