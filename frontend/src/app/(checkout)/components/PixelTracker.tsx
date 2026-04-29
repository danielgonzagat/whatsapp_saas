'use client';

import type { CookieConsentPreferences } from '@/components/kloel/cookies/cookie-types';
import type { PixelConfig } from '@/lib/public-checkout-contract';
import { useEffect, useRef } from 'react';

/* ─── Window globals for third-party pixel SDKs ────────────────────────────── */

type PixelFn = (...args: unknown[]) => void;

interface PixelWindow {
  fbq?: PixelFn & {
    callMethod?: PixelFn;
    queue?: unknown[][];
    push?: PixelFn;
    loaded?: boolean;
    version?: string;
  };
  _fbq?: PixelFn;
  gtag?: PixelFn;
  dataLayer?: unknown[];
  ttq?: PixelFn & {
    methods?: string[];
    setAndDefer?: (target: Record<string, unknown>, method: string) => void;
    instance?: (id: string) => unknown[];
    load?: (id: string) => void;
    page?: () => void;
    track?: (event: string, params?: Record<string, unknown>) => void;
    _i?: Record<string, unknown[]>;
  };
  TiktokAnalyticsObject?: string;
}

// Bridges values whose runtime shape matches a target interface but whose
// declared TS type is wider (e.g. global `Window`, third-party SDK queue
// objects). A single function-mediated cast keeps the call sites free of
// repeated cast chains while still letting TypeScript verify the target
// type at the use site.
const cast = <T,>(value: unknown): T => value as T;

function getPixelWindow(): PixelWindow {
  if (typeof window === 'undefined') {
    return {} as PixelWindow;
  }
  return cast<PixelWindow>(window);
}

/* ─── Types ────────────────────────────────────────────────────────────────── */

export type PixelEvent = 'PageView' | 'InitiateCheckout' | 'AddPaymentInfo' | 'Purchase';
export type { PixelConfig } from '@/lib/public-checkout-contract';

interface PixelTrackerProps {
  pixels: PixelConfig[];
  event: PixelEvent;
  value?: number; // in cents
  currency?: string;
  orderId?: string;
}

function readCookieConsent(): CookieConsentPreferences | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const prefix = 'kloel_consent=';
  const match = document.cookie
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(prefix));

  if (!match) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(match.slice(prefix.length)));
    return {
      necessary: true,
      analytics: Boolean(parsed?.analytics),
      marketing: Boolean(parsed?.marketing),
      updatedAt: parsed?.updatedAt,
    };
  } catch {
    return null;
  }
}

/* ─── Event permission check ──────────────────────────────────────────────── */

function shouldTrack(pixel: PixelConfig, event: PixelEvent): boolean {
  if (!pixel.isActive) {
    return false;
  }
  switch (event) {
    case 'PageView':
      return pixel.trackPageView;
    case 'InitiateCheckout':
      return pixel.trackInitiateCheckout;
    case 'AddPaymentInfo':
      return pixel.trackAddPaymentInfo;
    case 'Purchase':
      return pixel.trackPurchase;
    default:
      return false;
  }
}

/* ─── Script injectors ────────────────────────────────────────────────────── */

function ensureFacebookPixel(pixelId: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }
  const pw = getPixelWindow();
  if (pw.fbq) {
    return;
  }
  const n: PixelFn & {
    callMethod?: PixelFn;
    queue?: unknown[][];
    push?: PixelFn;
    loaded?: boolean;
    version?: string;
  } = Object.assign(
    (...args: unknown[]) => {
      if (n.callMethod) {
        n.callMethod(...args);
      } else {
        n.queue?.push(args);
      }
    },
    { queue: [] as unknown[][], loaded: true, version: '2.0' } as const,
  );
  pw.fbq = n;
  if (!pw._fbq) {
    pw._fbq = n;
  }
  n.push = n;
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(s);
  pw.fbq('init', pixelId);
}

function fireFacebook(pixelId: string, event: PixelEvent, params?: Record<string, unknown>): void {
  ensureFacebookPixel(pixelId);
  const fbq = getPixelWindow().fbq;
  if (!fbq) {
    return;
  }
  if (event === 'PageView') {
    fbq('track', 'PageView');
  } else if (event === 'InitiateCheckout') {
    fbq('track', 'InitiateCheckout', params);
  } else if (event === 'AddPaymentInfo') {
    fbq('track', 'AddPaymentInfo', params);
  } else if (event === 'Purchase') {
    fbq('track', 'Purchase', params);
  }
}

function ensureGtag(pixelId: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  const pw = getPixelWindow();
  if (pw.gtag) {
    return;
  }
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${pixelId}`;
  document.head.appendChild(s);
  pw.dataLayer = pw.dataLayer || [];
  pw.gtag = (...args: unknown[]) => {
    pw.dataLayer?.push(args);
  };
  pw.gtag('js', new Date());
  pw.gtag('config', pixelId);
}

function fireGoogle(pixelId: string, event: PixelEvent, params?: Record<string, unknown>): void {
  ensureGtag(pixelId);
  const gtag = getPixelWindow().gtag;
  if (!gtag) {
    return;
  }
  const eventMap: Record<PixelEvent, string> = {
    PageView: 'page_view',
    InitiateCheckout: 'begin_checkout',
    AddPaymentInfo: 'add_payment_info',
    Purchase: 'purchase',
  };
  gtag('event', eventMap[event], params);
}

function ensureTikTok(pixelId: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  const pw = getPixelWindow();
  if (pw.ttq) {
    return;
  }
  pw.TiktokAnalyticsObject = 'ttq';
  const methods = [
    'page',
    'track',
    'identify',
    'instances',
    'debug',
    'on',
    'off',
    'once',
    'ready',
    'alias',
    'group',
    'enableCookie',
    'disableCookie',
  ];
  type TikTokQueue = unknown[] & {
    methods: string[];
    _i: Record<string, unknown[]>;
    setAndDefer?: (target: Record<string, unknown>, method: string) => void;
    instance?: (id: string) => unknown[];
    load?: (id: string) => void;
    page?: () => void;
  };
  const ttqObj: TikTokQueue = Object.assign([], {
    methods,
    _i: {} as Record<string, unknown[]>,
  });
  const setAndDefer = (target: Record<string, unknown>, method: string) => {
    target[method] = (...args: unknown[]) => {
      cast<unknown[]>(target).push([method, ...args]);
    };
  };
  ttqObj.setAndDefer = setAndDefer;
  for (const m of methods) {
    setAndDefer(cast<Record<string, unknown>>(ttqObj), m);
  }
  ttqObj.instance = (id: string) => {
    const store = ttqObj._i as Record<string, unknown[]>;
    const inst = store[id] || [];
    for (const m of methods) {
      setAndDefer(cast<Record<string, unknown>>(inst), m);
    }
    return inst;
  };
  ttqObj.load = (id: string) => {
    const s = document.createElement('script');
    s.type = 'text/javascript';
    s.async = true;
    s.src = `https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${id}&lib=ttq`;
    document.head.appendChild(s);
  };
  pw.ttq = cast<PixelWindow['ttq']>(ttqObj);
  (ttqObj.load as (id: string) => void)(pixelId);
  (ttqObj.page as () => void)();
}

function fireTikTok(pixelId: string, event: PixelEvent, params?: Record<string, unknown>): void {
  ensureTikTok(pixelId);
  const ttq = getPixelWindow().ttq;
  if (!ttq) {
    return;
  }
  const eventMap: Record<PixelEvent, string> = {
    PageView: 'ViewContent',
    InitiateCheckout: 'InitiateCheckout',
    AddPaymentInfo: 'AddPaymentInfo',
    Purchase: 'CompletePayment',
  };
  if (event === 'PageView') {
    ttq.page?.();
  } else {
    ttq.track?.(eventMap[event], params);
  }
}

const MARKETING_PIXEL_TYPES = new Set([
  'FACEBOOK',
  'GOOGLE_ADS',
  'TIKTOK',
  'KWAI',
  'TABOOLA',
  'CUSTOM',
]);

function buildPixelParams(
  value?: number,
  currency?: string,
  orderId?: string,
): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (value != null) {
    params.value = value / 100;
  }
  if (currency) {
    params.currency = currency;
  }
  if (orderId) {
    params.order_id = orderId;
  }
  return params;
}

function isConsentAllowed(pixel: PixelConfig, consent: CookieConsentPreferences): boolean {
  if (pixel.type === 'GOOGLE_ANALYTICS' && !consent.analytics) {
    return false;
  }
  if (MARKETING_PIXEL_TYPES.has(pixel.type) && !consent.marketing) {
    return false;
  }
  return true;
}

function dispatchPixel(
  pixel: PixelConfig,
  event: PixelEvent,
  params: Record<string, unknown>,
): void {
  switch (pixel.type) {
    case 'FACEBOOK':
      fireFacebook(pixel.pixelId, event, params);
      break;
    case 'GOOGLE_ADS':
    case 'GOOGLE_ANALYTICS':
      fireGoogle(pixel.pixelId, event, params);
      break;
    case 'TIKTOK':
      fireTikTok(pixel.pixelId, event, params);
      break;
    // KWAI, TABOOLA, CUSTOM — extend as needed
    default:
      break;
  }
}

/* ─── Component ────────────────────────────────────────────────────────────── */

export default function PixelTracker({
  pixels,
  event,
  value,
  currency,
  orderId,
}: PixelTrackerProps) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) {
      return;
    }
    if (!pixels || pixels.length === 0) {
      return;
    }
    const consent = readCookieConsent();
    if (!consent) {
      return;
    }
    firedRef.current = true;

    const params = buildPixelParams(value, currency, orderId);

    for (const pixel of pixels) {
      if (!shouldTrack(pixel, event)) {
        continue;
      }
      if (!isConsentAllowed(pixel, consent)) {
        continue;
      }
      dispatchPixel(pixel, event, params);
    }
  }, [pixels, event, value, currency, orderId]);

  return null;
}
