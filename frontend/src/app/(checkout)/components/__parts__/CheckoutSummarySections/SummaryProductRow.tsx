'use client';

import Image from 'next/image';
import type { CheckoutVisualTheme } from '../../checkout-theme-tokens';

export function SummaryProductRow({
  theme,
  productImage,
  productName,
  unitPriceInCents,
  fmtBrl,
}: {
  theme: CheckoutVisualTheme;
  productImage?: string;
  productName: string;
  unitPriceInCents: number;
  fmtBrl: (value: number) => string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
      {productImage ? (
        <Image
          src={productImage}
          alt={productName}
          width={72}
          height={72}
          unoptimized
          style={{
            width: 72,
            height: 72,
            objectFit: 'cover',
            borderRadius: 8,
            border: `1px solid ${theme.cardBorder}`,
            flexShrink: 0,
          }}
        />
      ) : (
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 8,
            background: theme.summaryBackground,
            border: `1px solid ${theme.cardBorder}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontSize: 22,
            fontWeight: 700,
            color: theme.mutedText,
          }}
        >
          {productName.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 400,
            color: theme.mutedText,
            lineHeight: 1.4,
            marginBottom: 4,
          }}
        >
          {productName}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>
          {fmtBrl(unitPriceInCents)}
        </div>
      </div>
    </div>
  );
}
