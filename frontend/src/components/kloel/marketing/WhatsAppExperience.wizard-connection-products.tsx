'use client';

import { kloelT } from '@/lib/i18n/t';
import { UI } from '@/lib/ui-tokens';
import type { SelectableProduct, WhatsAppSetupState } from './WhatsAppExperience.helpers';
import {
  ConnectedCelebration,
  NonWahaProviderHint,
  QRCodePane,
} from './WhatsAppExperience.connection-panes';
import { ProductCard } from './WhatsAppExperience.dashboard-cards';
import { B, D, E, F, M, S, V, type EffectiveConnection } from './WhatsAppExperience.panel-tokens';

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
