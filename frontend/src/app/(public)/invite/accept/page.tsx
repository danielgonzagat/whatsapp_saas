'use client';

import { KloelLoadingState } from '@/components/kloel/KloelBrand';
import { colors } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';
import { Suspense } from 'react';

import { InviteAcceptForm } from './InviteAcceptForm';

const sora = "var(--font-sora), 'Sora', sans-serif";


/** Accept team invite page. */
export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: '100vh',
            background: colors.background.void,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: sora,
            padding: 24,
          }}
        >
          <KloelLoadingState
            size={88}
            traceColor={colors.text.silver}
            label={kloelT(`Kloel`)}
            hint={kloelT(`preparando o convite`)}
            minHeight={280}
          />
        </div>
      }
    >
      <InviteAcceptForm />
    </Suspense>
  );
}
