'use client';

import { colors } from '@/lib/design-tokens';
import { Reveal } from './Reveal';
import { DEFAULT_LANDING_CONTENT, type TestimonialData } from './landing-data';

const M = "var(--font-jetbrains), 'JetBrains Mono', monospace";

export function TestimonialsSection({
  testimonials = DEFAULT_LANDING_CONTENT.testimonials,
}: {
  testimonials?: TestimonialData[];
}) {
  return (
    <div>
      <section style={{ padding: 'var(--sp)', maxWidth: 1000, margin: '0 auto' }}>
        <div
          className="grid3"
          style={{ display: 'grid', gridTemplateColumns: 'var(--c3)', gap: 14 }}
        >
          {testimonials.map((p, i) => (
            <Reveal key={p.n} delay={i * 100}>
              <div
                style={{
                  background: colors.background.surface,
                  border: `1px solid ${colors.border.space}`,
                  borderRadius: 6,
                  padding: 20,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '16%',
                      background: p.c,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      fontWeight: 600,
                      color: colors.text.silver,
                    }}
                  >
                    {p.n
                      .split(' ')
                      .map((w) => w[0])
                      .join('')}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{p.n}</div>
                    <div style={{ fontSize: 10, color: colors.text.dim }}>{p.r}</div>
                  </div>
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: colors.text.muted,
                    lineHeight: 1.6,
                    flex: 1,
                    margin: 0,
                    wordBreak: 'break-word',
                  }}
                >
                  {'"'}
                  {p.t}
                  {'"'}
                </p>
                <div
                  style={{
                    marginTop: 12,
                    paddingTop: 8,
                    borderTop: `1px solid ${colors.border.space}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <div style={{ width: 4, height: 4, borderRadius: 4, background: colors.semantic.success }} />
                  <span style={{ fontSize: 10, fontWeight: 600, color: colors.semantic.success, fontFamily: M }}>
                    {p.m}
                  </span>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>
    </div>
  );
}
