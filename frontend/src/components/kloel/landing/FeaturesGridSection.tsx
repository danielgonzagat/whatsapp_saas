'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { Reveal } from './Reveal';
import { DEFAULT_LANDING_CONTENT, type FeatureGroup } from './landing-data';

const E = colors.ember.primary;
const M = "var(--font-jetbrains), 'JetBrains Mono', monospace";

export function FeaturesGridSection({
  groups = DEFAULT_LANDING_CONTENT.featureGroups,
}: {
  groups?: FeatureGroup[];
}) {
  return (
    <div>
      <section style={{ padding: 'var(--sp)', maxWidth: 1100, margin: '0 auto' }}>
        <Reveal>
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 10, textAlign: 'center' }}>
            {kloelT('Tudo num lugar só.')}
          </h2>
          <p
            style={{
              fontSize: 13,
              color: colors.text.muted,
              textAlign: 'center',
              maxWidth: 400,
              margin: '0 auto 48px',
            }}
          >
            {kloelT('Sem 15 assinaturas. Sem integrações quebradas.')}
          </p>
        </Reveal>
        <div
          className="grid4"
          style={{ display: 'grid', gridTemplateColumns: 'var(--c4)', gap: 12 }}
        >
          {groups.map((g, gi) => (
            <Reveal key={g.c} delay={gi * 80}>
              <div
                style={{
                  background: colors.background.surface,
                  border: `1px solid ${colors.border.space}`,
                  borderRadius: 6,
                  padding: 18,
                  height: '100%',
                }}
              >
                <div
                  style={{
                    fontFamily: M,
                    fontSize: 9,
                    color: E,
                    letterSpacing: '.1em',
                    marginBottom: 12,
                  }}
                >
                  {g.c}
                </div>
                {g.items.map((it) => (
                  <div
                    key={it}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '5px 0',
                      borderBottom: `1px solid ${colors.border.void}`,
                    }}
                  >
                    <svg
                      width={12}
                      height={12}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#10B981"
                      strokeWidth={2}
                      style={{ flexShrink: 0 }}
                      aria-hidden="true"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span style={{ fontSize: 12, wordBreak: 'break-word' }}>{it}</span>
                  </div>
                ))}
              </div>
            </Reveal>
          ))}
        </div>
      </section>
    </div>
  );
}
