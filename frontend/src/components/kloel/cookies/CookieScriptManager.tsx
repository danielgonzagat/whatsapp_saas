'use client';

import { getSharedCookieDomain } from '@/lib/subdomains';
import Script from 'next/script';
import { useEffect } from 'react';
import { COOKIE_DATA } from './cookie-data';
import type { CookieConsentPreferences } from './cookie-types';

const PATTERN_RE = /\*+$/;

type CookieScriptManagerProps = {
  consent: CookieConsentPreferences | null;
};

function resolveManagedCookieNames(patterns: string[]): string[] {
  if (typeof document === 'undefined') return [];

  const cookieNames = document.cookie
    .split(';')
    .map((entry) => entry.trim().split('=')[0])
    .filter(Boolean);
  const names = new Set<string>();

  for (const pattern of patterns) {
    if (pattern.includes('*')) {
      const prefix = pattern.replace(PATTERN_RE, '');
      cookieNames.filter((name) => name.startsWith(prefix)).forEach((name) => names.add(name));
      continue;
    }

    names.add(pattern);
  }

  return [...names];
}

function expireCookie(name: string, domain?: string) {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  const domainPart = domain ? `; domain=${domain}` : '';
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax${domainPart}${secure}`;
}

function removeManagedCookies(patterns: string[]) {
  if (typeof window === 'undefined') return;

  const names = resolveManagedCookieNames(patterns);
  const currentHostname = window.location.hostname;
  const sharedDomain = getSharedCookieDomain(window.location.host);
  const candidateDomains = new Set<string | undefined>([
    undefined,
    currentHostname,
    currentHostname.startsWith('www.') ? currentHostname.slice(4) : undefined,
    sharedDomain,
    currentHostname === 'kloel.com' ? '.kloel.com' : undefined,
  ]);

  for (const name of names) {
    for (const domain of candidateDomains) {
      expireCookie(name, domain);
    }
  }
}

const analyticsCookiePatterns = COOKIE_DATA.analytics.map((cookie) => cookie.name);
const marketingCookiePatterns = COOKIE_DATA.marketing.map((cookie) => cookie.name);

export function CookieScriptManager({ consent }: CookieScriptManagerProps) {
  const analyticsEnabled = Boolean(consent?.analytics);
  const marketingEnabled = Boolean(consent?.marketing);
  const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() || '';
  const googleAdsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim() || '';
  const metaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() || '';
  const tiktokPixelId = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID?.trim() || '';

  const googleTagIds = [
    analyticsEnabled ? gaMeasurementId : '',
    marketingEnabled ? googleAdsId : '',
  ].filter(Boolean);

  useEffect(() => {
    if (!analyticsEnabled) {
      removeManagedCookies(analyticsCookiePatterns);
      if (gaMeasurementId && typeof window !== 'undefined') {
        (window as unknown as Record<string, unknown>)[`ga-disable-${gaMeasurementId}`] = true;
      }
    } else if (gaMeasurementId && typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>)[`ga-disable-${gaMeasurementId}`] = false;
    }
  }, [analyticsEnabled, gaMeasurementId]);

  useEffect(() => {
    if (!marketingEnabled) {
      removeManagedCookies(marketingCookiePatterns);
    }
  }, [marketingEnabled]);

  if (!consent) {
    return null;
  }

  return (
    <>
      {googleTagIds.length ? (
        <>
          <Script
            id="kloel-google-tag-src"
            src={`https://www.googletagmanager.com/gtag/js?id=${googleTagIds[0]}`}
            strategy="afterInteractive"
          />
          <Script id="kloel-google-tag-config" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              window.gtag = window.gtag || gtag;
              gtag('js', new Date());
              ${googleTagIds
                .map((id) =>
                  analyticsEnabled && id === gaMeasurementId
                    ? `gtag('config', '${id}', { anonymize_ip: true });`
                    : `gtag('config', '${id}');`,
                )
                .join('\n')}
            `}
          </Script>
        </>
      ) : null}

      {marketingEnabled && metaPixelId ? (
        <Script id="kloel-meta-pixel" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
            n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
            (window, document,'script','https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${metaPixelId}');
            fbq('track', 'PageView');
          `}
        </Script>
      ) : null}

      {marketingEnabled && tiktokPixelId ? (
        <Script id="kloel-tiktok-pixel" strategy="afterInteractive">
          {`
            !function (w, d, t) {
              w.TiktokAnalyticsObject=t;
              var ttq=w[t]=w[t]||[];
              ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];
              ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
              for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
              ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
              ttq.load=function(e,n){var r='https://analytics.tiktok.com/i18n/pixel/events.js';
              ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=r;ttq._t=ttq._t||{};ttq._t[e]=+new Date;
              ttq._o=ttq._o||{};ttq._o[e]=n||{};
              var o=document.createElement('script');o.type='text/javascript';o.async=!0;o.src=r+'?sdkid='+e+'&lib='+t;
              var a=document.getElementsByTagName('script')[0];a.parentNode.insertBefore(o,a)};
              ttq.load('${tiktokPixelId}');
              ttq.page();
            }(window, document, 'ttq');
          `}
        </Script>
      ) : null}
    </>
  );
}
