'use client';

import { kloelT } from '@/lib/i18n/t';
import { UI } from '@/lib/ui-tokens';
import type { SelectableProduct, WhatsAppSetupState } from './WhatsAppExperience.helpers';
import { ConnectedCelebration, QRCodePane } from './WhatsAppExperience.connection-panes';
import { ProductCard } from './WhatsAppExperience.dashboard-cards';
import {
  B,
  D,
  E,
  F,
  G,
  M,
  S,
  V,
  type EffectiveConnection,
} from './WhatsAppExperience.panel-tokens';

export interface ConnectionStepProps {
  effectiveConnection: EffectiveConnection;
  isWahaProvider: boolean;
  qrCode: string;
  scanProgress: number;
  busyKey: string | null;
  onRefreshQrCode: () => void;
  metaAuthUrl: string | null;
  isMetaProvider: boolean;
  metaConnecting: boolean;
  onConnectMeta: (url: string) => void;
}

const META_ICON = (s: number) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path
      d={kloelT(
        `M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z`,
      )}
    />
  </svg>
);

export function ConnectionStep({
  effectiveConnection,
  isWahaProvider,
  qrCode,
  scanProgress,
  busyKey,
  onRefreshQrCode,
  metaAuthUrl,
  isMetaProvider,
  metaConnecting,
  onConnectMeta,
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
      ) : isMetaProvider && metaAuthUrl ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: UI.radiusFull,
              background: `${G}15`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              color: E,
            }}
          >
            {META_ICON(32)}
          </div>
          <p style={{ fontSize: 14, color: S, maxWidth: 360, lineHeight: 1.6, fontFamily: F }}>
            {kloelT(
              `Conecte sua conta do Facebook Business para ativar o WhatsApp Cloud API e começar a vender com IA.`,
            )}
          </p>
          <button
            type="button"
            onClick={() => onConnectMeta(metaAuthUrl)}
            disabled={metaConnecting}
            style={{
              background: E,
              color: UI.inverse,
              border: 'none',
              borderRadius: UI.radiusMd,
              padding: '14px 36px',
              fontSize: 15,
              fontWeight: 700,
              cursor: metaConnecting ? 'wait' : 'pointer',
              fontFamily: F,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              opacity: metaConnecting ? 0.75 : 1,
            }}
          >
            {META_ICON(20)}
            {metaConnecting ? 'Redirecionando...' : 'Conectar com Meta'}
          </button>
          <p style={{ fontSize: 11, color: D, fontFamily: F, maxWidth: 360 }}>
            {kloelT(
              `Voce sera redirecionado para o Facebook para autorizar a conexao. Apos autorizar, volte para esta tela.`,
            )}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: UI.radiusFull,
              background: `${E}10`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              color: E,
              opacity: 0.5,
            }}
          >
            {META_ICON(28)}
          </div>
          <p style={{ fontSize: 14, color: S, maxWidth: 360, lineHeight: 1.6, fontFamily: F }}>
            {kloelT(
              `A URL de autorizacao Meta ainda nao esta disponivel. Verifique a configuracao do app Meta Business no backend.`,
            )}
          </p>
          <button
            type="button"
            onClick={onRefreshQrCode}
            disabled={busyKey === 'connect'}
            style={{
              background: E,
              color: V,
              border: 'none',
              borderRadius: UI.radiusMd,
              padding: '12px 28px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: F,
              opacity: busyKey === 'connect' ? 0.7 : 1,
            }}
          >
            {busyKey === 'connect' ? 'Verificando...' : 'Tentar novamente'}
          </button>
        </div>
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
