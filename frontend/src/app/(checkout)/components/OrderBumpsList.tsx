'use client';

import OrderBumpCard, { type OrderBumpData } from './OrderBumpCard';

interface OrderBumpsListProps {
  bumps: OrderBumpData[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  accentColor?: string;
  cardBg?: string;
  mutedColor?: string;
  textColor?: string;
}

/**
 * Renders the seller-configured order bumps as selectable cards in the checkout
 * payment step. Returns null when there are no bumps so themes can drop it in
 * unconditionally. Selection is owned by the checkout hook (selectedIds/onToggle)
 * and the accepted ids flow into the order payload; the backend recomputes the
 * charge from those ids, so this is display + selection only.
 */
export function OrderBumpsList({
  bumps,
  selectedIds,
  onToggle,
  accentColor,
  cardBg,
  mutedColor,
  textColor,
}: OrderBumpsListProps) {
  if (!bumps || bumps.length === 0) {
    return null;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
      {bumps.map((bump) => (
        <OrderBumpCard
          key={bump.id}
          bump={bump}
          checked={selectedIds.includes(bump.id)}
          onToggle={onToggle}
          {...(accentColor !== undefined ? { accentColor } : {})}
          {...(cardBg !== undefined ? { cardBg } : {})}
          {...(mutedColor !== undefined ? { mutedColor } : {})}
          {...(textColor !== undefined ? { textColor } : {})}
        />
      ))}
    </div>
  );
}
