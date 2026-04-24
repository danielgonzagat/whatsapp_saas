'use client';

import { kloelT } from '@/lib/i18n/t';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { UI } from '@/lib/ui-tokens';
import type * as React from 'react';
import type {
  ArsenalItem,
  SelectableProduct,
  WhatsAppSetupState,
} from './WhatsAppExperience.helpers';
import { TONE_OPTIONS } from './WhatsAppExperience.helpers';
import {
  ConnectedCelebration,
  NonWahaProviderHint,
  QRCodePane,
} from './WhatsAppExperience.connection-panes';
import { ProductCard } from './WhatsAppExperience.dashboard-cards';
import { FollowUpSwitch, MediaItem, ToneCard } from './WhatsAppExperience.wizard-cards';
import {
  B,
  C,
  D,
  E,
  F,
  G,
  M,
  S,
  V,
  selectInputStyle,
  type EffectiveConnection,
} from './WhatsAppExperience.panel-tokens';

export interface ConnectionStepProps {
  effectiveConnection: EffectiveConnection;
  isWahaProvider: boolean;
  qrCode: string;
  scanProgress: number;
  busyKey: string | null;
  onRefreshQrCode: () => void;
}

export function ConnectionStep({
  effectiveConnection,
  isWahaProvider,
  qrCode,
  scanProgress,
  busyKey,
  onRefreshQrCode,
}: ConnectionStepProps) {
  return (
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
  );
}

export interface ProductsStepProps {
  draft: WhatsAppSetupState;
  busyKey: string | null;
  selectableProducts: SelectableProduct[];
  selectedIds: Set<string>;
  onToggleSelectAll: () => void;
  onToggleProduct: (id: string) => void;
  onSaveProducts: () => void;
}

export function ProductsStep({
  draft,
  busyKey,
  selectableProducts,
  selectedIds,
  onToggleSelectAll,
  onToggleProduct,
  onSaveProducts,
}: ProductsStepProps) {
  return (
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
            borderRadius: UI.radiusSm,
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
            borderRadius: UI.radiusMd,
            padding: '12px 28px',
            fontSize: 14,
            fontWeight: 600,
            cursor: draft.selectedProducts.length > 0 ? 'pointer' : 'default',
            fontFamily: F,
          }}
        >
          {busyKey === 'products' ? 'Salvando...' : 'Próximo ->'}
        </button>
      </div>
    </div>
  );
}

export interface ArsenalStepProps {
  draft: WhatsAppSetupState;
  busyKey: string | null;
  uploadingCount: number;
  selectedProductsList: SelectableProduct[];
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onSetStep: (step: number) => void;
  onUpdateArsenalItem: (item: ArsenalItem) => void;
  onRemoveArsenalItem: (id: string) => void;
  onMediaUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onGoToConfigStep: () => void;
}

export function ArsenalStep({
  draft,
  busyKey,
  uploadingCount,
  selectedProductsList,
  fileInputRef,
  onSetStep,
  onUpdateArsenalItem,
  onRemoveArsenalItem,
  onMediaUpload,
  onGoToConfigStep,
}: ArsenalStepProps) {
  return (
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
          `Cada mídia precisa ser descrita e vinculada a um produto - a IA usa essas informações para decidir quando e como enviar cada prova.`,
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
          borderRadius: UI.radiusMd,
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
        <span style={{ fontSize: 18 }}>+</span> {kloelT(`Adicionar midia`)}
      </button>
      <input ref={fileInputRef} type="file" multiple hidden onChange={onMediaUpload} />
      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
        <button
          type="button"
          onClick={() => onSetStep(1)}
          style={{
            background: 'none',
            border: `1px solid ${B}`,
            borderRadius: UI.radiusMd,
            padding: '12px 24px',
            color: S,
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: F,
          }}
        >
          {kloelT(`<- Voltar`)}
        </button>
        <button
          type="button"
          onClick={onGoToConfigStep}
          disabled={uploadingCount > 0 || busyKey === 'arsenal'}
          style={{
            background: E,
            color: V,
            border: 'none',
            borderRadius: UI.radiusMd,
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
              ? 'Próximo ->'
              : 'Pular por agora ->'}
        </button>
      </div>
    </div>
  );
}

export interface ConfigStepProps {
  fid: string;
  draft: WhatsAppSetupState;
  busyKey: string | null;
  onSetStep: (step: number) => void;
  onUpdateConfig: <K extends keyof WhatsAppSetupState['config']>(
    key: K,
    value: WhatsAppSetupState['config'][K],
  ) => void;
  onToggleFollowUp: () => void;
  onActivateAi: () => void;
}

export function ConfigStep({
  fid,
  draft,
  busyKey,
  onSetStep,
  onUpdateConfig,
  onToggleFollowUp,
  onActivateAi,
}: ConfigStepProps) {
  return (
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
              color: UI.muted,
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
        <label
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: UI.muted,
            marginBottom: 6,
            display: 'block',
            fontFamily: F,
          }}
          htmlFor={`${fid}-desconto`}
        >
          {kloelT(`Desconto maximo que a IA pode oferecer:`)}{' '}
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
            alignItems: 'center',
            justifyContent: 'space-between',
            background: C,
            border: `1px solid ${B}`,
            borderRadius: UI.radiusMd,
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
              {kloelT(`Follow-up automatico`)}
            </div>
            <div style={{ fontSize: 11, color: D, fontFamily: F }}>
              {kloelT(`A IA retoma leads que nao responderam`)}
            </div>
          </div>
          <FollowUpSwitch enabled={draft.config.followUp} onToggle={onToggleFollowUp} />
        </div>
        {draft.config.followUp ? (
          <input
            type="range"
            min="1"
            max="72"
            value={draft.config.followUpHours}
            onChange={(event) => onUpdateConfig('followUpHours', Number(event.target.value))}
            style={{ width: '100%', accentColor: E }}
            id={`${fid}-followup`}
          />
        ) : null}
        <input
          type="text"
          value={draft.config.workingHours}
          onChange={(event) => onUpdateConfig('workingHours', event.target.value)}
          placeholder={kloelT(`08:00-22:00`)}
          style={{ ...selectInputStyle, fontFamily: M }}
          id={`${fid}-horario`}
        />
        <textarea
          value={draft.config.greeting}
          onChange={(event) => onUpdateConfig('greeting', event.target.value)}
          placeholder={kloelT(
            `Ex: Nunca ofereca desconto antes do cliente pedir. Sempre mencione o bonus. Chame pelo primeiro nome...`,
          )}
          style={{ ...selectInputStyle, resize: 'vertical', minHeight: 70, lineHeight: 1.5 }}
          id={`${fid}-instrucoes`}
        />
      </div>
      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
        <button
          type="button"
          onClick={() => onSetStep(2)}
          style={{
            background: 'none',
            border: `1px solid ${B}`,
            borderRadius: UI.radiusMd,
            padding: '12px 24px',
            color: S,
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: F,
          }}
        >
          {kloelT(`<- Voltar`)}
        </button>
        <button
          type="button"
          onClick={onActivateAi}
          disabled={busyKey === 'activate'}
          style={{
            background: G,
            color: UI.bg,
            border: 'none',
            borderRadius: UI.radiusMd,
            padding: '14px 36px',
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: F,
            boxShadow: `0 0 20px color-mix(in srgb, ${G} 40%, transparent)`,
            opacity: busyKey === 'activate' ? 0.7 : 1,
          }}
        >
          {busyKey === 'activate' ? 'Salvando...' : 'Salvar e ativar IA'}
        </button>
      </div>
    </div>
  );
}
