'use client';

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
        d="M4 4L12 12M12 4L4 12"
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
        border: `1.5px solid ${checked ? COOKIE_TOKENS.silver : COOKIE_TOKENS.dim}`,
        background: checked ? COOKIE_TOKENS.silver : 'transparent',
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
            d="M2.5 6L5 8.5L9.5 4"
            stroke={COOKIE_TOKENS.void}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </button>
  );
}

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
              Central de preferencias de cookies
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="kloel-cookie-modal__close"
              aria-label="Fechar preferencias de cookies"
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
            Para usar sites e aplicativos, e preciso armazenar e acessar informacoes no seu
            dispositivo, inclusive cookies e outros identificadores. Eles podem ser compartilhados
            com terceiros para diversas atividades. Fornecemos uma ferramenta simples, que permite
            adaptar suas opcoes da forma que voce considerar mais conveniente. Voce pode alterar o
            seu consentimento quando quiser.{' '}
            <button type="button" onClick={onPolicyClick} className="kloel-cookie-banner__link">
              Saiba mais
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
                Cookies estritamente necessarios (sempre ativos)
              </span>
              <Checkbox checked disabled />
            </div>
            <p className="kloel-cookie-modal__description">
              Estes cookies sao essenciais para o funcionamento do site e nao e possivel
              desativa-los. Eles sao uteis para seguranca, autenticacao de usuarios, suporte ao
              cliente e outras acoes.
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
              <span className="kloel-cookie-modal__label">Cookies de analise</span>
              <Checkbox checked={analytics} onChange={() => setAnalytics((value) => !value)} />
            </div>
            <p className="kloel-cookie-modal__description">
              Esses cookies nos ajudam a entender a interacao dos visitantes com o nosso site.
              Gracas a eles, podemos medir o trafego e melhorar o desempenho do site.
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
              <span className="kloel-cookie-modal__label">Cookies para analise de marketing</span>
              <Checkbox checked={marketing} onChange={() => setMarketing((value) => !value)} />
            </div>
            <p className="kloel-cookie-modal__description">
              Esses cookies ajudam a medir a eficacia das nossas campanhas de marketing.
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
            Pronto
          </button>
        </div>
      </div>
    </div>
  );
}
