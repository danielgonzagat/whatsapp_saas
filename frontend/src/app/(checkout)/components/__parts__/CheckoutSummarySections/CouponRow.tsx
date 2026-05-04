'use client';

import { kloelT } from '@/lib/i18n/t';
import { useId, type Dispatch, type SetStateAction } from 'react';
import { Tag } from '../../checkout-theme-shared';
import type { CheckoutVisualTheme } from '../../checkout-theme-tokens';

export function CouponRow({
  theme,
  couponCode,
  setCouponCode,
  onApplyCoupon,
}: {
  theme: CheckoutVisualTheme;
  couponCode: string;
  setCouponCode: Dispatch<SetStateAction<string>>;
  onApplyCoupon: () => void;
}) {
  const couponId = useId();

  return (
    <>
      <div style={{ fontSize: 15, fontWeight: 600, color: theme.text, marginBottom: 10 }}>
        {kloelT(`Tem um cupom?`)}
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
        <label className="sr-only" htmlFor={couponId}>
          {kloelT('Código do cupom')}
        </label>
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 14px',
            border: `1px solid ${theme.cardBorder}`,
            borderRadius: 16,
            background: theme.cardBackground,
            minWidth: 0,
          }}
        >
          <Tag stroke={theme.input.tagStroke} />
          <input
            id={couponId}
            value={couponCode}
            onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
            placeholder={kloelT(`Código do cupom`)}
            style={{
              flex: 1,
              padding: '12px 0',
              border: 'none',
              fontSize: 14,
              outline: 'none',
              background: 'transparent',
              color: theme.text,
              fontFamily: "'DM Sans', sans-serif",
              minWidth: 0,
            }}
          />
        </div>
        <button
          type="button"
          onClick={onApplyCoupon}
          style={{
            background: 'none',
            border: 'none',
            color: theme.accent,
            fontSize: 15,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {kloelT(`Adicionar`)}
        </button>
      </div>
    </>
  );
}
