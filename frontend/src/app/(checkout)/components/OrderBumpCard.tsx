'use client';

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
  textColor = '#E8E6E1',
}: OrderBumpCardProps) {
  const borderCol = bump.highlightColor || accentColor;

  return (
    <div
      onClick={() => onToggle(bump.id)}
      style={{
        border: `2px dashed ${checked ? borderCol : `${borderCol}44`}`,
        background: checked ? `${borderCol}08` : cardBg,
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '10px',
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Checkbox */}
        <div
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
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M2.5 6L5 8.5L9.5 3.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>

        {/* Image */}
        {bump.image && (
          <img
            src={bump.image}
            alt={bump.productName}
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
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: borderCol, marginBottom: '2px' }}>
            {bump.checkboxLabel || 'Sim, eu quero!'}
          </div>
          <div style={{ fontSize: '12px', color: mutedColor }}>{bump.description}</div>
        </div>

        {/* Price */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {bump.compareAtPrice != null && (
            <div style={{ fontSize: '11px', color: mutedColor, textDecoration: 'line-through' }}>
              {formatBRL(bump.compareAtPrice)}
            </div>
          )}
          <div style={{ fontSize: '14px', fontWeight: 700, color: borderCol }}>
            {formatBRL(bump.priceInCents)}
          </div>
        </div>
      </div>
    </div>
  );
}
