'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { Reveal } from './Reveal';
import { DEFAULT_LANDING_CONTENT, type StepData } from './landing-data';

const E = colors.ember.primary;
const V = colors.background.void;
const M = "var(--font-jetbrains), 'JetBrains Mono', monospace";

export function StepsSection({ steps = DEFAULT_LANDING_CONTENT.steps }: { steps?: StepData[] }) {
  return (
    <div style={{ background: colors.background.surface }}>
      <section style={{ padding: 'var(--sp)', maxWidth: 1000, margin: '0 auto' }}>
        <Reveal>
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 48, textAlign: 'center' }}>
            {kloelT('3 passos. 10 minutos. A IA assume.')}
          </h2>
        </Reveal>
        <div
          className="grid3"
          style={{ display: 'grid', gridTemplateColumns: 'var(--c3)', gap: 16 }}
        >
          {steps.map((s, i) => (
            <Reveal key={s.n} delay={i * 120}>
              <div
                style={{
                  background: V,
                  border: `1px solid ${colors.border.space}`,
                  borderRadius: 6,
                  padding: 22,
                  height: '100%',
                  boxSizing: 'border-box',
                  maxWidth: '100%',
                }}
              >
                <div
                  style={{
                    fontFamily: M,
                    fontSize: 26,
                    fontWeight: 800,
                    color: `${E}20`,
                    marginBottom: 8,
                  }}
                >
                  {s.n}
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>{s.h}</h3>
                <p
                  style={{
                    fontSize: 13,
                    color: colors.text.muted,
                    lineHeight: 1.6,
                    marginBottom: 12,
                    wordBreak: 'break-word',
                  }}
                >
                  {s.d}
                </p>
                <div style={{ borderTop: `1px solid ${colors.border.space}`, paddingTop: 10 }}>
                  <p
                    style={{
                      fontSize: 11,
                      color: colors.text.dim,
                      lineHeight: 1.5,
                      fontStyle: 'italic',
                      wordBreak: 'break-word',
                    }}
                  >
                    {s.t}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>
    </div>
  );
}
