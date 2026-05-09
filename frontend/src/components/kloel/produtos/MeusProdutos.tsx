'use client';

import { kloelT } from '@/lib/i18n/t';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';

import type { DisplayProduct } from './ProdutosView.types';
import { SORA, BG_CARD, BORDER, EMBER, Ticker, timeAgo } from './ProdutosView.shared';
import { IC } from './ProdutosView.icons';
import MeusProdutosRevenueHero from './MeusProdutosRevenueHero';
import MeusProdutosProductCard from './MeusProdutosProductCard';
import MeusProdutosDashboard from './MeusProdutosDashboard';

export default function MeusProdutos({
  displayProducts,
  totalRevenue,
  totalSales,
  activeProducts,
  onDeleteProduct,
  onCreateProduct,
  requestedFeature,
}: {
  displayProducts: DisplayProduct[];
  totalRevenue: number;
  totalSales: number;
  activeProducts: number;
  onDeleteProduct: (id: string) => void;
  onCreateProduct: () => void;
  requestedFeature?: string;
}) {
  const { isMobile } = useResponsiveViewport();

  const activePlanCount = displayProducts.reduce(
    (sum, product) => sum + Number(product.activePlansCount || 0),
    0,
  );
  const memberAreaCount = displayProducts.reduce(
    (sum, product) => sum + Number(product.memberAreasCount || 0),
    0,
  );
  const affiliateCount = displayProducts.reduce(
    (sum, product) => sum + Number(product.affiliateCount || 0),
    0,
  );

  const productEvents =
    displayProducts.length > 0
      ? displayProducts.slice(0, 4).map((product) => ({
          text:
            (product.totalSales ?? 0) > 0
              ? `${product.name} somou ${product.totalSales} vendas aprovadas.`
              : `${product.name} está pronto para receber tráfego e checkout.`,
          time: timeAgo(product.updatedAt || product.createdAt),
        }))
      : [{ text: 'Aguardando criação do primeiro produto.', time: '' }];

  return (
    <div style={{ opacity: 1 }}>
      <MeusProdutosRevenueHero
        totalRevenue={totalRevenue}
        activeProducts={activeProducts}
        totalProductCount={displayProducts.length}
        onCreateProduct={onCreateProduct}
        requestedFeature={requestedFeature}
      />

      <Ticker
        items={
          displayProducts.length > 0
            ? displayProducts.map((p) =>
                p.hasPlanPricing
                  ? `${p.name} · ${p.priceLabel}`
                  : `${p.name} · sem planos configurados`,
              )
            : ['Aguardando vendas...']
        }
        color={EMBER}
        duration="22s"
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '20px 0' }}>
        {displayProducts.length === 0 && (
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              background: BG_CARD,
              borderRadius: 6,
              border: `1px solid ${BORDER}`,
            }}
          >
            <span style={{ color: EMBER, display: 'block', marginBottom: 12 }}>{IC.box(32)}</span>
            <div
              style={{
                fontFamily: SORA,
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--app-text-primary)',
                marginBottom: 6,
              }}
            >
              {kloelT(`Nenhum produto cadastrado.`)}
            </div>
            <div
              style={{
                fontFamily: SORA,
                fontSize: 13,
                color: 'var(--app-text-secondary)',
                marginBottom: 16,
              }}
            >
              {requestedFeature
                ? 'Crie seu primeiro produto para liberar esta configuracao operacional.'
                : 'Crie seu primeiro produto para comecar a vender.'}
            </div>
            <button
              type="button"
              onClick={onCreateProduct}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 24px',
                background: EMBER,
                border: 'none',
                borderRadius: 6,
                color: '#fff',
                fontFamily: SORA,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <span style={{ color: '#fff' }}>{IC.plus(16)}</span>
              {requestedFeature ? 'Criar produto e continuar' : 'Criar produto'}
            </button>
          </div>
        )}
        {displayProducts.map((p) => (
          <MeusProdutosProductCard
            key={p.id}
            product={p}
            isMobile={isMobile}
            onDelete={onDeleteProduct}
          />
        ))}
      </div>

      <MeusProdutosDashboard
        displayProducts={displayProducts}
        totalRevenue={totalRevenue}
        totalSales={totalSales}
        activeProducts={activeProducts}
        activePlanCount={activePlanCount}
        memberAreaCount={memberAreaCount}
        affiliateCount={affiliateCount}
        productEvents={productEvents}
      />
    </div>
  );
}
