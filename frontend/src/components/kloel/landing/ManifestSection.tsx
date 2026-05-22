'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { Reveal } from './Reveal';

const E = colors.ember.primary;

export function ManifestSection() {
  return (
    <section style={{ padding: 'var(--sp)', textAlign: 'center' }}>
      <Reveal>
        <p
          style={{
            fontSize: 17,
            color: colors.text.muted,
            lineHeight: 1.8,
            maxWidth: 420,
            margin: '0 auto 52px',
          }}
        >
          {kloelT('Isso não é automação.')}
          <br />
          {kloelT('Não é chatbot. Não é script.')}
          <br />
          {kloelT('Não é nenhuma ferramenta que você já usou.')}
        </p>
      </Reveal>
      <Reveal delay={500}>
        <h2
          style={{
            fontSize: 'clamp(32px,5.5vw,60px)',
            fontWeight: 800,
            color: E,
            letterSpacing: '-.04em',
            margin: 0,
          }}
        >
          {kloelT('Isso é Marketing Artificial.')}
        </h2>
      </Reveal>
    </section>
  );
}
