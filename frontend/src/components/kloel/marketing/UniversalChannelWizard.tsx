'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  addChannelArsenal,
  completeChannelSetup,
  getChannelSetup,
  reconfigureChannelSetup,
  removeChannelArsenal,
  saveChannelConfig,
  saveChannelProducts,
  type ChannelSetupConfig,
  type ChannelSetupState,
} from '@/lib/api/channel-setup';
import { kloelT } from '@/lib/i18n/t';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { UI } from '@/lib/ui-tokens';
import { Steps } from './WhatsAppExperience.connection-panes';
import { ConnectionStep, ProductsStep } from './UniversalChannelWizard.connection';
import { ArsenalStep, ConfigStep } from './UniversalChannelWizard.review';
import { C, E, F, G, M, S, V } from './UniversalChannelWizard.styles';
import { SecondaryButton, StepDot } from './UniversalChannelWizard.ui';
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
  const [setup, setSetup] = useState<ChannelSetupState | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [assetDraft, setAssetDraft] = useState({ label: '', storageRef: '', type: 'text' });
  const [channelConfig, setChannelConfig] = useState<ChannelSetupConfig>(defaultChannelConfig);
  const profile = channelWizardProfile(channel);
  const method = resolveConnectionMethod(channel);
  const iconEl = channelIcon(channel, 32);
  const handleNext = useCallback(() => setStep((prev) => Math.min(3, prev + 1) as WizardStep), []);
  const handlePrev = useCallback(() => setStep((prev) => Math.max(0, prev - 1) as WizardStep), []);
  const canConnect = (method === 'email-toggle' || configReady) && !connecting && !connected;

  useEffect(() => {
    let active = true;
    getChannelSetup(channel)
      .then((state) => {
        if (!active) return;
        setSetup(state);
        setSelectedProductIds(state.selectedProductIds);
        setChannelConfig(state.config ?? defaultChannelConfig);
        setEditing(!state.completed);
      })
      .catch(() => {
        if (active) setEditing(true);
      });
    return () => {
      active = false;
    };
  }, [channel]);

  const persistProducts = useCallback(async () => {
    setSaving(true);
    try {
      const state = await saveChannelProducts(channel, selectedProductIds);
      setSetup(state);
      handleNext();
    } finally {
      setSaving(false);
    }
  }, [channel, handleNext, selectedProductIds]);

  const addAsset = useCallback(async () => {
    setSaving(true);
    try {
      const state = await addChannelArsenal(channel, assetDraft);
      setSetup(state);
      setAssetDraft({ label: '', storageRef: '', type: 'text' });
    } finally {
      setSaving(false);
    }
  }, [assetDraft, channel]);

  const removeAsset = useCallback(
    async (assetId: string) => {
      const state = await removeChannelArsenal(channel, assetId);
      setSetup(state);
    },
    [channel],
  );

  const completeSetup = useCallback(async () => {
    setSaving(true);
    try {
      const configured = await saveChannelConfig(channel, channelConfig);
      const completed = await completeChannelSetup(channel);
      setSetup({ ...configured, ...completed });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }, [channel, channelConfig]);

  const reconfigure = useCallback(async () => {
    const state = await reconfigureChannelSetup(channel);
    setSetup(state);
    setEditing(true);
    setStep(0);
  }, [channel]);

  const toggleProduct = useCallback((productId: string) => {
    setSelectedProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
  }, []);

  const selectAllProducts = useCallback(() => {
    setSelectedProductIds(setup?.products.map((product) => product.id) ?? []);
  }, [setup?.products]);

  if (setup?.completed && !editing) {
    return (
      <ChannelOperationalPanel
        channel={channel}
        connected={connected}
        onReconfigure={reconfigure}
        setup={setup}
      />
    );
  }

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
      <style>{WIZARD_GLOBAL_CSS}</style>
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
          <ProductsStep
            profile={profile}
            products={setup?.products ?? []}
            saving={saving}
            selectedProductIds={selectedProductIds}
            onToggleProduct={toggleProduct}
            onSelectAll={selectAllProducts}
            onSave={persistProducts}
            onPrev={handlePrev}
          />
        ) : null}
        {step === 2 ? (
          <ArsenalStep
            arsenal={setup?.arsenal ?? []}
            assetDraft={assetDraft}
            saving={saving}
            onAssetDraftChange={setAssetDraft}
            onAddAsset={addAsset}
            onRemoveAsset={removeAsset}
            onPrev={handlePrev}
            onNext={handleNext}
          />
        ) : null}
        {step === 3 ? (
          <ConfigStep
            channel={channel}
            config={channelConfig}
            profile={profile}
            method={method}
            connected={connected}
            connecting={connecting}
            canConnect={canConnect}
            saving={saving}
            onConfigChange={setChannelConfig}
            onComplete={completeSetup}
            onPrev={handlePrev}
            onConnect={onConnect}
          />
        ) : null}
      </div>
    </div>
  );
}

const WIZARD_GLOBAL_CSS = [
  '::selection { background: rgba(232, 93, 48, 0.3); }',
  '@keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }',
  '.fade-in { animation: fadeUp .5s ease both; }',
  '@media (max-width: 760px) { .wiz-profile-grid { grid-template-columns: 1fr; } }',
].join('\n');

const defaultChannelConfig: ChannelSetupConfig = {
  aggressiveness: 'normal',
  businessHours: {},
  dailyMessageLimit: 20,
  followupEnabled: true,
  language: 'pt-BR',
  tone: 'consultivo',
  transferCriteria: {},
};

function ChannelOperationalPanel({
  channel,
  connected,
  setup,
  onReconfigure,
}: {
  channel: UniversalChannel;
  connected: boolean;
  setup: ChannelSetupState;
  onReconfigure: () => void;
}) {
  const profile = channelWizardProfile(channel);
  return (
    <div
      style={{
        background: V,
        borderRadius: UI.radiusMd,
        color: KLOEL_THEME.textPrimary,
        fontFamily: F,
        minHeight: '100%',
        padding: '32px 24px',
      }}
    >
      <div style={{ margin: '0 auto', maxWidth: 680 }}>
        <div style={{ alignItems: 'center', display: 'flex', gap: 12, marginBottom: 24 }}>
          <div style={{ color: E }}>{channelIcon(channel, 32)}</div>
          <div>
            <h2 style={{ color: KLOEL_THEME.textPrimary, fontFamily: F, fontSize: 16, margin: 0 }}>
              {profile.label}
            </h2>
            <div style={{ color: connected ? G : S, fontFamily: M, fontSize: 11, marginTop: 4 }}>
              {connected ? kloelT('Conectado') : kloelT('Operacional aguardando conexao')}
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <Metric label="Produtos" value={String(setup.selectedProductIds.length)} />
          <Metric label="Arsenal" value={String(setup.arsenal.length)} />
          <Metric label="Limite diario" value={String(setup.config?.dailyMessageLimit ?? 20)} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
          <SecondaryButton onClick={onReconfigure}>{kloelT('Reconfigurar canal')}</SecondaryButton>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{ background: C, border: `1px solid ${S}`, borderRadius: UI.radiusSm, padding: 14 }}
    >
      <div style={{ color: S, fontFamily: M, fontSize: 10 }}>{kloelT(label)}</div>
      <div style={{ color: KLOEL_THEME.textPrimary, fontFamily: F, fontSize: 20 }}>{value}</div>
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
