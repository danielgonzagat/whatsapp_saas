'use client';

import { kloelT } from '@/lib/i18n/t';
import { useEffect, useRef, useState } from 'react';
import { COOKIE_TOKENS } from './cookie-data';
import type { CookieConsentPreferences } from './cookie-types';

type CookiePreferencesModalProps = {
  onClose: () => void;
  onSave: (preferences: CookieConsentPreferences) => void;
  onPolicyClick: () => void;
  initialPrefs: CookieConsentPreferences | null;
};

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d={kloelT(`M4 4L12 12M12 4L4 12`)}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Checkbox({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onChange}
      aria-pressed={checked}
      aria-disabled={disabled}
      style={{
        width: 20,
        height: 20,
        borderRadius: 4,
        border: `1.5px solid ${checked ? COOKIE_TOKENS.ember : COOKIE_TOKENS.dim}`,
        background: checked ? COOKIE_TOKENS.ember : 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s ease',
        flexShrink: 0,
        opacity: disabled ? 0.4 : 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
      }}
    >
      {checked ? (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path
            d={kloelT(`M2.5 6L5 8.5L9.5 4`)}
            stroke={COOKIE_TOKENS.onAccent}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </button>
  );
}

/** Cookie preferences modal. */
export function CookiePreferencesModal({
  onClose,
  onSave,
  onPolicyClick,
  initialPrefs,
}: CookiePreferencesModalProps) {
  const [analytics, setAnalytics] = useState(initialPrefs?.analytics ?? false);
  const [marketing, setMarketing] = useState(initialPrefs?.marketing ?? false);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      ref={overlayRef}
      className="kloel-cookie-modal__overlay"
      onMouseDown={(event) => {
        if (event.target === overlayRef.current) {
          onClose();
        }
      }}
    >
      <div className="kloel-cookie-modal" role="dialog" aria-modal="true">
        <div style={{ padding: '28px 28px 0' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 16,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontFamily: COOKIE_TOKENS.font,
                fontSize: 18,
                fontWeight: 700,
                color: COOKIE_TOKENS.silver,
                letterSpacing: '-0.02em',
              }}
            >
              {kloelT(`Central de preferências de cookies`)}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="kloel-cookie-modal__close"
              aria-label="Fechar preferências de cookies"
            >
              <CloseIcon />
            </button>
          </div>
          <p
            style={{
              fontFamily: COOKIE_TOKENS.font,
              fontSize: 13,
              color: COOKIE_TOKENS.muted,
              margin: '14px 0 0',
              lineHeight: 1.7,
            }}
          >
            {kloelT(`Para usar sites e aplicativos, é preciso armazenar e acessar informações no seu
            dispositivo, inclusive cookies e outros identificadores. Eles podem ser compartilhados
            com terceiros para diversas atividades. Fornecemos uma ferramenta simples, que permite
            adaptar suas opções da forma que você considerar mais conveniente. Você pode alterar o
            seu consentimento quando quiser.`)}{' '}
            <button type="button" onClick={onPolicyClick} className="kloel-cookie-banner__link">
              {kloelT(`Saiba mais`)}
            </button>
            .
          </p>
        </div>

        <div style={{ padding: '24px 28px' }}>
          <div style={{ marginBottom: 24 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 16,
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  fontFamily: COOKIE_TOKENS.font,
                  fontSize: 14,
                  fontWeight: 600,
                  color: COOKIE_TOKENS.silver,
                }}
              >
                {kloelT(`Cookies estritamente necessários (sempre ativos)`)}
              </span>
              <Checkbox checked disabled />
            </div>
            <p className="kloel-cookie-modal__description">
              {kloelT(`Estes cookies são essenciais para o funcionamento do site e não é possível
              desativá-los. Eles são úteis para segurança, autenticação de usuários, suporte ao
              cliente e outras ações.`)}
            </p>
          </div>

          <div className="kloel-cookie-modal__divider" />

          <div style={{ marginBottom: 24 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 16,
                marginBottom: 8,
              }}
            >
              <span className="kloel-cookie-modal__label">{kloelT(`Cookies de análise`)}</span>
              <Checkbox checked={analytics} onChange={() => setAnalytics((value) => !value)} />
            </div>
            <p className="kloel-cookie-modal__description">
              {kloelT(`Esses cookies nos ajudam a entender a interação dos visitantes com o nosso site.
              Graças a eles, podemos medir o tráfego e melhorar o desempenho do site.`)}
            </p>
          </div>

          <div className="kloel-cookie-modal__divider" />

          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 16,
                marginBottom: 8,
              }}
            >
              <span className="kloel-cookie-modal__label">
                {kloelT(`Cookies para análise de marketing`)}
              </span>
              <Checkbox checked={marketing} onChange={() => setMarketing((value) => !value)} />
            </div>
            <p className="kloel-cookie-modal__description">
              {kloelT(`Esses cookies ajudam a medir a eficácia das nossas campanhas de marketing.`)}
            </p>
          </div>
        </div>

        <div style={{ padding: '0 28px 28px' }}>
          <button
            type="button"
            onClick={() =>
              onSave({
                necessary: true,
                analytics,
                marketing,
              })
            }
            className="kloel-cookie-modal__save"
          >
            {kloelT(`Pronto`)}
          </button>
        </div>
      </div>
    </div>
  );
}
