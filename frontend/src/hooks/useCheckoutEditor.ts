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
  image?: string;
  compareAtPrice?: number;
  highlightColor?: string;
  checkboxLabel?: string;
  position?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface CheckoutUpsell {
  id?: string;
  title: string;
  description: string;
  productName: string;
  price: number;
  headline?: string;
  image?: string;
  compareAtPrice?: number;
  acceptBtnText?: string;
  declineBtnText?: string;
  timerSeconds?: number;
  chargeType?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface CheckoutPixel {
  id?: string;
  type: string;
  pixelId: string;
  accessToken?: string;
  trackPageView?: boolean;
  trackInitiateCheckout?: boolean;
  trackAddPaymentInfo?: boolean;
  trackPurchase?: boolean;
  isActive?: boolean;
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
  fakeStockCount: 0,
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

function normalizeTimerTypeForEditor(value: unknown): string {
  const normalized = String(value || '').trim().toUpperCase();

  if (normalized === 'COUNTDOWN' || normalized === 'EVERGREEN') {
    return 'countdown';
  }

  if (normalized === 'EXPIRATION' || normalized === 'FIXED') {
    return 'fixed';
  }

  if (normalized === 'countdown' || normalized === 'fixed') {
    return normalized;
  }

  return DEFAULT_CONFIG.timerType;
}

function normalizePixelTypeForEditor(value: unknown): string {
  const normalized = String(value || '').trim().toUpperCase();

  switch (normalized) {
    case 'FACEBOOK':
      return 'facebook';
    case 'GOOGLE_ANALYTICS':
      return 'google_analytics';
    case 'GOOGLE_ADS':
      return 'google_ads';
    case 'TIKTOK':
      return 'tiktok';
    case 'CUSTOM':
      return 'custom';
    default:
      return 'custom';
  }
}

function normalizeConfigForEditor(data: Record<string, unknown>): CheckoutConfig {
  const raw = data as Record<string, unknown> & { plan?: { slug?: string } };
  const { plan, ...rest } = raw;

  const testimonials = Array.isArray(rest.testimonials)
    ? rest.testimonials.map((entry) => {
        const item = entry as Record<string, unknown>;
        return {
          name: String(item.name || ''),
          text: String(item.text || ''),
          stars: Number(item.stars ?? item.rating ?? 5) || 5,
        };
      })
    : DEFAULT_CONFIG.testimonials;

  const trustBadges = Array.isArray(rest.trustBadges)
    ? rest.trustBadges.map((entry) => {
        if (typeof entry === 'string') {
          return { label: entry };
        }

        const item = entry as Record<string, unknown>;
        return {
          label: String(item.label || ''),
          icon: typeof item.icon === 'string' ? item.icon : undefined,
        };
      })
    : DEFAULT_CONFIG.trustBadges;

  const orderBumps = Array.isArray(rest.orderBumps)
    ? rest.orderBumps.map((entry) => {
        const item = entry as Record<string, unknown>;
        return {
          id: typeof item.id === 'string' ? item.id : undefined,
          title: String(item.title || ''),
          description: String(item.description || ''),
          productName: String(item.productName || ''),
          price:
            typeof item.price === 'number'
              ? item.price
              : Number(item.priceInCents || 0) / 100,
          image: typeof item.image === 'string' ? item.image : undefined,
          compareAtPrice:
            typeof item.compareAtPrice === 'number'
              ? item.compareAtPrice / 100
              : undefined,
          highlightColor:
            typeof item.highlightColor === 'string' ? item.highlightColor : undefined,
          checkboxLabel:
            typeof item.checkboxLabel === 'string' ? item.checkboxLabel : undefined,
          position: typeof item.position === 'string' ? item.position : undefined,
          sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : undefined,
          isActive: typeof item.isActive === 'boolean' ? item.isActive : undefined,
        };
      })
    : DEFAULT_CONFIG.orderBumps;

  const upsells = Array.isArray(rest.upsells)
    ? rest.upsells.map((entry) => {
        const item = entry as Record<string, unknown>;
        return {
          id: typeof item.id === 'string' ? item.id : undefined,
          title: String(item.title || ''),
          description: String(item.description || ''),
          productName: String(item.productName || ''),
          price:
            typeof item.price === 'number'
              ? item.price
              : Number(item.priceInCents || 0) / 100,
          headline: typeof item.headline === 'string' ? item.headline : undefined,
          image: typeof item.image === 'string' ? item.image : undefined,
          compareAtPrice:
            typeof item.compareAtPrice === 'number'
              ? item.compareAtPrice / 100
              : undefined,
          acceptBtnText:
            typeof item.acceptBtnText === 'string' ? item.acceptBtnText : undefined,
          declineBtnText:
            typeof item.declineBtnText === 'string' ? item.declineBtnText : undefined,
          timerSeconds:
            typeof item.timerSeconds === 'number' ? item.timerSeconds : undefined,
          chargeType: typeof item.chargeType === 'string' ? item.chargeType : undefined,
          sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : undefined,
          isActive: typeof item.isActive === 'boolean' ? item.isActive : undefined,
        };
      })
    : DEFAULT_CONFIG.upsells;

  const pixels = Array.isArray(rest.pixels)
    ? rest.pixels.map((entry) => {
        const item = entry as Record<string, unknown>;
        return {
          id: typeof item.id === 'string' ? item.id : undefined,
          type: normalizePixelTypeForEditor(item.type),
          pixelId: String(item.pixelId || ''),
          accessToken:
            typeof item.accessToken === 'string' ? item.accessToken : undefined,
          trackPageView:
            typeof item.trackPageView === 'boolean' ? item.trackPageView : true,
          trackInitiateCheckout:
            typeof item.trackInitiateCheckout === 'boolean'
              ? item.trackInitiateCheckout
              : true,
          trackAddPaymentInfo:
            typeof item.trackAddPaymentInfo === 'boolean'
              ? item.trackAddPaymentInfo
              : true,
          trackPurchase:
            typeof item.trackPurchase === 'boolean' ? item.trackPurchase : true,
          isActive: typeof item.isActive === 'boolean' ? item.isActive : true,
        };
      })
    : DEFAULT_CONFIG.pixels;

  return {
    ...DEFAULT_CONFIG,
    ...rest,
    slug:
      typeof rest.slug === 'string'
        ? rest.slug
        : typeof plan?.slug === 'string'
          ? plan.slug
          : undefined,
    timerType: normalizeTimerTypeForEditor(rest.timerType),
    testimonials,
    trustBadges,
    orderBumps,
    upsells,
    pixels,
  } as CheckoutConfig;
}

/* ── Hook ── */

export function useCheckoutEditor(planId: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    planId ? `/checkout/plans/${planId}/config` : null,
    swrFetcher,
  );

  const config: CheckoutConfig = data
    ? normalizeConfigForEditor(data as Record<string, unknown>)
    : DEFAULT_CONFIG;

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);

  const updateConfig = useCallback(
    async (patch: Partial<CheckoutConfig>) => {
      if (!planId) return;

      const next = { ...config, ...patch };
      mutate(next, false);

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

      return new Promise<void>((resolve) => {
        saveTimerRef.current = setTimeout(async () => {
          savingRef.current = true;
          try {
            await apiFetch(`/checkout/plans/${planId}/config`, {
              method: 'PATCH',
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
