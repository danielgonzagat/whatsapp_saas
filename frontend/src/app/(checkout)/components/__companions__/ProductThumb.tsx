import { kloelT } from '@/lib/i18n/t';
import { UI } from '@/lib/ui-tokens';
import Image from 'next/image';
import type { CheckoutVisualTheme } from '../checkout-theme-tokens';

export function ProductThumb({
  productImage,
  productName,
  size,
  theme,
}: {
  productImage: string | null;
  productName: string;
  size: number;
  theme: Pick<CheckoutVisualTheme, 'mutedCardBackground' | 'mutedText'>;
}) {
  if (productImage) {
    return (
      <Image
        src={productImage}
        alt={productName}
        unoptimized
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          borderRadius: UI.radiusMd,
          objectFit: 'cover',
          display: 'block',
          flexShrink: 0,
          background: theme.mutedCardBackground,
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: UI.radiusMd,
        background: theme.mutedCardBackground,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: theme.mutedText,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}
    >
      {kloelT(`Produto`)}
    </div>
  );
}
