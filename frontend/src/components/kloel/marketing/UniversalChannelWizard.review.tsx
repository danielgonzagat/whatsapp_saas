import { kloelT } from '@/lib/i18n/t';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { UI } from '@/lib/ui-tokens';
import {
  type UniversalChannel,
  channelIcon,
  channelWizardProfile,
} from './UniversalChannelWizard.helpers';
import { B, C, E, F, M, S } from './UniversalChannelWizard.styles';
import { PrimaryButton, SecondaryButton } from './UniversalChannelWizard.ui';

type Profile = ReturnType<typeof channelWizardProfile>;

export function FormatsStep({
  profile,
  onPrev,
  onNext,
}: {
  profile: Profile;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="fade-in" key="step-2">
      <p style={{ fontSize: 13, color: S, lineHeight: 1.7, marginBottom: 20 }}>
        {kloelT(`Conheca os formatos de mensagem e limites da plataforma ${profile.label}.`)}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
        {profile.formatNotes.map((note) => (
          <div
            key={note.title}
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
                fontSize: 10,
                color: E,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                marginBottom: 8,
              }}
            >
              {kloelT(note.title)}
            </div>
            <div
              style={{
                fontFamily: F,
                fontSize: 12,
                color: KLOEL_THEME.textPrimary,
                lineHeight: 1.6,
              }}
            >
              {kloelT(note.body)}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          background: `color-mix(in srgb, ${KLOEL_THEME.error} 6%, transparent)`,
          borderRadius: UI.radiusSm,
          border: `1px solid color-mix(in srgb, ${KLOEL_THEME.error} 18%, transparent)`,
          padding: '16px 18px',
          marginBottom: 24,
        }}
      >
        <div
          style={{
            fontFamily: M,
            fontSize: 9,
            color: KLOEL_THEME.error,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            marginBottom: 12,
          }}
        >
          {kloelT('Restricoes importantes')}
        </div>
        <ul
          style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          {profile.restrictions.map((restriction) => (
            <li
              key={restriction}
              style={{
                fontFamily: F,
                fontSize: 12,
                color: KLOEL_THEME.textPrimary,
                lineHeight: 1.6,
              }}
            >
              {kloelT(restriction)}
            </li>
          ))}
        </ul>
      </div>
      <div
        style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}
      >
        <span style={{ fontSize: 11, color: S, fontFamily: M }}>{kloelT('Passo 3 de 4')}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <SecondaryButton onClick={onPrev}>{kloelT('Voltar')}</SecondaryButton>
          <SecondaryButton onClick={onNext}>{kloelT('Proximo')}</SecondaryButton>
        </div>
      </div>
    </div>
  );
}

export function ReviewStep({
  channel,
  profile,
  method,
  connected,
  connecting,
  canConnect,
  onPrev,
  onConnect,
}: {
  channel: UniversalChannel;
  profile: Profile;
  method: string;
  connected: boolean;
  connecting: boolean;
  canConnect: boolean;
  onPrev: () => void;
  onConnect: () => void;
}) {
  const rows = [
    { label: 'Canal', value: profile.label },
    {
      label: 'Status',
      value: connected ? 'Conectado' : connecting ? 'Conectando...' : 'Aguardando ativacao',
    },
    {
      label: 'Metodo',
      value:
        method === 'meta-oauth'
          ? 'Meta OAuth'
          : method === 'tiktok-oauth'
            ? 'TikTok OAuth'
            : 'Ativacao direta',
    },
  ];
  return (
    <div className="fade-in" key="step-3">
      <div
        style={{
          background: C,
          borderRadius: UI.radiusMd,
          border: `1px solid ${B}`,
          padding: 24,
          marginBottom: 24,
          textAlign: 'center',
        }}
      >
        <div style={{ color: E, marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
          {channelIcon(channel, 40)}
        </div>
        <h3
          style={{
            fontFamily: F,
            fontSize: 15,
            fontWeight: 700,
            marginBottom: 12,
            color: KLOEL_THEME.textPrimary,
          }}
        >
          {kloelT(`Tudo pronto para ativar ${profile.label}`)}
        </h3>
        <p
          style={{
            fontFamily: F,
            fontSize: 13,
            color: S,
            lineHeight: 1.7,
            maxWidth: 480,
            margin: '0 auto',
          }}
        >
          {kloelT(profile.activationSummary)}
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        {rows.map((row) => (
          <div
            key={row.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 16px',
              background: C,
              borderRadius: UI.radiusSm,
              border: `1px solid ${B}`,
            }}
          >
            <span
              style={{
                fontFamily: M,
                fontSize: 11,
                color: S,
                textTransform: 'uppercase',
                letterSpacing: '0.15em',
              }}
            >
              {kloelT(row.label)}
            </span>
            <span
              style={{
                fontFamily: F,
                fontSize: 13,
                color: KLOEL_THEME.textPrimary,
                fontWeight: 600,
              }}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
      <div
        style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}
      >
        <span style={{ fontSize: 11, color: S, fontFamily: M }}>{kloelT('Passo 4 de 4')}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <SecondaryButton onClick={onPrev}>{kloelT('Voltar')}</SecondaryButton>
          <PrimaryButton onClick={onConnect} disabled={!canConnect}>
            {connecting
              ? profile.connectingLabel
              : connected
                ? kloelT('Conectado')
                : profile.connectionLabel}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
