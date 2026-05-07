'use client';

import { useMindNarrate } from '@/hooks/useMind';
import { kloelT } from '@/lib/i18n/t';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { radius } from '@/lib/design-tokens';
import { KloelMushroomVisual } from '@/components/kloel/KloelBrand';
import { BrainCircuit } from 'lucide-react';

const FONT_SANS = "'Sora', sans-serif";

export function MindBriefingCard() {
  const { narrate, isLoading, error } = useMindNarrate();

  return (
    <section style={{ maxWidth: 1240, margin: '0 auto 24px', padding: '0 24px' }}>
      <div
        style={{
          borderRadius: 6,
          border: `1px solid ${KLOEL_THEME.borderPrimary}`,
          background: KLOEL_THEME.bgCard,
          boxShadow: KLOEL_THEME.shadowSm,
          padding: 18,
          color: KLOEL_THEME.textPrimary,
          fontFamily: FONT_SANS,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <BrainCircuit size={18} strokeWidth={1.8} color={KLOEL_THEME.accent} />
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '.12em',
              textTransform: 'uppercase',
              color: KLOEL_THEME.textTertiary,
            }}
          >
            {kloelT('MIND Briefing')}
          </div>
          {!isLoading && !error && narrate?.briefing ? (
            <span
              style={{
                marginLeft: 'auto',
                borderRadius: radius.full,
                border: `1px solid ${KLOEL_THEME.borderPrimary}`,
                padding: '4px 8px',
                color: KLOEL_THEME.success,
                fontSize: 10,
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              {kloelT('Ativo')}
            </span>
          ) : null}
        </div>

        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 32 }}>
            <KloelMushroomVisual
              size={16}
              animated
              spores="animated"
              traceColor={KLOEL_THEME.accent}
              ariaHidden
            />
            <span style={{ fontSize: 13, color: KLOEL_THEME.textSecondary }}>
              {kloelT('Analisando dados do workspace...')}
            </span>
          </div>
        ) : error ? (
          <div
            style={{
              borderRadius: 4,
              border: `1px solid ${KLOEL_THEME.warning}`,
              background: KLOEL_THEME.warningBg,
              padding: '10px 14px',
              fontSize: 13,
              color: KLOEL_THEME.warning,
            }}
          >
            {kloelT('MIND indisponivel no momento. O motor de crencas continua operando.')}
          </div>
        ) : narrate?.briefing ? (
          <div
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              color: KLOEL_THEME.textPrimary,
              whiteSpace: 'pre-wrap',
            }}
          >
            {narrate.briefing}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: KLOEL_THEME.textSecondary }}>
            {kloelT('Nenhum briefing disponivel. Execute um tick para calibrar a mente.')}
          </div>
        )}
      </div>
    </section>
  );
}
