'use client';

import { kloelT } from '@/lib/i18n/t';
import { UI } from '@/lib/ui-tokens';
import type * as React from 'react';
import type {
  ArsenalItem,
  SelectableProduct,
  WhatsAppSetupState,
} from './WhatsAppExperience.helpers';
import { MediaItem } from './WhatsAppExperience.wizard-cards';
import { B, C, E, F, S, V } from './WhatsAppExperience.panel-tokens';

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
