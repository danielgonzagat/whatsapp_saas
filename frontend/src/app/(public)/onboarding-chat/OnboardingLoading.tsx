'use client';

import { KloelLoadingState } from '@/components/kloel/KloelBrand';
import { colors } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';

/**
 * Full-viewport loading affordance used while the conversational onboarding
 * page is hydrating or its auth state is still being resolved.
 */
export function OnboardingLoading() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: colors.background.void,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 16px',
      }}
    >
      <KloelLoadingState
        size={96}
        traceColor={colors.text.silver}
        label={kloelT(`Kloel`)}
        hint={kloelT(`iniciando a configuracao`)}
        minHeight={320}
      />
    </div>
  );
}
