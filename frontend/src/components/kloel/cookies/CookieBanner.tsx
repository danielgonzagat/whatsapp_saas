'use client';

import { COOKIE_TOKENS } from './cookie-data';

type CookieBannerProps = {
  onAcceptAll: () => void;
  onRejectNonEssential: () => void;
  onManage: () => void;
  onPolicyClick: () => void;
};

export function CookieBanner({
  onAcceptAll,
  onRejectNonEssential,
  onManage,
  onPolicyClick,
}: CookieBannerProps) {
  return (
    <div className="kloel-cookie-banner" role="dialog" aria-live="polite" aria-label="Cookies">
      <div className="kloel-cookie-banner__inner">
        <div className="kloel-cookie-banner__text">
          <p
            style={{
              fontFamily: COOKIE_TOKENS.font,
              fontSize: 17,
              fontWeight: 700,
              color: COOKIE_TOKENS.silver,
              margin: '0 0 8px',
              letterSpacing: '-0.02em',
            }}
          >
            Nos usamos cookies
          </p>
          <p
            style={{
              fontFamily: COOKIE_TOKENS.font,
              fontSize: 14,
              color: COOKIE_TOKENS.muted,
              margin: 0,
              lineHeight: 1.65,
            }}
          >
            Utilizamos cookies para ajudar este site a funcionar, compreender a utilizacao do
            servico e promover esforcos de marketing. Acessar{' '}
            <button type="button" onClick={onManage} className="kloel-cookie-banner__link">
              Gerenciar cookies
            </button>{' '}
            para alterar as preferencias a qualquer momento. Leia nossa{' '}
            <button type="button" onClick={onPolicyClick} className="kloel-cookie-banner__link">
              Politica de cookies
            </button>{' '}
            para saber mais.
          </p>
        </div>

        <div className="kloel-cookie-banner__buttons">
          <button type="button" onClick={onManage} className="kloel-cookie-banner__button">
            Gerenciar cookies
          </button>
          <button
            type="button"
            onClick={onRejectNonEssential}
            className="kloel-cookie-banner__button"
          >
            Rejeitar cookies nao essenciais
          </button>
          <button type="button" onClick={onAcceptAll} className="kloel-cookie-banner__button">
            Aceitar tudo
          </button>
        </div>
      </div>
    </div>
  );
}
