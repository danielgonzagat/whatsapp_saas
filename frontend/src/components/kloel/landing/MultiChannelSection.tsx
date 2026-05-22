'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { Reveal } from './Reveal';
import { MultiChannel } from './MultiChannel';
import type { MultiChannelMessage } from './landing-data';
import { DEFAULT_LANDING_CONTENT } from './landing-data';

export function MultiChannelSection({
  messages = DEFAULT_LANDING_CONTENT.multiChannelFlow,
}: {
  messages?: MultiChannelMessage[];
}) {
  return (
    <section style={{ padding: 'var(--sp)', maxWidth: 1000, margin: '0 auto' }}>
      <Reveal>
        <p
          style={{
            textAlign: 'center',
            fontSize: 15,
            color: colors.text.muted,
            maxWidth: 460,
            margin: '0 auto 40px',
          }}
        >
          {kloelT('Assista 3 vendas acontecendo ao mesmo tempo. Sem roteiro. Sem intervenção.')}
        </p>
      </Reveal>
      <Reveal delay={200}>
        <MultiChannel messages={messages} />
      </Reveal>
    </section>
  );
}
