'use client';

import type { Dispatch, SetStateAction } from 'react';
import { Mn, Pl } from '../../checkout-theme-shared';
import type { CheckoutVisualTheme } from '../../checkout-theme-tokens';
import { quantityButton } from './helpers';

export function QuantityControl({
  theme,
  qty,
  setQty,
  compact = false,
}: {
  theme: CheckoutVisualTheme;
  qty: number;
  setQty: Dispatch<SetStateAction<number>>;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: compact ? 'flex-start' : 'center',
        marginBottom: compact ? 0 : 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          background: theme.quantityBackground,
          borderRadius: 16,
          overflow: 'hidden',
        }}
      >
        <button
          type="button"
          onClick={() => setQty((value) => Math.max(1, value - 1))}
          style={quantityButton(theme)}
        >
          <Mn />
        </button>
        <span
          style={{
            padding: compact ? '8px 20px' : '10px 24px',
            fontSize: compact ? 16 : 17,
            fontWeight: 700,
            color: theme.quantityText,
          }}
        >
          {qty}
        </span>
        <button
          type="button"
          onClick={() => setQty((value) => value + 1)}
          style={quantityButton(theme)}
        >
          <Pl />
        </button>
      </div>
    </div>
  );
}
