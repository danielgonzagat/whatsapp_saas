'use client';
import { colors } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';
import { IconActionButton } from '@/components/kloel/products/product-nerve-center.shared';
import { useRouter } from 'next/navigation';
import {
  SORA,
  EMBER,
} from './ProdutosView.shared';
import { IC } from './ProdutosView.icons';
import type { DisplayProduct } from './ProdutosView.types';

export default function ProductActions({
  product,
  onCreateProduct,
  isMobile,
}: {
  product: DisplayProduct | undefined | null;
  onCreateProduct: (() => void) | undefined | null;
  isMobile: boolean;
}) {
  const router = useRouter();

  if (onCreateProduct != null && product == null) {
    return (
      <div style={isMobile ? { width: '100%', maxWidth: 360 } : {}}>
        <button
          type="button"
          onClick={onCreateProduct}
          style={{
            width: isMobile ? '100%' : undefined,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: isMobile ? '12px 18px' : '10px 20px',
            background: EMBER,
            border: 'none',
            borderRadius: isMobile ? 12 : 10,
            color: colors.text.silver,
            fontFamily: SORA,
            fontSize: 13,
            fontWeight: isMobile ? 700 : 600,
            cursor: 'pointer',
            boxShadow: `0 18px 32px rgba(232,93,48,${isMobile ? '0.16' : '0.18'})`,
          }}
        >
          <span style={{ color: colors.text.silver }}>{IC.plus(16)}</span>
          {kloelT('Novo produto')}
        </button>
      </div>
    );
  }

  if (product == null) {
    return null;
  }

  return (
    <div>
      <IconActionButton
        label={kloelT('Editar')}
        color={EMBER}
        onClick={() => router.push(`/products/${product.id}`)}
      >
        <svg
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d={kloelT('M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z')} />
          <path d={kloelT('m15 5 4 4')} />
        </svg>
      </IconActionButton>
    </div>
  );
}
