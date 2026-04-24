'use client';

import { kloelT } from '@/lib/i18n/t';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import Image from 'next/image';
import type * as React from 'react';
import type { SelectableProduct, SummaryProductCard } from './WhatsAppExperience.helpers';
import { formatMoney, getProductIcon } from './WhatsAppExperience.helpers';
export type { SummaryProductCard };

const E = '#E85D30';
const G = '#10B981';
const P = '#7F66FF';
const T = KLOEL_THEME.textPrimary;
const S = KLOEL_THEME.textSecondary;
const D = KLOEL_THEME.textPlaceholder;
const C = KLOEL_THEME.bgCard;
const U = KLOEL_THEME.bgSecondary;
const B = KLOEL_THEME.borderPrimary;
const F = "'Sora', system-ui, sans-serif";
const M = "'JetBrains Mono', monospace";

export const selectInputStyle: React.CSSProperties = {
  width: '100%',
  background: U,
  border: `1px solid ${B}`,
  borderRadius: 4,
  padding: '8px 10px',
  color: T,
  fontSize: 12,
  fontFamily: F,
  outline: 'none',
};

export const panelMiniStatStyle: React.CSSProperties = {
  background: U,
  border: `1px solid ${B}`,
  borderRadius: 6,
  padding: 12,
};

export const panelMiniLabelStyle: React.CSSProperties = {
  fontFamily: F,
  fontSize: 10,
  color: D,
  letterSpacing: '0.2em',
  textTransform: 'uppercase',
  marginBottom: 6,
};

export const panelMiniValueStyle: React.CSSProperties = {
  fontFamily: M,
  fontSize: 14,
  color: T,
};

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
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: accent,
        }}
      />
      <div
        style={{
          fontFamily: F,
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

export function ProductPerformanceCard({ product }: { product: SummaryProductCard }) {
  const badge =
    product.type === 'affiliate'
      ? {
          background: '#7F66FF20',
          color: P,
          label: `AFILIADO ${product.affiliateComm ?? 0}%`,
        }
      : {
          background: `${G}15`,
          color: G,
          label: 'PRODUTOR',
        };

  return (
    <div style={{ background: C, border: `1px solid ${B}`, borderRadius: 6, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 6,
            background: U,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            fontSize: 24,
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
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T, marginBottom: 4 }}>
            {product.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: M, fontSize: 11, color: E, fontWeight: 700 }}>
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
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
        <div style={panelMiniStatStyle}>
          <div style={panelMiniLabelStyle}>{kloelT(`Vendas`)}</div>
          <div style={panelMiniValueStyle}>{product.salesCount}</div>
        </div>
        <div style={panelMiniStatStyle}>
          <div style={panelMiniLabelStyle}>{kloelT(`Receita`)}</div>
          <div style={panelMiniValueStyle}>{formatMoney(product.revenue)}</div>
        </div>
      </div>
    </div>
  );
}

export function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: C, border: `1px solid ${B}`, borderRadius: 6, padding: 16 }}>
      <div
        style={{
          fontFamily: F,
          fontSize: 10,
          color: D,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: M, fontSize: 13, color: T, wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}

export function FeedCard({ liveFeed }: { liveFeed: string[] }) {
  const items = liveFeed.length > 0 ? liveFeed : ['Aguardando mensagens do WhatsApp...'];

  return (
    <div style={{ background: C, border: `1px solid ${B}`, borderRadius: 6, padding: 16 }}>
      <div
        style={{
          fontFamily: F,
          fontSize: 11,
          color: D,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          marginBottom: 12,
        }}
      >
        {kloelT(`Feed de mensagens ao vivo`)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.slice(0, 18).map((message) => (
          <div
            key={message}
            style={{
              background: U,
              border: `1px solid ${B}`,
              borderRadius: 6,
              padding: 12,
              fontFamily: M,
              fontSize: 11,
              color: T,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {message}
          </div>
        ))}
      </div>
    </div>
  );
}

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
      ? {
          background: '#7F66FF20',
          color: P,
          label: `AFILIADO ${product.affiliateComm ?? 0}%`,
        }
      : {
          background: `${G}15`,
          color: G,
          label: 'PRODUTOR',
        };

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
            stroke={KLOEL_THEME.bgPrimary}
            strokeWidth="3"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : null}
      </span>
    </button>
  );
}
