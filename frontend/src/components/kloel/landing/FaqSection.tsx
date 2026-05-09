'use client';

import { useState } from 'react';
import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { Reveal } from './Reveal';
import { DEFAULT_LANDING_CONTENT, type FaqItem } from './landing-data';

export function FaqSection({
  items = DEFAULT_LANDING_CONTENT.faqItems,
}: {
  items?: FaqItem[];
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div>
      <section style={{ padding: 'var(--sp)', maxWidth: 640, margin: '0 auto' }}>
        <Reveal>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 36, textAlign: 'center' }}>
            {kloelT('Perguntas frequentes')}
          </h2>
        </Reveal>
        {items.map((f, i) => (
          <Reveal key={f.q} delay={30 * i}>
            <div style={{ borderBottom: `1px solid ${colors.border.void}` }}>
              <button
                type="button"
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                style={{
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '15px 0',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 500, color: colors.text.silver }}>
                  {f.q}
                </span>
                <span
                  style={{
                    color: colors.text.dim,
                    fontSize: 16,
                    transform: openIndex === i ? 'rotate(45deg)' : 'none',
                    transition: 'transform .15s',
                    flexShrink: 0,
                    marginLeft: 12,
                  }}
                >
                  +
                </span>
              </button>
              {openIndex === i && (
                <div style={{ padding: '0 0 14px', animation: 'fadeIn .3s ease both' }}>
                  <p style={{ fontSize: 13, color: colors.text.muted, lineHeight: 1.7 }}>
                    {f.a}
                  </p>
                </div>
              )}
            </div>
          </Reveal>
        ))}
      </section>
    </div>
  );
}
