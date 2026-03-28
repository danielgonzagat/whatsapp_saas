'use client';

import { useEffect, useRef } from 'react';

/* ─── Types ────────────────────────────────────────────────────────────────── */

export type PixelEvent = 'PageView' | 'InitiateCheckout' | 'AddPaymentInfo' | 'Purchase';

export interface PixelConfig {
  id: string;
  type: 'FACEBOOK' | 'GOOGLE_ADS' | 'GOOGLE_ANALYTICS' | 'TIKTOK' | 'KWAI' | 'TABOOLA' | 'CUSTOM';
  pixelId: string;
  accessToken?: string;
  trackPageView: boolean;
  trackInitiateCheckout: boolean;
  trackAddPaymentInfo: boolean;
  trackPurchase: boolean;
  isActive: boolean;
}

interface PixelTrackerProps {
  pixels: PixelConfig[];
  event: PixelEvent;
  value?: number;      // in cents
  currency?: string;
  orderId?: string;
}

/* ─── Event permission check ──────────────────────────────────────────────── */

function shouldTrack(pixel: PixelConfig, event: PixelEvent): boolean {
  if (!pixel.isActive) return false;
  switch (event) {
    case 'PageView':          return pixel.trackPageView;
    case 'InitiateCheckout':  return pixel.trackInitiateCheckout;
    case 'AddPaymentInfo':    return pixel.trackAddPaymentInfo;
    case 'Purchase':          return pixel.trackPurchase;
    default:                  return false;
  }
}

/* ─── Script injectors ────────────────────────────────────────────────────── */

function ensureFacebookPixel(pixelId: string): void {
  if (typeof window === 'undefined') return;
  if ((window as any).fbq) return;
  const f = window as any;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const n: any = (f.fbq = function (...args: any[]) {
    n.callMethod ? n.callMethod.apply(n, args) : n.queue.push(args);
  });
  if (!f._fbq) f._fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  n.queue = [];
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(s);
  (window as any).fbq('init', pixelId);
}

function fireFacebook(pixelId: string, event: PixelEvent, params?: Record<string, any>): void {
  ensureFacebookPixel(pixelId);
  const fbq = (window as any).fbq;
  if (!fbq) return;
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
  if (typeof window === 'undefined') return;
  if ((window as any).gtag) return;
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${pixelId}`;
  document.head.appendChild(s);
  (window as any).dataLayer = (window as any).dataLayer || [];
  (window as any).gtag = function (...args: any[]) {
    (window as any).dataLayer.push(args);
  };
  (window as any).gtag('js', new Date());
  (window as any).gtag('config', pixelId);
}

function fireGoogle(pixelId: string, event: PixelEvent, params?: Record<string, any>): void {
  ensureGtag(pixelId);
  const gtag = (window as any).gtag;
  if (!gtag) return;
  const eventMap: Record<PixelEvent, string> = {
    PageView: 'page_view',
    InitiateCheckout: 'begin_checkout',
    AddPaymentInfo: 'add_payment_info',
    Purchase: 'purchase',
  };
  gtag('event', eventMap[event], params);
}

function ensureTikTok(pixelId: string): void {
  if (typeof window === 'undefined') return;
  if ((window as any).ttq) return;
  const t = (window as any).TiktokAnalyticsObject = 'ttq';
  const ttq = (window as any)[t] = (window as any)[t] || [];
  ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie'];
  ttq.setAndDefer = function (t: any, e: string) {
    t[e] = function (...args: any[]) {
      t.push([e, ...args]);
    };
  };
  for (const m of ttq.methods) ttq.setAndDefer(ttq, m);
  ttq.instance = function (id: string) {
    const inst = ttq._i[id] || [];
    for (const m of ttq.methods) ttq.setAndDefer(inst, m);
    return inst;
  };
  ttq.load = function (id: string) {
    const s = document.createElement('script');
    s.type = 'text/javascript';
    s.async = true;
    s.src = 'https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=' + id + '&lib=ttq';
    document.head.appendChild(s);
  };
  ttq._i = ttq._i || {};
  ttq.load(pixelId);
  ttq.page();
}

function fireTikTok(pixelId: string, event: PixelEvent, params?: Record<string, any>): void {
  ensureTikTok(pixelId);
  const ttq = (window as any).ttq;
  if (!ttq) return;
  const eventMap: Record<PixelEvent, string> = {
    PageView: 'ViewContent',
    InitiateCheckout: 'InitiateCheckout',
    AddPaymentInfo: 'AddPaymentInfo',
    Purchase: 'CompletePayment',
  };
  if (event === 'PageView') {
    ttq.page();
  } else {
    ttq.track(eventMap[event], params);
  }
}

/* ─── Component ────────────────────────────────────────────────────────────── */

export default function PixelTracker({ pixels, event, value, currency, orderId }: PixelTrackerProps) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    if (!pixels || pixels.length === 0) return;
    firedRef.current = true;

    const params: Record<string, any> = {};
    if (value != null) params.value = value / 100;
    if (currency) params.currency = currency;
    if (orderId) params.order_id = orderId;

    for (const pixel of pixels) {
      if (!shouldTrack(pixel, event)) continue;

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
  }, [pixels, event, value, currency, orderId]);

  return null;
}
