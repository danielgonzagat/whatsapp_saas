'use client';

import { useCallback, useState } from 'react';
import { kloelT } from '@/lib/i18n/t';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { UI } from '@/lib/ui-tokens';
import { Steps } from './WhatsAppExperience.connection-panes';
import { ConnectionStep, ProductsStep } from './UniversalChannelWizard.connection';
import { ArsenalStep, ConfigStep } from './UniversalChannelWizard.review';
import { E, F, G, M, S, V } from './UniversalChannelWizard.styles';
import { StepDot } from './UniversalChannelWizard.ui';
import {
  type UniversalChannel,
  type WizardStep,
  WIZARD_STEPS,
  channelIcon,
  channelWizardProfile,
  resolveConnectionMethod,
} from './UniversalChannelWizard.helpers';

export interface UniversalChannelWizardProps {
  channel: UniversalChannel;
  connecting: boolean;
  connected: boolean;
  error: string | null;
  configReady?: boolean;
  onConnect: () => void;
}

export default function UniversalChannelWizard({
  channel,
  connecting,
  connected,
  error,
  configReady = true,
  onConnect,
}: UniversalChannelWizardProps) {
  const [step, setStep] = useState<WizardStep>(0);
  const profile = channelWizardProfile(channel);
  const method = resolveConnectionMethod(channel);
  const iconEl = channelIcon(channel, 32);
  const handleNext = useCallback(() => setStep((prev) => Math.min(3, prev + 1) as WizardStep), []);
  const handlePrev = useCallback(() => setStep((prev) => Math.max(0, prev - 1) as WizardStep), []);
  const canConnect = (method === 'email-toggle' || configReady) && !connecting && !connected;

  return (
    <div
      style={{
        background: V,
        minHeight: '100%',
        color: KLOEL_THEME.textPrimary,
        fontFamily: F,
        borderRadius: UI.radiusMd,
      }}
    >
      <style>{`
        ::selection { background: color-mix(in srgb, ${E} 30%, transparent); }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .fade-in { animation: fadeUp .5s ease both; }
        @media (max-width: 760px) { .wiz-profile-grid { grid-template-columns: 1fr; } }
      `}</style>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 24px' }}>
        <Steps current={step} steps={WIZARD_STEPS} />
        <div
          className="fade-in"
          style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', color: E }}>{iconEl}</div>
          <div>
            <h2
              style={{
                fontSize: 16,
                fontWeight: 700,
                margin: 0,
                fontFamily: F,
                color: KLOEL_THEME.textPrimary,
              }}
            >
              {profile.label}
            </h2>
            <div
              style={{
                fontSize: 11,
                color: connected ? G : S,
                fontFamily: M,
                marginTop: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <StepDot active={!connected} done={connected} />
              {connected ? kloelT('Conectado') : kloelT('Configuracao pendente')}
            </div>
          </div>
        </div>
        {error ? <ErrorBanner error={error} /> : null}
        {!configReady ? <ConfigWarning /> : null}
        {step === 0 ? (
          <ConnectionStep
            profile={profile}
            canConnect={canConnect}
            connecting={connecting}
            onConnect={onConnect}
            onNext={handleNext}
          />
        ) : null}
        {step === 1 ? (
          <ProductsStep profile={profile} onPrev={handlePrev} onNext={handleNext} />
        ) : null}
        {step === 2 ? (
          <ArsenalStep profile={profile} onPrev={handlePrev} onNext={handleNext} />
        ) : null}
        {step === 3 ? (
          <ConfigStep
            channel={channel}
            profile={profile}
            method={method}
            connected={connected}
            connecting={connecting}
            canConnect={canConnect}
            onPrev={handlePrev}
            onConnect={onConnect}
          />
        ) : null}
      </div>
    </div>
  );
}

function ErrorBanner({ error }: { error: string }) {
  return (
    <div
      className="fade-in"
      style={{
        marginBottom: 20,
        border: `1px solid color-mix(in srgb, ${KLOEL_THEME.error} 24%, transparent)`,
        background: KLOEL_THEME.errorBg,
        color: KLOEL_THEME.error,
        padding: '12px 14px',
        borderRadius: UI.radiusMd,
        fontSize: 12,
        fontFamily: F,
      }}
    >
      {kloelT(error)}
    </div>
  );
}

function ConfigWarning() {
  return (
    <div
      className="fade-in"
      style={{
        marginBottom: 20,
        border: '1px solid rgba(251,191,36,0.25)',
        background: 'rgba(251,191,36,0.08)',
        color: 'var(--app-text-primary)',
        padding: '14px 16px',
        borderRadius: UI.radiusMd,
        fontSize: 12,
        fontFamily: F,
        lineHeight: 1.7,
      }}
    >
      {kloelT(
        'A conexao com este canal ainda nao esta disponivel para este workspace. As chaves do aplicativo precisam ser configuradas antes da ativacao.',
      )}
    </div>
  );
}
