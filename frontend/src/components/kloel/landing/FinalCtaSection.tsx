'use client';

import { useState, useId } from 'react';
import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { buildAuthUrl } from '@/lib/subdomains';
import { Reveal } from './Reveal';
import { FinalManifestLoop } from './FinalManifestLoop';
import { LivePulse } from './LivePulse';
import { BrandDivider } from './BrandDivider';

const E = colors.ember.primary;
const V = colors.background.void;
const F = "var(--font-sora), 'Sora', sans-serif";

export function FinalCtaSection() {
  const fid = useId();
  const [email, setEmail] = useState('');

  const handleCta = () => {
    if (typeof window === 'undefined') {
      return;
    }
    const params = new URLSearchParams({ forceAuth: '1' });
    if (email) {
      params.set('email', email);
    }
    window.location.assign(buildAuthUrl(`/register?${params.toString()}`, window.location.host));
  };

  return (
    <>
      <div id={fid}>
        <section
          className="landing-final-cta"
          style={{
            padding: '0 24px',
            textAlign: 'center',
            position: 'relative',
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ position: 'relative', zIndex: 1, maxWidth: 700 }}>
            <Reveal>
              <FinalManifestLoop />
            </Reveal>

            <Reveal delay={400}>
              <p
                style={{
                  fontSize: 15,
                  color: colors.text.muted,
                  lineHeight: 1.7,
                  maxWidth: 440,
                  margin: '48px auto 0',
                }}
              >
                {kloelT('Você pensa a estratégia.')}
                <br />
                {kloelT('A inteligência artificial executa tudo.')}
              </p>
            </Reveal>

            <Reveal delay={600}>
              <div
                className="landing-final-cta-row"
                style={{
                  marginTop: 48,
                  display: 'flex',
                  gap: 10,
                  justifyContent: 'center',
                  maxWidth: 440,
                  margin: '48px auto 0',
                  flexWrap: 'wrap',
                }}
              >
                <input
                  className="landing-final-cta-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={kloelT('Seu melhor e-mail')}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    width: '100%',
                    background: colors.background.surface,
                    border: `1px solid ${colors.border.space}`,
                    borderRadius: 6,
                    padding: '16px 20px',
                    color: colors.text.silver,
                    fontSize: 15,
                    fontFamily: F,
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  className="landing-final-cta-button"
                  onClick={handleCta}
                  style={{
                    background: E,
                    color: V,
                    border: 'none',
                    borderRadius: 6,
                    padding: '16px 32px',
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    fontFamily: F,
                  }}
                >
                  {kloelT('Ativar minha IA')}
                </button>
              </div>
              <p style={{ fontSize: 11, color: colors.text.dim, marginTop: 14 }}>
                {kloelT('R$0/mês. Taxa só quando vender.')}
              </p>
            </Reveal>

            <Reveal delay={800}>
              <div style={{ marginTop: 56 }}>
                <LivePulse />
              </div>
            </Reveal>
          </div>
        </section>
      </div>

      <div style={{ padding: '20px 0', opacity: 0.35 }}>
        <BrandDivider compact />
      </div>
    </>
  );
}
