'use client';

import Image from 'next/image';

/* ─── Types ────────────────────────────────────────────────────────────────── */

export interface OrderBumpData {
  id: string;
  title: string;
  description: string;
  productName: string;
  image?: string;
  priceInCents: number;
  compareAtPrice?: number;
  highlightColor?: string;
  checkboxLabel?: string;
}

interface OrderBumpCardProps {
  bump: OrderBumpData;
  checked: boolean;
  onToggle: (id: string) => void;
  accentColor?: string;
  cardBg?: string;
  mutedColor?: string;
  textColor?: string;
}

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function formatBRL(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

/* ─── Component ────────────────────────────────────────────────────────────── */

export default function OrderBumpCard({
  bump,
  checked,
  onToggle,
  accentColor = '#D4AF37',
  cardBg = '#141416',
  mutedColor = '#8A8A8E',
  textColor: _textColor = '#E8E6E1',
}: OrderBumpCardProps) {
  const borderCol = bump.highlightColor || accentColor;

  return (
    <button
      type="button"
      onClick={() => onToggle(bump.id)}
      aria-pressed={checked}
      aria-label={bump.productName ?? 'Order bump'}
      style={{
        all: 'unset',
        border: `2px dashed ${checked ? borderCol : `${borderCol}44`}`,
        background: checked ? `${borderCol}08` : cardBg,
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '10px',
        cursor: 'pointer',
        transition: 'all 0.2s',
        display: 'block',
        boxSizing: 'border-box',
        width: '100%',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Checkbox */}
        <span
          style={{
            width: '22px',
            height: '22px',
            borderRadius: '6px',
            border: `2px solid ${checked ? borderCol : '#3A3A3E'}`,
            background: checked ? borderCol : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'all 0.2s',
            color: '#FFFFFF',
          }}
        >
          {checked && (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path
                d="M2.5 6L5 8.5L9.5 3.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>

        {/* Image */}
        {bump.image && (
          <Image
            src={bump.image}
            alt={bump.productName}
            width={44}
            height={44}
            unoptimized
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '8px',
              objectFit: 'cover',
              flexShrink: 0,
            }}
          />
        )}

        {/* Text */}
        <span style={{ flex: 1 }}>
          <span
            style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: borderCol, marginBottom: '2px' }}
          >
            {bump.checkboxLabel || 'Sim, eu quero!'}
          </span>
          <span style={{ display: 'block', fontSize: '12px', color: mutedColor }}>
            {bump.description}
          </span>
        </span>

        {/* Price */}
        <span style={{ textAlign: 'right', flexShrink: 0 }}>
          {bump.compareAtPrice != null && (
            <span
              style={{ display: 'block', fontSize: '11px', color: mutedColor, textDecoration: 'line-through' }}
            >
              {formatBRL(bump.compareAtPrice)}
            </span>
          )}
          <span style={{ display: 'block', fontSize: '14px', fontWeight: 700, color: borderCol }}>
            {formatBRL(bump.priceInCents)}
          </span>
        </span>
      </span>
    </button>
  );
}
