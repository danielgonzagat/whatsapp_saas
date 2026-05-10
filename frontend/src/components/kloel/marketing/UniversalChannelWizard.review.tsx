import { kloelT } from '@/lib/i18n/t';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { UI } from '@/lib/ui-tokens';
import type { ChannelSetupArsenal, ChannelSetupConfig } from '@/lib/api/channel-setup';
import type React from 'react';
import {
  type UniversalChannel,
  channelIcon,
  channelWizardProfile,
} from './UniversalChannelWizard.helpers';
import { B, C, E, F, M, S } from './UniversalChannelWizard.styles';
import { PrimaryButton, SecondaryButton } from './UniversalChannelWizard.ui';

type Profile = ReturnType<typeof channelWizardProfile>;

export function ArsenalStep({
  arsenal,
  assetDraft,
  saving,
  onAssetDraftChange,
  onAddAsset,
  onRemoveAsset,
  onPrev,
  onNext,
}: {
  arsenal: ChannelSetupArsenal[];
  assetDraft: { type: string; label: string; storageRef: string };
  saving: boolean;
  onAssetDraftChange: (draft: { type: string; label: string; storageRef: string }) => void;
  onAddAsset: () => void;
  onRemoveAsset: (assetId: string) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="fade-in" key="step-2">
      <p style={{ fontSize: 13, color: S, lineHeight: 1.7, marginBottom: 20 }}>
        {kloelT('Carregue materiais aprovados para este canal usar nas respostas automaticas.')}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        <input
          aria-label={kloelT('Nome do material')}
          onChange={(event) => onAssetDraftChange({ ...assetDraft, label: event.target.value })}
          placeholder={kloelT('Nome do material')}
          style={inputStyle}
          value={assetDraft.label}
        />
        <select
          aria-label={kloelT('Tipo')}
          onChange={(event) => onAssetDraftChange({ ...assetDraft, type: event.target.value })}
          style={inputStyle}
          value={assetDraft.type}
        >
          {['text', 'audio', 'image', 'video', 'document', 'template'].map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <textarea
          aria-label={kloelT('Referencia do arquivo ou template')}
          onChange={(event) =>
            onAssetDraftChange({ ...assetDraft, storageRef: event.target.value })
          }
          placeholder={kloelT('URL, template aprovado ou referencia do storage')}
          style={{ ...inputStyle, minHeight: 86, resize: 'vertical' }}
          value={assetDraft.storageRef}
        />
        <SecondaryButton onClick={onAddAsset} disabled={saving || !assetDraft.storageRef.trim()}>
          {saving ? kloelT('Salvando...') : kloelT('Adicionar material')}
        </SecondaryButton>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        {arsenal.map((asset) => (
          <div key={asset.assetId} style={rowStyle}>
            <span style={{ color: KLOEL_THEME.textPrimary, fontFamily: F, fontSize: 12 }}>
              {asset.label || asset.storageRef}
            </span>
            <SecondaryButton onClick={() => onRemoveAsset(asset.assetId)}>
              {kloelT('Remover')}
            </SecondaryButton>
          </div>
        ))}
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

export function ConfigStep({
  channel,
  config,
  profile,
  method,
  connected,
  connecting,
  canConnect,
  saving,
  onConfigChange,
  onComplete,
  onPrev,
  onConnect,
}: {
  channel: UniversalChannel;
  config: ChannelSetupConfig;
  profile: Profile;
  method: string;
  connected: boolean;
  connecting: boolean;
  canConnect: boolean;
  saving: boolean;
  onConfigChange: (config: ChannelSetupConfig) => void;
  onComplete: () => void;
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
          {kloelT(`Configuracao final do canal ${profile.label}`)}
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
        <input
          aria-label={kloelT('Tom')}
          onChange={(event) => onConfigChange({ ...config, tone: event.target.value })}
          placeholder={kloelT('Tom default')}
          style={inputStyle}
          value={config.tone}
        />
        <input
          aria-label={kloelT('Agressividade')}
          onChange={(event) => onConfigChange({ ...config, aggressiveness: event.target.value })}
          placeholder={kloelT('Agressividade default')}
          style={inputStyle}
          value={config.aggressiveness}
        />
        <input
          aria-label={kloelT('Limite diario')}
          min={1}
          onChange={(event) =>
            onConfigChange({ ...config, dailyMessageLimit: Number(event.target.value) })
          }
          style={inputStyle}
          type="number"
          value={config.dailyMessageLimit}
        />
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
          <PrimaryButton onClick={onComplete} disabled={saving}>
            {saving ? kloelT('Salvando...') : kloelT('Concluir')}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: C,
  border: `1px solid ${B}`,
  borderRadius: UI.radiusSm,
  color: KLOEL_THEME.textPrimary,
  fontFamily: F,
  fontSize: 13,
  padding: '11px 12px',
};

const rowStyle: React.CSSProperties = {
  alignItems: 'center',
  background: C,
  border: `1px solid ${B}`,
  borderRadius: UI.radiusSm,
  display: 'flex',
  gap: 12,
  justifyContent: 'space-between',
  padding: '10px 12px',
};
