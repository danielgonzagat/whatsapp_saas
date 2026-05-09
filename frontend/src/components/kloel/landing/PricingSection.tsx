'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { Reveal } from './Reveal';
import { DEFAULT_LANDING_CONTENT, type PricingTool } from './landing-data';

const E = colors.ember.primary;
const V = colors.background.void;
const M = "var(--font-jetbrains), 'JetBrains Mono', monospace";

export function PricingSection({
  tools = DEFAULT_LANDING_CONTENT.pricingTools,
}: {
  tools?: PricingTool[];
}) {
  return (
    <div>
      <section style={{ padding: 'var(--sp)', maxWidth: 860, margin: '0 auto' }}>
        <Reveal>
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 48, textAlign: 'center' }}>
            {kloelT('Quanto você gasta hoje?')}
          </h2>
        </Reveal>
        <div
          className="grid2"
          style={{
            display: 'grid',
            gridTemplateColumns: 'var(--c2)',
            gap: 24,
            alignItems: 'start',
          }}
        >
          <Reveal>
            <div style={{ background: colors.background.surface, borderRadius: 6, padding: 20 }}>
              <div
                style={{
                  fontFamily: M,
                  fontSize: 9,
                  color: colors.text.muted,
                  letterSpacing: '.1em',
                  marginBottom: 12,
                }}
              >
                {kloelT('FERRAMENTAS SEPARADAS')}
              </div>
              {tools.map(({ tool, price }) => (
                <div
                  key={tool}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '5px 0',
                    borderBottom: `1px solid ${colors.border.void}`,
                  }}
                >
                  <span style={{ fontSize: 11, color: colors.text.silver }}>{tool}</span>
                  <span style={{ fontSize: 10, color: colors.text.muted, fontFamily: M }}>
                    {price}
                  </span>
                </div>
              ))}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '10px 0 0',
                  marginTop: 6,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: colors.text.silver }}>
                  {kloelT('Total')}
                </span>
                <span style={{ fontSize: 16, fontWeight: 800, color: colors.semantic.error, fontFamily: M }}>
                  {kloelT('R$1.519+/mês')}
                </span>
              </div>
            </div>
          </Reveal>
          <Reveal delay={200}>
            <div
              style={{
                background: colors.background.surface,
                border: `2px solid ${E}`,
                borderRadius: 6,
                padding: 22,
                position: 'relative',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: -1,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: E,
                  padding: '2px 12px',
                  borderRadius: '0 0 4px 4px',
                  fontSize: 9,
                  fontWeight: 700,
                  color: V,
                  fontFamily: M,
                  letterSpacing: '.08em',
                }}
              >
                KLOEL
              </div>
              <div style={{ textAlign: 'center', padding: '24px 0 16px' }}>
                <div
                  style={{
                    fontSize: 48,
                    fontWeight: 800,
                    fontFamily: M,
                    letterSpacing: '-.04em',
                  }}
                >
                  {kloelT('R$ 0')}
                </div>
                <div style={{ fontSize: 14, color: colors.text.muted, marginTop: 4 }}>
                  {kloelT('por mês')}
                </div>
                <div style={{ fontSize: 12, color: E, fontWeight: 600, marginTop: 10 }}>
                  {kloelT('Taxa apenas sobre vendas.')}
                </div>
                <div style={{ fontSize: 11, color: colors.text.dim, marginTop: 2 }}>
                  {kloelT('Sem venda, sem custo.')}
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
