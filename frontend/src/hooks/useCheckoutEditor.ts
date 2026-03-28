'use client';

import useSWR from 'swr';
import { useCallback, useRef } from 'react';
import { swrFetcher } from '@/lib/fetcher';
import { apiFetch } from '@/lib/api';

/* ── Types ── */

export interface CheckoutTestimonial {
  name: string;
  text: string;
  stars: number;
}

export interface CheckoutTrustBadge {
  label: string;
  icon?: string;
}

export interface CheckoutOrderBump {
  id?: string;
  title: string;
  description: string;
  productName: string;
  price: number;
}

export interface CheckoutUpsell {
  id?: string;
  title: string;
  description: string;
  productName: string;
  price: number;
}

export interface CheckoutPixel {
  type: string;
  pixelId: string;
  accessToken?: string;
}

export interface CheckoutConfig {
  /* Theme */
  theme: 'NOIR' | 'BLANC';

  /* Colors */
  accentColor: string;
  accentColor2: string;
  backgroundColor: string;
  cardColor: string;
  textColor: string;

  /* Header */
  brandName: string;
  brandLogo: string;
  headerMessage: string;
  headerSubMessage: string;

  /* Product */
  productImage: string;
  productDisplayName: string;

  /* Buttons */
  btnStep1Text: string;
  btnStep2Text: string;
  btnFinalizeText: string;

  /* Fields */
  requireCPF: boolean;
  requirePhone: boolean;
  phoneLabel: string;

  /* Payment Methods */
  enableCreditCard: boolean;
  enablePix: boolean;
  enableBoleto: boolean;

  /* Coupon Popup */
  enableCoupon: boolean;
  showCouponPopup: boolean;
  couponPopupTitle: string;
  couponPopupDesc: string;
  autoCouponCode: string;

  /* Timer */
  enableTimer: boolean;
  timerType: string;
  timerMinutes: number;
  timerMessage: string;

  /* Stock Counter */
  showStockCounter: boolean;
  stockMessage: string;
  fakeStockCount: number;

  /* Testimonials */
  testimonials: CheckoutTestimonial[];

  /* Guarantee */
  enableGuarantee: boolean;
  guaranteeTitle: string;
  guaranteeText: string;
  guaranteeDays: number;

  /* Trust Badges */
  enableTrustBadges: boolean;
  trustBadges: CheckoutTrustBadge[];

  /* Order Bumps */
  orderBumps: CheckoutOrderBump[];

  /* Upsells */
  upsells: CheckoutUpsell[];

  /* Exit Intent */
  enableExitIntent: boolean;
  exitIntentTitle: string;
  exitIntentCouponCode: string;

  /* Floating Bar */
  enableFloatingBar: boolean;
  floatingBarMessage: string;

  /* SEO */
  metaTitle: string;
  metaDescription: string;
  metaImage: string;

  /* Custom CSS */
  customCSS: string;

  /* Pixels */
  pixels: CheckoutPixel[];

  /* Slug (read-only) */
  slug?: string;

  [key: string]: unknown;
}

export const DEFAULT_CONFIG: CheckoutConfig = {
  theme: 'NOIR',
  accentColor: '#E85D30',
  accentColor2: '#D14E25',
  backgroundColor: '#0A0A0C',
  cardColor: '#111113',
  textColor: '#E0DDD8',
  brandName: '',
  brandLogo: '',
  headerMessage: '',
  headerSubMessage: '',
  productImage: '',
  productDisplayName: '',
  btnStep1Text: 'Continuar',
  btnStep2Text: 'Continuar',
  btnFinalizeText: 'Finalizar Compra',
  requireCPF: false,
  requirePhone: true,
  phoneLabel: 'WhatsApp',
  enableCreditCard: true,
  enablePix: true,
  enableBoleto: false,
  enableCoupon: false,
  showCouponPopup: false,
  couponPopupTitle: '',
  couponPopupDesc: '',
  autoCouponCode: '',
  enableTimer: false,
  timerType: 'countdown',
  timerMinutes: 15,
  timerMessage: '',
  showStockCounter: false,
  stockMessage: '',
  fakeStockCount: 12,
  testimonials: [],
  enableGuarantee: false,
  guaranteeTitle: '',
  guaranteeText: '',
  guaranteeDays: 7,
  enableTrustBadges: false,
  trustBadges: [],
  orderBumps: [],
  upsells: [],
  enableExitIntent: false,
  exitIntentTitle: '',
  exitIntentCouponCode: '',
  enableFloatingBar: false,
  floatingBarMessage: '',
  metaTitle: '',
  metaDescription: '',
  metaImage: '',
  customCSS: '',
  pixels: [],
};

/* ── Hook ── */

export function useCheckoutEditor(planId: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    planId ? `/checkout/plans/${planId}/config` : null,
    swrFetcher,
  );

  const config: CheckoutConfig = data
    ? { ...DEFAULT_CONFIG, ...(data as Record<string, unknown>) }
    : DEFAULT_CONFIG;

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);

  const updateConfig = useCallback(
    async (patch: Partial<CheckoutConfig>) => {
      if (!planId) return;

      // Optimistic update
      const next = { ...config, ...patch };
      mutate(next, false);

      // Debounced save
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

      return new Promise<void>((resolve) => {
        saveTimerRef.current = setTimeout(async () => {
          savingRef.current = true;
          try {
            await apiFetch(`/checkout/plans/${planId}/config`, {
              method: 'PUT',
              body: next,
            });
            mutate();
          } finally {
            savingRef.current = false;
          }
          resolve();
        }, 800);
      });
    },
    [planId, config, mutate],
  );

  return { config, isLoading, error, mutate, updateConfig };
}
