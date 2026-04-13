'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { buildMarketingUrl } from '@/lib/subdomains';
import { cookieConsentApi } from '@/lib/api/cookie-consent';
import { COOKIE_TOKENS } from './cookie-data';
import { CookieBanner } from './CookieBanner';
import { CookiePreferencesModal } from './CookiePreferencesModal';
import { CookieScriptManager } from './CookieScriptManager';
import type { CookieConsentPreferences } from './cookie-types';

const OPEN_COOKIE_PREFERENCES_EVENT = 'kloel:open-cookie-preferences';

type CookieProviderProps = {
  children: ReactNode;
};

function normalizeConsent(
  input?: CookieConsentPreferences | null,
): CookieConsentPreferences | null {
  if (!input) return null;

  return {
    necessary: true,
    analytics: Boolean(input.analytics),
    marketing: Boolean(input.marketing),
    updatedAt: input.updatedAt,
  };
}

export function openCookiePreferences() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_COOKIE_PREFERENCES_EVENT));
}

export function CookieProvider({ children }: CookieProviderProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [consent, setConsent] = useState<CookieConsentPreferences | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isToastVisible, setIsToastVisible] = useState(false);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback(() => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    setIsToastVisible(true);
    toastTimerRef.current = window.setTimeout(() => setIsToastVisible(false), 2500);
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadConsent = async () => {
      const response = await cookieConsentApi.get();
      if (!mounted) return;

      setConsent(normalizeConsent(response.data?.consent ?? null));
      setIsLoaded(true);
    };

    void loadConsent();

    return () => {
      mounted = false;
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const openModal = () => setIsModalOpen(true);
    window.addEventListener(OPEN_COOKIE_PREFERENCES_EVENT, openModal);
    return () => window.removeEventListener(OPEN_COOKIE_PREFERENCES_EVENT, openModal);
  }, []);

  const persistConsent = useCallback(
    async (nextConsent: CookieConsentPreferences) => {
      const response = await cookieConsentApi.save(nextConsent);
      const savedConsent = normalizeConsent(response.data?.consent ?? nextConsent);
      setConsent(savedConsent);
      setIsModalOpen(false);
      showToast();
    },
    [showToast],
  );

  const goToPolicyPage = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.location.assign(buildMarketingUrl('/cookies', window.location.host));
  }, []);

  const handleAcceptAll = useCallback(() => {
    void persistConsent({ necessary: true, analytics: true, marketing: true });
  }, [persistConsent]);

  const handleRejectNonEssential = useCallback(() => {
    void persistConsent({ necessary: true, analytics: false, marketing: false });
  }, [persistConsent]);

  const handleSavePreferences = useCallback(
    (preferences: CookieConsentPreferences) => {
      void persistConsent(preferences);
    },
    [persistConsent],
  );

  return (
    <>
      <style>{`
        @keyframes kloelCookieSlideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes kloelCookieFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes kloelCookieModalIn {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes kloelCookieToastIn {
          from { transform: translate(-50%, -20px); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }
        .kloel-cookie-banner {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 9999;
          background: ${COOKIE_TOKENS.surface};
          border-top: 1px solid ${COOKIE_TOKENS.border};
          padding: 24px 40px;
          animation: kloelCookieSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .kloel-cookie-banner__inner {
          max-width: 1320px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 40px;
        }
        .kloel-cookie-banner__text {
          flex: 1 1 0;
          min-width: 0;
        }
        .kloel-cookie-banner__buttons {
          display: flex;
          gap: 10px;
          flex-shrink: 0;
          align-items: center;
        }
        .kloel-cookie-banner__button {
          min-width: 0;
          white-space: nowrap;
          appearance: none;
          -webkit-appearance: none;
          font-family: ${COOKIE_TOKENS.font};
          font-size: 14px;
          font-weight: 500;
          color: ${COOKIE_TOKENS.silver};
          background: ${COOKIE_TOKENS.buttonBg};
          border: none;
          border-radius: 999px;
          padding: 13px 26px;
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .kloel-cookie-banner__button:hover {
          background: ${COOKIE_TOKENS.buttonBgHover};
        }
        .kloel-cookie-banner__link {
          appearance: none;
          -webkit-appearance: none;
          background: none;
          border: none;
          padding: 0;
          font-family: ${COOKIE_TOKENS.font};
          font-size: 14px;
          color: ${COOKIE_TOKENS.silver};
          text-decoration: underline;
          text-underline-offset: 3px;
          cursor: pointer;
        }
        .kloel-cookie-modal__overlay {
          position: fixed;
          inset: 0;
          z-index: 10000;
          background: ${COOKIE_TOKENS.overlay};
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          animation: kloelCookieFadeIn 0.25s ease both;
        }
        .kloel-cookie-modal {
          width: 100%;
          max-width: 480px;
          max-height: 85vh;
          overflow: auto;
          background: ${COOKIE_TOKENS.surface};
          border: 1px solid ${COOKIE_TOKENS.border};
          border-radius: ${COOKIE_TOKENS.radius}px;
          animation: kloelCookieModalIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .kloel-cookie-modal__close {
          appearance: none;
          -webkit-appearance: none;
          background: none;
          border: none;
          color: ${COOKIE_TOKENS.dim};
          cursor: pointer;
          padding: 4px;
          line-height: 0;
          transition: color 0.15s ease;
        }
        .kloel-cookie-modal__close:hover {
          color: ${COOKIE_TOKENS.silver};
        }
        .kloel-cookie-modal__label {
          font-family: ${COOKIE_TOKENS.font};
          font-size: 14px;
          font-weight: 600;
          color: ${COOKIE_TOKENS.silver};
        }
        .kloel-cookie-modal__description {
          font-family: ${COOKIE_TOKENS.font};
          font-size: 12px;
          color: ${COOKIE_TOKENS.muted};
          line-height: 1.6;
          margin: 0;
        }
        .kloel-cookie-modal__divider {
          height: 1px;
          background: ${COOKIE_TOKENS.border};
          margin: 0 0 24px;
        }
        .kloel-cookie-modal__save {
          width: 100%;
          appearance: none;
          -webkit-appearance: none;
          font-family: ${COOKIE_TOKENS.font};
          font-size: 14px;
          font-weight: 600;
          color: ${COOKIE_TOKENS.onAccent};
          background: ${COOKIE_TOKENS.ember};
          border: none;
          border-radius: 999px;
          padding: 14px 0;
          cursor: pointer;
          transition: background 0.15s ease;
          letter-spacing: -0.01em;
        }
        .kloel-cookie-modal__save:hover {
          background: ${COOKIE_TOKENS.emberHover};
        }
        .kloel-cookie-toast {
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 10001;
          background: ${COOKIE_TOKENS.surface};
          border: 1px solid ${COOKIE_TOKENS.border};
          border-radius: ${COOKIE_TOKENS.radius}px;
          padding: 12px 24px;
          display: flex;
          align-items: center;
          gap: 10px;
          animation: kloelCookieToastIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
          box-shadow: ${COOKIE_TOKENS.shadow};
        }
        @media (max-width: 800px) {
          .kloel-cookie-banner {
            padding: 24px 24px 28px;
          }
          .kloel-cookie-banner__inner {
            flex-direction: column;
            align-items: flex-start;
            gap: 20px;
          }
          .kloel-cookie-banner__buttons {
            align-self: stretch;
            justify-content: flex-start;
          }
        }
        @media (max-width: 480px) {
          .kloel-cookie-banner {
            padding: 24px 20px 28px;
          }
          .kloel-cookie-banner__inner {
            gap: 16px;
          }
          .kloel-cookie-banner__buttons {
            flex-direction: column;
            width: 100%;
            gap: 8px;
          }
          .kloel-cookie-banner__button {
            width: 100%;
            text-align: center;
            padding: 15px 24px;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .kloel-cookie-banner,
          .kloel-cookie-modal__overlay,
          .kloel-cookie-modal,
          .kloel-cookie-toast {
            animation: none !important;
            transform: none !important;
          }
          .kloel-cookie-banner__button,
          .kloel-cookie-banner__link,
          .kloel-cookie-modal__close,
          .kloel-cookie-modal__save {
            transition: none !important;
          }
        }
      `}</style>

      {children}
      <CookieScriptManager consent={consent} />

      {isLoaded && !consent && !isModalOpen ? (
        <CookieBanner
          onAcceptAll={handleAcceptAll}
          onRejectNonEssential={handleRejectNonEssential}
          onManage={() => setIsModalOpen(true)}
          onPolicyClick={goToPolicyPage}
        />
      ) : null}

      {isModalOpen ? (
        <CookiePreferencesModal
          onClose={() => setIsModalOpen(false)}
          onSave={handleSavePreferences}
          onPolicyClick={goToPolicyPage}
          initialPrefs={consent}
        />
      ) : null}

      {isToastVisible ? (
        <div className="kloel-cookie-toast" role="status" aria-live="polite">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="8" fill={COOKIE_TOKENS.ember} opacity="0.15" />
            <path
              d="M5 8L7 10L11 6"
              stroke={COOKIE_TOKENS.ember}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span
            style={{
              fontFamily: COOKIE_TOKENS.font,
              fontSize: 13,
              color: COOKIE_TOKENS.silver,
            }}
          >
            Preferências de cookies salvas
          </span>
        </div>
      ) : null}
    </>
  );
}
