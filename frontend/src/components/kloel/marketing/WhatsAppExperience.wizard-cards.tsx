'use client';

import { kloelT } from '@/lib/i18n/t';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import Image from 'next/image';
import type * as React from 'react';
import type { ArsenalItem, SelectableProduct, ToneMode } from './WhatsAppExperience.helpers';
import { MEDIA_TYPES } from './WhatsAppExperience.helpers';
import { selectInputStyle } from './WhatsAppExperience.dashboard-cards';

const E = '#E85D30';
const T = KLOEL_THEME.textPrimary;
const D = KLOEL_THEME.textPlaceholder;
const C = KLOEL_THEME.bgCard;
const B = KLOEL_THEME.borderPrimary;
const F = "'Sora', system-ui, sans-serif";

export function ToneCard({
  value,
  label,
  description,
  selected,
  onSelect,
}: {
  value: ToneMode;
  label: string;
  description: string;
  selected: boolean;
  onSelect: (value: ToneMode) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      style={{
        all: 'unset',
        background: selected ? `${E}10` : C,
        border: `1.5px solid ${selected ? E : B}`,
        borderRadius: 6,
        padding: 12,
        cursor: 'pointer',
        transition: 'all .2s',
        display: 'block',
        boxSizing: 'border-box',
        width: '100%',
      }}
    >
      <span
        style={{
          display: 'block',
          fontSize: 12,
          fontWeight: 600,
          color: T,
          marginBottom: 2,
          fontFamily: F,
        }}
      >
        {label}
      </span>
      <span style={{ display: 'block', fontSize: 10, color: D, lineHeight: 1.4, fontFamily: F }}>
        {description}
      </span>
    </button>
  );
}

export function FollowUpSwitch({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <div
      role="switch"
      tabIndex={0}
      aria-checked={enabled}
      onClick={onToggle}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        background: enabled ? E : B,
        cursor: 'pointer',
        position: 'relative',
        transition: 'background .2s',
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          background: '#fff',
          position: 'absolute',
          top: 3,
          left: enabled ? 23 : 3,
          transition: 'left .2s',
        }}
      />
    </div>
  );
}

export function MediaItem({
  item,
  products,
  onUpdate,
  onRemove,
}: {
  item: ArsenalItem;
  products: SelectableProduct[];
  onUpdate: (next: ArsenalItem) => void;
  onRemove: () => void;
}) {
  return (
    <div style={{ background: C, border: `1px solid ${B}`, borderRadius: 6, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 6,
            background: KLOEL_THEME.bgSecondary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            overflow: 'hidden',
          }}
        >
          {item.url && item.mimeType?.startsWith('image/') ? (
            <Image
              src={item.url}
              alt={item.fileName}
              width={48}
              height={48}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            MEDIA_TYPES.find((type) => type.value === item.type)?.icon || 'Anexo'
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T }}>
            {item.fileName || 'Arquivo selecionado'}
          </div>
          <div
            style={{
              fontSize: 10,
              color: D,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {item.type
              ? MEDIA_TYPES.find((type) => type.value === item.type)?.label
              : 'Tipo não definido'}
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          style={{
            background: 'none',
            border: 'none',
            color: '#EF4444',
            cursor: 'pointer',
            fontSize: 16,
            padding: 4,
          }}
        >
          ×
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <select
          value={item.type || ''}
          onChange={(event) =>
            onUpdate({ ...item, type: event.target.value as ArsenalItem['type'] })
          }
          style={selectInputStyle}
        >
          <option value="">{kloelT(`Selecione o tipo de mídia`)}</option>
          {MEDIA_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.icon} {type.label}
            </option>
          ))}
        </select>
        <select
          value={item.productId || ''}
          onChange={(event) => onUpdate({ ...item, productId: event.target.value })}
          style={selectInputStyle}
        >
          <option value="">{kloelT(`De qual produto é essa mídia?`)}</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
        <textarea
          value={item.description || ''}
          onChange={(event) => onUpdate({ ...item, description: event.target.value })}
          placeholder={kloelT(
            `Descreva essa mídia — o que ela mostra, por que é importante para a venda, contexto que a IA precisa saber...`,
          )}
          style={{
            ...selectInputStyle,
            resize: 'vertical',
            minHeight: 60,
            lineHeight: 1.5,
          }}
        />
      </div>
    </div>
  );
}

export type { ToneMode, ArsenalItem, SelectableProduct };
