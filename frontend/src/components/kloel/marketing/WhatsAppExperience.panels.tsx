'use client';

import { kloelT } from '@/lib/i18n/t';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import type * as React from 'react';
import type {
  ArsenalItem,
  SelectableProduct,
  WhatsAppSetupState,
} from './WhatsAppExperience.helpers';
import { STEPS, TONE_OPTIONS } from './WhatsAppExperience.helpers';
import {
  Steps,
  QRCodePane,
  NonWahaProviderHint,
  ConnectedCelebration,
} from './WhatsAppExperience.connection-panes';
import {
  MetricCard,
  ProductPerformanceCard,
  InfoCard,
  FeedCard,
  ProductCard,
  type SummaryProductCard,
} from './WhatsAppExperience.dashboard-cards';
import { ToneCard, FollowUpSwitch, MediaItem } from './WhatsAppExperience.wizard-cards';
import { formatCompact } from './WhatsAppExperience.helpers';

const E = '#E85D30';
const V = KLOEL_THEME.bgPrimary;
const G = '#10B981';
const S = KLOEL_THEME.textSecondary;
const D = KLOEL_THEME.textPlaceholder;
const C = KLOEL_THEME.bgCard;
const B = KLOEL_THEME.borderPrimary;
const F = "'Sora', system-ui, sans-serif";
const M = "'JetBrains Mono', monospace";

const selectInputStyle: React.CSSProperties = {
  width: '100%',
  background: KLOEL_THEME.bgSecondary,
  border: `1px solid ${B}`,
  borderRadius: 4,
  padding: '8px 10px',
  color: KLOEL_THEME.textPrimary,
  fontSize: 12,
  fontFamily: F,
  outline: 'none',
};

interface EffectiveConnection {
  connected: boolean;
  status: string;
  phoneNumber: string;
  pushName: string;
  phoneNumberId: string;
}

interface ChannelRealData {
  messages: number;
  leads: number;
  sales: number;
  status: string;
}

export interface WizardPanelProps {
  fid: string;
  step: number;
  draft: WhatsAppSetupState;
  error: string | null;
  busyKey: string | null;
  qrCode: string;
  scanProgress: number;
  uploadingCount: number;
  effectiveConnection: EffectiveConnection;
  isWahaProvider: boolean;
  selectableProducts: SelectableProduct[];
  selectedIds: Set<string>;
  selectedProductsList: SelectableProduct[];
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onSetStep: (step: number) => void;
  onToggleSelectAll: () => void;
  onToggleProduct: (id: string) => void;
  onSaveProducts: () => void;
  onUpdateArsenalItem: (item: ArsenalItem) => void;
  onRemoveArsenalItem: (id: string) => void;
  onMediaUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onGoToConfigStep: () => void;
  onUpdateConfig: <K extends keyof WhatsAppSetupState['config']>(
    key: K,
    value: WhatsAppSetupState['config'][K],
  ) => void;
  onToggleFollowUp: () => void;
  onActivateAi: () => void;
  onRefreshQrCode: () => void;
}

/** Wizard setup panel. */
export function WizardPanel({
  fid,
  step,
  draft,
  error,
  busyKey,
  qrCode,
  scanProgress,
  uploadingCount,
  effectiveConnection,
  isWahaProvider,
  selectableProducts,
  selectedIds,
  selectedProductsList,
  fileInputRef,
  onSetStep,
  onToggleSelectAll,
  onToggleProduct,
  onSaveProducts,
  onUpdateArsenalItem,
  onRemoveArsenalItem,
  onMediaUpload,
  onGoToConfigStep,
  onUpdateConfig,
  onToggleFollowUp,
  onActivateAi,
  onRefreshQrCode,
}: WizardPanelProps) {
  return (
    <div
      style={{
        background: V,
        minHeight: '100%',
        color: KLOEL_THEME.textPrimary,
        fontFamily: F,
        borderRadius: 12,
      }}
    >
      <style>{`
        ::selection { background: rgba(232,93,48,.3); }
        input::placeholder, textarea::placeholder { color: ${KLOEL_THEME.textPlaceholder} !important; }
        select option { background: ${KLOEL_THEME.bgSecondary}; color: ${KLOEL_THEME.textPrimary}; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes celebrate { 0% { transform: scale(.8); opacity: 0; } 50% { transform: scale(1.05); } 100% { transform: scale(1); opacity: 1; } }
        .fade-in { animation: fadeUp .5s ease both; }
        @media (max-width: 760px) {
          .wa-tone-grid { grid-template-columns: 1fr !important; }
          .wa-operational-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 24px' }}>
        <Steps current={step} steps={STEPS} />
        {error ? (
          <div
            style={{
              marginBottom: 20,
              border: `1px solid color-mix(in srgb, ${KLOEL_THEME.error} 24%, transparent)`,
              background: KLOEL_THEME.errorBg,
              color: KLOEL_THEME.error,
              padding: '12px 14px',
              borderRadius: 6,
              fontSize: 12,
            }}
          >
            {error}
          </div>
        ) : null}
        {step === 0 ? (
          <div className="fade-in" style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, fontFamily: F }}>
              {kloelT(`Conectar WhatsApp`)}
            </h2>
            <p style={{ fontSize: 13, color: S, marginBottom: 32, fontFamily: F }}>
              {kloelT(`Escaneie o QR Code para a IA começar a vender pelo seu número`)}
            </p>
            {effectiveConnection.connected ? (
              <ConnectedCelebration />
            ) : isWahaProvider ? (
              <QRCodePane
                qrCode={qrCode}
                progress={scanProgress}
                connected={effectiveConnection.connected}
                loading={busyKey === 'connect'}
                onRefresh={onRefreshQrCode}
              />
            ) : (
              <NonWahaProviderHint />
            )}
          </div>
        ) : null}
        {step === 1 ? (
          <div className="fade-in">
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4, fontFamily: F }}>
              {kloelT(`Selecione os produtos`)}
            </h2>
            <p style={{ fontSize: 13, color: S, marginBottom: 8, fontFamily: F }}>
              {kloelT(
                `Escolha quais produtos a IA vai vender neste WhatsApp. Seus produtos e afiliações aprovadas aparecem aqui.`,
              )}
            </p>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 20,
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontFamily: M, fontSize: 11, color: D }}>
                {draft.selectedProducts.length} de {selectableProducts.length} selecionados
              </span>
              <button
                type="button"
                onClick={onToggleSelectAll}
                style={{
                  background: 'none',
                  border: `1px solid ${B}`,
                  borderRadius: 4,
                  padding: '6px 12px',
                  color: S,
                  fontSize: 11,
                  cursor: 'pointer',
                  fontFamily: F,
                }}
              >
                {draft.selectedProducts.length === selectableProducts.length
                  ? 'Desmarcar todos'
                  : 'Selecionar todos'}
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {selectableProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  selected={selectedIds.has(product.id)}
                  onToggle={() => onToggleProduct(product.id)}
                />
              ))}
            </div>
            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                disabled={draft.selectedProducts.length === 0 || busyKey === 'products'}
                onClick={onSaveProducts}
                style={{
                  background: draft.selectedProducts.length > 0 ? E : B,
                  color: draft.selectedProducts.length > 0 ? V : D,
                  border: 'none',
                  borderRadius: 6,
                  padding: '12px 28px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: draft.selectedProducts.length > 0 ? 'pointer' : 'default',
                  fontFamily: F,
                }}
              >
                {busyKey === 'products' ? 'Salvando...' : 'Próximo →'}
              </button>
            </div>
          </div>
        ) : null}
        {step === 2 ? (
          <div className="fade-in">
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4, fontFamily: F }}>
              {kloelT(`Arsenal de vendas`)}
            </h2>
            <p style={{ fontSize: 13, color: S, marginBottom: 4, fontFamily: F }}>
              {kloelT(
                `Suba fotos, vídeos, áudios, depoimentos e provas sociais. Quanto mais material, melhor a IA vende.`,
              )}
            </p>
            <p style={{ fontSize: 11, color: E, marginBottom: 24, fontWeight: 500, fontFamily: F }}>
              {kloelT(
                `Cada mídia precisa ser descrita e vinculada a um produto — a IA usa essas informações para decidir quando e como enviar cada prova.`,
              )}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {draft.arsenal.map((item) => (
                <MediaItem
                  key={item.id}
                  item={item}
                  products={selectedProductsList}
                  onUpdate={onUpdateArsenalItem}
                  onRemove={() => onRemoveArsenalItem(item.id)}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: '100%',
                marginTop: 12,
                padding: '14px',
                background: C,
                border: `2px dashed ${B}`,
                borderRadius: 6,
                color: S,
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: F,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 18 }}>+</span> {kloelT(`Adicionar mídia`)}
            </button>
            <input ref={fileInputRef} type="file" multiple hidden onChange={onMediaUpload} />
            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
              <button
                type="button"
                onClick={() => onSetStep(1)}
                style={{
                  background: 'none',
                  border: `1px solid ${B}`,
                  borderRadius: 6,
                  padding: '12px 24px',
                  color: S,
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: F,
                }}
              >
                {kloelT(`← Voltar`)}
              </button>
              <button
                type="button"
                onClick={onGoToConfigStep}
                disabled={uploadingCount > 0 || busyKey === 'arsenal'}
                style={{
                  background: E,
                  color: V,
                  border: 'none',
                  borderRadius: 6,
                  padding: '12px 28px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: uploadingCount > 0 ? 'default' : 'pointer',
                  fontFamily: F,
                  opacity: uploadingCount > 0 ? 0.7 : 1,
                }}
              >
                {uploadingCount > 0
                  ? 'Enviando...'
                  : draft.arsenal.length > 0
                    ? 'Próximo →'
                    : 'Pular por agora →'}
              </button>
            </div>
          </div>
        ) : null}
        {step === 3 ? (
          <div className="fade-in">
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4, fontFamily: F }}>
              {kloelT(`Configurar a IA`)}
            </h2>
            <p style={{ fontSize: 13, color: S, marginBottom: 24, fontFamily: F }}>
              {kloelT(`Defina como a IA se comporta nas conversas. Tudo pode ser alterado depois.`)}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#9A9A9F',
                    marginBottom: 6,
                    display: 'block',
                    fontFamily: F,
                  }}
                >
                  {kloelT(`Tom da conversa`)}
                </span>
                <div
                  className="wa-tone-grid"
                  style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}
                >
                  {TONE_OPTIONS.map(([value, label, description]) => (
                    <ToneCard
                      key={value}
                      value={value}
                      label={label}
                      description={description}
                      selected={draft.config.tone === value}
                      onSelect={(next) => onUpdateConfig('tone', next)}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#9A9A9F',
                    marginBottom: 6,
                    display: 'block',
                    fontFamily: F,
                  }}
                  htmlFor={`${fid}-desconto`}
                >
                  {kloelT(`Desconto máximo que a IA pode oferecer:`)}{' '}
                  <span style={{ color: E, fontFamily: M }}>{draft.config.maxDiscount}%</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="50"
                  value={draft.config.maxDiscount}
                  onChange={(event) => onUpdateConfig('maxDiscount', Number(event.target.value))}
                  style={{ width: '100%', accentColor: E }}
                  id={`${fid}-desconto`}
                />
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 10,
                    color: D,
                    fontFamily: M,
                  }}
                >
                  <span>{kloelT(`0% (sem desconto)`)}</span>
                  <span>50%</span>
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: C,
                  border: `1px solid ${B}`,
                  borderRadius: 6,
                  padding: 14,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: KLOEL_THEME.textPrimary,
                      fontFamily: F,
                    }}
                  >
                    {kloelT(`Follow-up automático`)}
                  </div>
                  <div style={{ fontSize: 11, color: D, fontFamily: F }}>
                    {kloelT(`A IA retoma leads que não responderam`)}
                  </div>
                </div>
                <FollowUpSwitch enabled={draft.config.followUp} onToggle={onToggleFollowUp} />
              </div>
              {draft.config.followUp ? (
                <div>
                  <label
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#9A9A9F',
                      marginBottom: 6,
                      display: 'block',
                      fontFamily: F,
                    }}
                    htmlFor={`${fid}-followup`}
                  >
                    {kloelT(`Tempo para follow-up:`)}{' '}
                    <span style={{ color: E, fontFamily: M }}>{draft.config.followUpHours}h</span>
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="72"
                    value={draft.config.followUpHours}
                    onChange={(event) =>
                      onUpdateConfig('followUpHours', Number(event.target.value))
                    }
                    style={{ width: '100%', accentColor: E }}
                    id={`${fid}-followup`}
                  />
                </div>
              ) : null}
              <div>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#9A9A9F',
                    marginBottom: 6,
                    display: 'block',
                    fontFamily: F,
                  }}
                  htmlFor={`${fid}-horario`}
                >
                  {kloelT(`Horário de atendimento`)}
                </label>
                <input
                  type="text"
                  value={draft.config.workingHours}
                  onChange={(event) => onUpdateConfig('workingHours', event.target.value)}
                  placeholder={kloelT(`08:00-22:00`)}
                  style={{ ...selectInputStyle, fontFamily: M }}
                  id={`${fid}-horario`}
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#9A9A9F',
                    marginBottom: 6,
                    display: 'block',
                    fontFamily: F,
                  }}
                  htmlFor={`${fid}-instrucoes`}
                >
                  {kloelT(`Suas instruções para o Kloel`)}
                </label>
                <textarea
                  value={draft.config.greeting}
                  onChange={(event) => onUpdateConfig('greeting', event.target.value)}
                  placeholder={kloelT(
                    `Ex: Nunca ofereça desconto antes do cliente pedir. Sempre mencione o bônus. Chame pelo primeiro nome...`,
                  )}
                  style={{
                    ...selectInputStyle,
                    resize: 'vertical',
                    minHeight: 70,
                    lineHeight: 1.5,
                  }}
                  id={`${fid}-instrucoes`}
                />
              </div>
            </div>
            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
              <button
                type="button"
                onClick={() => onSetStep(2)}
                style={{
                  background: 'none',
                  border: `1px solid ${B}`,
                  borderRadius: 6,
                  padding: '12px 24px',
                  color: S,
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: F,
                }}
              >
                {kloelT(`← Voltar`)}
              </button>
              <button
                type="button"
                onClick={onActivateAi}
                disabled={busyKey === 'activate'}
                style={{
                  background: G,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '14px 36px',
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: F,
                  boxShadow: `0 0 20px ${G}40`,
                  opacity: busyKey === 'activate' ? 0.7 : 1,
                }}
              >
                {busyKey === 'activate' ? 'Salvando...' : 'Salvar e ativar IA'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export interface OperationalPanelProps {
  statusLabel: string;
  profileName: string;
  connectedPhone: string;
  channelData: ChannelRealData | null;
  summaryProducts: SummaryProductCard[];
  liveFeed: string[];
  summaryData:
    | {
        sessionName?: string;
        tone?: string | null;
        maxDiscount?: number;
        followUpEnabled?: boolean;
        arsenalCount?: number;
      }
    | null
    | undefined;
  draft: WhatsAppSetupState;
  workspaceId: string;
  effectiveConnection: EffectiveConnection;
  onReconfigure: () => void;
}

/** Operational dashboard panel shown when WhatsApp is configured. */
export function OperationalPanel({
  statusLabel,
  profileName,
  connectedPhone,
  channelData,
  summaryProducts,
  liveFeed,
  summaryData,
  draft,
  workspaceId,
  onReconfigure,
}: OperationalPanelProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        @media (max-width: 760px) {
          .wa-operational-grid { grid-template-columns: 1fr !important; }
          .wa-products-performance-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: M,
              fontSize: 11,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: E,
              marginBottom: 8,
            }}
          >
            {kloelT(`WhatsApp`)}
          </div>
          <h2 style={{ margin: 0, fontSize: 24, color: KLOEL_THEME.textPrimary, fontFamily: F }}>
            {kloelT(`Painel operacional`)}
          </h2>
        </div>
        <button
          type="button"
          onClick={onReconfigure}
          style={{
            background: 'none',
            border: `1px solid ${B}`,
            borderRadius: 6,
            padding: '10px 18px',
            color: KLOEL_THEME.textPrimary,
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: F,
          }}
        >
          {kloelT(`Reconfigurar`)}
        </button>
      </div>
      <div
        className="wa-operational-grid"
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}
      >
        <InfoCard label={kloelT(`Status`)} value={statusLabel} />
        <InfoCard label={kloelT(`Perfil conectado`)} value={profileName} />
        <InfoCard label={kloelT(`Telefone conectado`)} value={connectedPhone} />
      </div>
      <div
        className="wa-operational-grid"
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}
      >
        <MetricCard
          label={kloelT(`Mensagens`)}
          value={formatCompact(channelData?.messages ?? 0)}
          accent={E}
        />
        <MetricCard
          label={kloelT(`Leads`)}
          value={formatCompact(channelData?.leads ?? 0)}
          accent={G}
        />
        <MetricCard
          label={kloelT(`Vendas`)}
          value={String(channelData?.sales ?? 0)}
          accent="#7F66FF"
        />
      </div>
      <div
        className="wa-products-performance-grid"
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}
      >
        {summaryProducts.length > 0 ? (
          summaryProducts.map((product) => (
            <ProductPerformanceCard key={product.id} product={product} />
          ))
        ) : (
          <div
            style={{
              gridColumn: '1 / -1',
              background: C,
              border: `1px solid ${B}`,
              borderRadius: 6,
              padding: 16,
              color: S,
              fontFamily: F,
              fontSize: 13,
            }}
          >
            {kloelT(`Nenhum produto foi vinculado a este WhatsApp ainda.`)}
          </div>
        )}
      </div>
      <div
        className="wa-operational-grid"
        style={{ display: 'grid', gridTemplateColumns: '1.4fr .6fr', gap: 12 }}
      >
        <FeedCard liveFeed={liveFeed} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <InfoCard
            label={kloelT(`Sessão`)}
            value={summaryData?.sessionName || draft.sessionName || workspaceId}
          />
          <InfoCard
            label={kloelT(`Tom`)}
            value={
              TONE_OPTIONS.find(
                ([value]) => value === (summaryData?.tone || draft.config.tone),
              )?.[1] || 'Profissional'
            }
          />
          <InfoCard
            label={kloelT(`Desconto máximo`)}
            value={`${summaryData?.maxDiscount ?? draft.config.maxDiscount}%`}
          />
          <InfoCard
            label={kloelT(`Follow-up`)}
            value={
              (summaryData?.followUpEnabled ?? draft.config.followUp)
                ? `${draft.config.followUpHours}h`
                : 'Desativado'
            }
          />
          <InfoCard label={kloelT(`Atendimento`)} value={draft.config.workingHours} />
          <InfoCard
            label={kloelT(`Arsenal`)}
            value={`${summaryData?.arsenalCount ?? draft.arsenal.length} mídia(s)`}
          />
        </div>
      </div>
    </div>
  );
}
