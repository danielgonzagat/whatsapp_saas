import { kloelT } from '@/lib/i18n/t';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { UI } from '@/lib/ui-tokens';
import type { channelWizardProfile } from './UniversalChannelWizard.helpers';
import { B, C, E, F, M, S } from './UniversalChannelWizard.styles';
import { PrimaryButton, SecondaryButton } from './UniversalChannelWizard.ui';

type Profile = ReturnType<typeof channelWizardProfile>;

export function ConnectionStep({
  profile,
  canConnect,
  connecting,
  onConnect,
  onNext,
}: {
  profile: Profile;
  canConnect: boolean;
  connecting: boolean;
  onConnect: () => void;
  onNext: () => void;
}) {
  return (
    <div className="fade-in" key="step-0">
      <p style={{ fontSize: 13, color: S, lineHeight: 1.7, marginBottom: 24 }}>
        {kloelT(profile.description)}
      </p>
      <div
        style={{
          background: C,
          borderRadius: UI.radiusMd,
          border: `1px solid ${B}`,
          padding: 20,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            fontFamily: M,
            fontSize: 9,
            color: E,
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            marginBottom: 12,
          }}
        >
          {kloelT('Como funciona')}
        </div>
        <p style={{ fontSize: 13, color: KLOEL_THEME.textPrimary, lineHeight: 1.7, margin: 0 }}>
          {kloelT(profile.connectDescription)}
        </p>
      </div>
      <div
        style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}
      >
        <span style={{ fontSize: 11, color: S, fontFamily: M }}>{kloelT('Passo 1 de 4')}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <PrimaryButton onClick={onConnect} disabled={!canConnect}>
            {connecting ? profile.connectingLabel : profile.connectionLabel}
          </PrimaryButton>
          <SecondaryButton onClick={onNext}>{kloelT('Proximo')}</SecondaryButton>
        </div>
      </div>
    </div>
  );
}

export function ProductsStep({
  profile,
  onPrev,
  onNext,
}: {
  profile: Profile;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="fade-in" key="step-1">
      <p style={{ fontSize: 13, color: S, lineHeight: 1.7, marginBottom: 20 }}>
        {kloelT(`Veja os produtos e servicos que voce libera ao ativar o canal ${profile.label}.`)}
      </p>
      <div
        className="wiz-profile-grid"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 24 }}
      >
        {profile.profileCards.map((card) => (
          <div
            key={card.label}
            style={{
              background: C,
              borderRadius: UI.radiusSm,
              border: `1px solid ${B}`,
              padding: '14px 16px',
            }}
          >
            <div
              style={{
                fontFamily: M,
                fontSize: 9,
                color: E,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                marginBottom: 8,
              }}
            >
              {kloelT(card.label)}
            </div>
            <div
              style={{
                fontFamily: F,
                fontSize: 12,
                color: KLOEL_THEME.textPrimary,
                lineHeight: 1.6,
              }}
            >
              {kloelT(card.value)}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}
      >
        <span style={{ fontSize: 11, color: S, fontFamily: M }}>{kloelT('Passo 2 de 4')}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <SecondaryButton onClick={onPrev}>{kloelT('Voltar')}</SecondaryButton>
          <SecondaryButton onClick={onNext}>{kloelT('Proximo')}</SecondaryButton>
        </div>
      </div>
    </div>
  );
}
