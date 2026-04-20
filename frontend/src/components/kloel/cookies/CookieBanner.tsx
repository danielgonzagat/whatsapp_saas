'use client';

import { kloelT } from '@/lib/i18n/t';
import { COOKIE_TOKENS } from './cookie-data';

type CookieBannerProps = {
  onAcceptAll: () => void;
  onRejectNonEssential: () => void;
  onManage: () => void;
  onPolicyClick: () => void;
};

/** Cookie banner. */
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
            {kloelT(`Nós usamos cookies`)}
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
            {kloelT(`Utilizamos cookies para ajudar este site a funcionar, compreender a utilização do
            serviço e promover esforços de marketing. Acesse`)}{' '}
            <button type="button" onClick={onManage} className="kloel-cookie-banner__link">
              {kloelT(`Gerenciar cookies`)}
            </button>{' '}
            {kloelT(`para alterar as preferências a qualquer momento. Leia nossa`)}{' '}
            <button type="button" onClick={onPolicyClick} className="kloel-cookie-banner__link">
              {kloelT(`Política de cookies`)}
            </button>{' '}
            {kloelT(`para saber mais.`)}
          </p>
        </div>

        <div className="kloel-cookie-banner__buttons">
          <button type="button" onClick={onManage} className="kloel-cookie-banner__button">
            {kloelT(`Gerenciar cookies`)}
          </button>
          <button
            type="button"
            onClick={onRejectNonEssential}
            className="kloel-cookie-banner__button"
          >
            {kloelT(`Rejeitar cookies não essenciais`)}
          </button>
          <button type="button" onClick={onAcceptAll} className="kloel-cookie-banner__button">
            {kloelT(`Aceitar tudo`)}
          </button>
        </div>
      </div>
    </div>
  );
}
