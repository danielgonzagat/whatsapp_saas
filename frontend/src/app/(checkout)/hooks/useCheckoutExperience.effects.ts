import { checkoutPublicApi } from '@/lib/api/misc';
import { useEffect, useRef } from 'react';
import type {
  BooleanSetter,
  CheckoutExperienceFormState,
  CouponPopupTimerParams,
  StringSetter,
  VariableShippingParams,
} from './useCheckoutExperience.types';
import {
  CHECKOUT_FORM_DRAFT_VERSION,
  readCheckoutFormDraft,
  resolveCouponPopupDelay,
  sanitizeCheckoutFormDraft,
} from './useCheckoutExperience.utils';

const D_RE = /\D/g;

export function useAutoSelectAvailablePayMethod(
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

export function useRedirectTimerCleanup(redirectTimer: { current: number | null }): void {
  useEffect(
    () => () => {
      if (redirectTimer.current) {
        clearTimeout(redirectTimer.current);
      }
    },
    [redirectTimer],
  );
}

export function useResetCouponOnQtyChange(
  qty: number,
  couponApplied: boolean,
  setCouponApplied: BooleanSetter,
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

export function useVariableShippingCalculation(params: VariableShippingParams): void {
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

export function useCouponPopupTimer(params: CouponPopupTimerParams): void {
  const {
    eligible,
    couponApplied,
    couponPopupHandled,
    popupCouponCode,
    delay,
    setCouponCode,
    setCouponError,
    setShowCouponPopup,
  } = params;

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

type StringSetterOrFn = StringSetter | ((prev: string) => string);
export type { StringSetter, BooleanSetter };

export interface CheckoutFormDraftPersistenceParams {
  checkoutFormDraftKey: string;
  form: CheckoutExperienceFormState;
  payMethod: 'card' | 'pix' | 'boleto';
  qty: number;
  couponCode: string;
  setForm: (updater: (prev: CheckoutExperienceFormState) => CheckoutExperienceFormState) => void;
  setPayMethod: (v: 'card' | 'pix' | 'boleto') => void;
  setQty: (v: number) => void;
  setCouponCode: StringSetterOrFn;
}

/** Persist and restore checkout form draft from localStorage. */
export function useCheckoutFormDraftPersistence({
  checkoutFormDraftKey,
  form,
  payMethod,
  qty,
  couponCode,
  setForm,
  setPayMethod,
  setQty,
  setCouponCode,
}: CheckoutFormDraftPersistenceParams): void {
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
  }, [checkoutFormDraftKey]); // intentionally run only on key change
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(
      checkoutFormDraftKey,
      JSON.stringify({
        version: CHECKOUT_FORM_DRAFT_VERSION,
        savedAt: new Date().toISOString(),
        form: sanitizeCheckoutFormDraft(form),
        payMethod,
        qty,
        couponCode,
      }),
    );
  }, [checkoutFormDraftKey, couponCode, form, payMethod, qty]);
}
