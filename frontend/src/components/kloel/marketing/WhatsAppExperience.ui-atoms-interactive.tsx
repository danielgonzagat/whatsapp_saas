'use client';

import { kloelT } from '@/lib/i18n/t';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import Image from 'next/image';
import type {
  ArsenalItem,
  MediaTypeValue,
  SelectableProduct,
  ToneMode,
} from './WhatsAppExperience.helpers';
import { MEDIA_TYPES, getProductIcon, formatMoney } from './WhatsAppExperience.helpers';
import { selectInputStyle } from './WhatsAppExperience.ui-atoms';

const E = '#E85D30';
const G = '#10B981';
const P = '#7F66FF';
const T = KLOEL_THEME.textPrimary;
const D = KLOEL_THEME.textPlaceholder;
const C = KLOEL_THEME.bgCard;
const U = KLOEL_THEME.bgSecondary;
const B = KLOEL_THEME.borderPrimary;
const M = "'JetBrains Mono', monospace";

export function ProductCard({
  product,
  selected,
  onToggle,
}: {
  product: SelectableProduct;
  selected: boolean;
  onToggle: () => void;
}) {
  const badge =
    product.type === 'affiliate'
      ? { background: '#7F66FF20', color: P, label: `AFILIADO ${product.affiliateComm ?? 0}%` }
      : { background: `${G}15`, color: G, label: 'PRODUTOR' };

  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        all: 'unset',
        background: selected ? `${E}10` : C,
        border: `1.5px solid ${selected ? E : B}`,
        borderRadius: 6,
        padding: 16,
        cursor: 'pointer',
        transition: 'all .2s',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        userSelect: 'none',
        boxSizing: 'border-box',
        width: '100%',
      }}
    >
      <span
        style={{
          fontSize: 24,
          width: 40,
          height: 40,
          borderRadius: 6,
          background: U,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            width={40}
            height={40}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          getProductIcon(product)
        )}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{ display: 'block', fontSize: 13, fontWeight: 600, color: T, marginBottom: 2 }}
        >
          {product.name}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: M, fontSize: 12, color: E, fontWeight: 700 }}>
            {formatMoney(product.price)}
          </span>
          <span
            style={{
              fontSize: 9,
              fontFamily: M,
              background: badge.background,
              color: badge.color,
              padding: '2px 6px',
              borderRadius: 3,
              fontWeight: 600,
            }}
          >
            {badge.label}
          </span>
        </span>
      </span>
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          border: `2px solid ${selected ? E : D}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all .2s',
          background: selected ? E : 'transparent',
        }}
      >
        {selected ? (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : null}
      </span>
    </button>
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
            background: U,
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
          <div style={{ fontSize: 10, color: D, fontFamily: M }}>
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
          onChange={(event) => onUpdate({ ...item, type: event.target.value as MediaTypeValue })}
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
          style={{ ...selectInputStyle, resize: 'vertical', minHeight: 60, lineHeight: 1.5 }}
        />
      </div>
    </div>
  );
}

export function MetricCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div
      style={{
        background: C,
        border: `1px solid ${B}`,
        borderRadius: 6,
        padding: 16,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: accent }}
      />
      <div
        style={{
          fontFamily: "'Sora', system-ui, sans-serif",
          fontSize: 10,
          color: D,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: M, fontSize: 22, color: T }}>{value}</div>
    </div>
  );
}

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
  onSelect: (v: ToneMode) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      style={{
        all: 'unset',
        background: selected ? `${E}12` : C,
        border: `1.5px solid ${selected ? E : B}`,
        borderRadius: 6,
        padding: '12px 14px',
        cursor: 'pointer',
        transition: 'all .2s',
        display: 'block',
        boxSizing: 'border-box',
        width: '100%',
      }}
    >
      <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T, marginBottom: 2 }}>
        {label}
      </span>
      <span style={{ display: 'block', fontSize: 11, color: D, lineHeight: 1.4 }}>
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
