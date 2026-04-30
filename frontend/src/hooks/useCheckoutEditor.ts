'use client';

import { apiFetch } from '@/lib/api';
import { swrFetcher } from '@/lib/fetcher';
import { useCallback, useRef } from 'react';
import useSWR from 'swr';
import { colors } from '@/lib/design-tokens';

/* ── Types ── */

export interface CheckoutTestimonial {
  /** Name property. */
  name: string;
  /** Text property. */
  text: string;
  /** Stars property. */
  stars: number;
}

/** Checkout trust badge shape. */
export interface CheckoutTrustBadge {
  /** Label property. */
  label: string;
  /** Icon property. */
  icon?: string;
}

/** Checkout order bump shape. */
export interface CheckoutOrderBump {
  /** Id property. */
  id?: string;
  /** Title property. */
  title: string;
  /** Description property. */
  description: string;
  /** Product name property. */
  productName: string;
  /** Price property. */
  price: number;
  /** Image property. */
  image?: string;
  /** Compare at price property. */
  compareAtPrice?: number;
  /** Highlight color property. */
  highlightColor?: string;
  /** Checkbox label property. */
  checkboxLabel?: string;
  /** Position property. */
  position?: string;
  /** Sort order property. */
  sortOrder?: number;
  /** Is active property. */
  isActive?: boolean;
}

/** Checkout upsell shape. */
export interface CheckoutUpsell {
  /** Id property. */
  id?: string;
  /** Title property. */
  title: string;
  /** Description property. */
  description: string;
  /** Product name property. */
  productName: string;
  /** Price property. */
  price: number;
  /** Headline property. */
  headline?: string;
  /** Image property. */
  image?: string;
  /** Compare at price property. */
  compareAtPrice?: number;
  /** Accept btn text property. */
  acceptBtnText?: string;
  /** Decline btn text property. */
  declineBtnText?: string;
  /** Timer seconds property. */
  timerSeconds?: number;
  /** Charge type property. */
  chargeType?: string;
  /** Sort order property. */
  sortOrder?: number;
  /** Is active property. */
  isActive?: boolean;
}

/** Checkout pixel shape. */
export interface CheckoutPixel {
  /** Id property. */
  id?: string;
  /** Type property. */
  type: string;
  /** Pixel id property. */
  pixelId: string;
  /** Access token property. */
  accessToken?: string;
  /** Track page view property. */
  trackPageView?: boolean;
  /** Track initiate checkout property. */
  trackInitiateCheckout?: boolean;
  /** Track add payment info property. */
  trackAddPaymentInfo?: boolean;
  /** Track purchase property. */
  trackPurchase?: boolean;
  /** Is active property. */
  isActive?: boolean;
}

/** Checkout config shape. */
export interface CheckoutConfig {
  /* Theme */
  theme: 'NOIR' | 'BLANC';

  /* Colors */
  accentColor: string;
  /** Accent color2 property. */
  accentColor2: string;
  /** Background color property. */
  backgroundColor: string;
  /** Card color property. */
  cardColor: string;
  /** Text color property. */
  textColor: string;

  /* Header */
  brandName: string;
  /** Brand logo property. */
  brandLogo: string;
  /** Header message property. */
  headerMessage: string;
  /** Header sub message property. */
  headerSubMessage: string;

  /* Product */
  productImage: string;
  /** Product display name property. */
  productDisplayName: string;

  /* Buttons */
  btnStep1Text: string;
  /** Btn step2 text property. */
  btnStep2Text: string;
  /** Btn finalize text property. */
  btnFinalizeText: string;

  /* Fields */
  requireCPF: boolean;
  /** Require phone property. */
  requirePhone: boolean;
  /** Phone label property. */
  phoneLabel: string;

  /* Payment Methods */
  enableCreditCard: boolean;
  /** Enable pix property. */
  enablePix: boolean;
  /** Enable boleto property. */
  enableBoleto: boolean;

  /* Coupon Popup */
  enableCoupon: boolean;
  /** Show coupon popup property. */
  showCouponPopup: boolean;
  /** Coupon popup title property. */
  couponPopupTitle: string;
  /** Coupon popup desc property. */
  couponPopupDesc: string;
  /** Auto coupon code property. */
  autoCouponCode: string;

  /* Timer */
  enableTimer: boolean;
  /** Timer type property. */
  timerType: string;
  /** Timer minutes property. */
  timerMinutes: number;
  /** Timer message property. */
  timerMessage: string;

  /* Stock Counter */
  showStockCounter: boolean;
  /** Stock message property. */
  stockMessage: string;
  /** Fake stock count property. */
  fakeStockCount: number;

  /* Testimonials */
  testimonials: CheckoutTestimonial[];

  /* Guarantee */
  enableGuarantee: boolean;
  /** Guarantee title property. */
  guaranteeTitle: string;
  /** Guarantee text property. */
  guaranteeText: string;
  /** Guarantee days property. */
  guaranteeDays: number;

  /* Trust Badges */
  enableTrustBadges: boolean;
  /** Trust badges property. */
  trustBadges: CheckoutTrustBadge[];

  /* Order Bumps */
  orderBumps: CheckoutOrderBump[];

  /* Upsells */
  upsells: CheckoutUpsell[];

  /* Exit Intent */
  enableExitIntent: boolean;
  /** Exit intent title property. */
  exitIntentTitle: string;
  /** Exit intent coupon code property. */
  exitIntentCouponCode: string;

  /* Floating Bar */
  enableFloatingBar: boolean;
  /** Floating bar message property. */
  floatingBarMessage: string;

  /* SEO */
  metaTitle: string;
  /** Meta description property. */
  metaDescription: string;
  /** Meta image property. */
  metaImage: string;

  /* Custom CSS */
  customCSS: string;

  /* Pixels */
  pixels: CheckoutPixel[];

  /* Slug (read-only) */
  slug?: string;
  /** Reference code property. */
  referenceCode?: string;

  [key: string]: unknown;
}

/** Default_config. */
export const DEFAULT_CONFIG: CheckoutConfig = {
  theme: 'NOIR',
  accentColor: 'colors.ember.primary',
  accentColor2: '#D14E25',
  backgroundColor: 'colors.background.void',
  cardColor: 'colors.background.surface',
  textColor: 'colors.text.silver',
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
  const normalized = String(value || '')
    .trim()
    .toUpperCase();

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
  const normalized = String(value || '')
    .trim()
    .toUpperCase();

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

function resolveBumpPrice(item: Record<string, unknown>): number {
  return typeof item.price === 'number' ? item.price : Number(item.priceInCents || 0) / 100;
}

function normalizeOrderBumpEntry(entry: unknown) {
  const item = entry as Record<string, unknown>;
  return {
    id: typeof item.id === 'string' ? item.id : undefined,
    title: String(item.title || ''),
    description: String(item.description || ''),
    productName: String(item.productName || ''),
    price: resolveBumpPrice(item),
    image: typeof item.image === 'string' ? item.image : undefined,
    compareAtPrice: typeof item.compareAtPrice === 'number' ? item.compareAtPrice / 100 : undefined,
    highlightColor: typeof item.highlightColor === 'string' ? item.highlightColor : undefined,
    checkboxLabel: typeof item.checkboxLabel === 'string' ? item.checkboxLabel : undefined,
    position: typeof item.position === 'string' ? item.position : undefined,
    sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : undefined,
    isActive: typeof item.isActive === 'boolean' ? item.isActive : undefined,
  };
}

function normalizeConfigForEditor(data: Record<string, unknown>): CheckoutConfig {
  const raw = data as Record<string, unknown> & {
    plan?: { slug?: string; referenceCode?: string };
  };
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
    ? rest.orderBumps.map(normalizeOrderBumpEntry)
    : DEFAULT_CONFIG.orderBumps;

  const upsells = Array.isArray(rest.upsells)
    ? rest.upsells.map((entry) => {
        const item = entry as Record<string, unknown>;
        return {
          id: typeof item.id === 'string' ? item.id : undefined,
          title: String(item.title || ''),
          description: String(item.description || ''),
          productName: String(item.productName || ''),
          price: typeof item.price === 'number' ? item.price : Number(item.priceInCents || 0) / 100,
          headline: typeof item.headline === 'string' ? item.headline : undefined,
          image: typeof item.image === 'string' ? item.image : undefined,
          compareAtPrice:
            typeof item.compareAtPrice === 'number' ? item.compareAtPrice / 100 : undefined,
          acceptBtnText: typeof item.acceptBtnText === 'string' ? item.acceptBtnText : undefined,
          declineBtnText: typeof item.declineBtnText === 'string' ? item.declineBtnText : undefined,
          timerSeconds: typeof item.timerSeconds === 'number' ? item.timerSeconds : undefined,
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
          accessToken: typeof item.accessToken === 'string' ? item.accessToken : undefined,
          trackPageView: typeof item.trackPageView === 'boolean' ? item.trackPageView : true,
          trackInitiateCheckout:
            typeof item.trackInitiateCheckout === 'boolean' ? item.trackInitiateCheckout : true,
          trackAddPaymentInfo:
            typeof item.trackAddPaymentInfo === 'boolean' ? item.trackAddPaymentInfo : true,
          trackPurchase: typeof item.trackPurchase === 'boolean' ? item.trackPurchase : true,
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
    referenceCode:
      typeof rest.referenceCode === 'string'
        ? rest.referenceCode
        : typeof plan?.referenceCode === 'string'
          ? plan.referenceCode
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
      if (!planId) {
        return;
      }

      const next = { ...config, ...patch };
      mutate(next, false);

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

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
