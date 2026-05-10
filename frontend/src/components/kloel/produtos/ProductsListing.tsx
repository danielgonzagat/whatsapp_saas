'use client';
import { kloelT } from '@/lib/i18n/t';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { useEffect, useRef, useState } from 'react';
import type { DisplayProduct } from './ProdutosView.types';
import {
  NP,
  Ticker,
  LiveFeed,
  SORA,
  MONO,
  EMBER,
  BG_CARD,
  BORDER,
  fmt,
  fmtBRL,
  timeAgo,
} from './ProdutosView.shared';
import { IC } from './ProdutosView.icons';
import ProductCardGrid from './ProductCardGrid';
import ProductActions from './ProductActions';
import ProductFilters from './ProductFilters';

export default function ProductsListing({
  displayProducts,
  totalRevenue,
  totalSales,
  activeProducts,
  onCreateProduct,
}: {
  displayProducts: DisplayProduct[];
  totalRevenue: number;
  totalSales: number;
  activeProducts: number;
  onCreateProduct?: () => void;
}) {
  const { isMobile } = useResponsiveViewport();
  const flashElRef = useRef<HTMLDivElement>(null);
  const revElRef = useRef<HTMLSpanElement>(null);
  const [search, setSearch] = useState('');

  const activePlanCount = displayProducts.reduce(
    (sum, product) => sum + Number(product.activePlansCount || 0), 0);
  const memberAreaCount = displayProducts.reduce(
    (sum, product) => sum + Number(product.memberAreasCount || 0), 0);
  const affiliateCount = displayProducts.reduce(
    (sum, product) => sum + Number(product.affiliateCount || 0), 0);
  const maxRevenue = Math.max(...displayProducts.map((p) => p.revenue || 0), 1);

  const filteredProducts = search
    ? displayProducts.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.category.toLowerCase().includes(search.toLowerCase()),
      )
    : displayProducts;

  const displayRevRef = useRef(totalRevenue);
  useEffect(() => {
    displayRevRef.current = totalRevenue;
    if (revElRef.current) revElRef.current.textContent = fmtBRL(totalRevenue);
  }, [totalRevenue]);

  const productEvents =
    displayProducts.length > 0
      ? displayProducts.slice(0, 4).map((product) => ({
          text:
            (product.totalSales ?? 0) > 0
              ? `${product.name} somou ${product.totalSales} vendas aprovadas.`
              : `${product.name} esta pronto para receber trafego e checkout.`,
          time: timeAgo(product.updatedAt || product.createdAt),
        }))
      : [{ text: 'Aguardando criacao do primeiro produto.', time: '' }];

  const hdr = isMobile ? { padding: '8px 0 24px', glowW: 150, glowH: 64, fz: 34, subFz: 11 }
    : { padding: '32px 0', glowW: 200, glowH: 80, fz: 80, subFz: 12 };

  return (
    <div style={{ opacity: 1 }}>
      <div style={{ position: 'relative', padding: hdr.padding, marginBottom: 24 }}>
        <div
          style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)', width: hdr.glowW, height: hdr.glowH,
            borderRadius: '50%', pointerEvents: 'none',
            background: `radial-gradient(ellipse,${EMBER}40,transparent 70%)`,
            animation: 'glow 3s ease-in-out',
          }}
        />
        <div
          style={{
            display: 'flex', flexDirection: isMobile ? 'column' : 'row',
            alignItems: 'center', justifyContent: 'center',
            gap: isMobile ? 16 : 0, textAlign: 'center', position: 'relative',
          }}
        >
          {!isMobile && onCreateProduct && (
            <div style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', zIndex: 2 }}>
              <ProductActions product={undefined} onCreateProduct={onCreateProduct} isMobile={false} />
            </div>
          )}
          <div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--app-text-tertiary)', letterSpacing: '0.25em', textTransform: 'uppercase' as const, marginBottom: hdr.subFz === 12 ? 4 : 4 }}>
              {kloelT('RECEITA TOTAL DOS SEUS PRODUTOS')}
            </div>
            <div
              ref={flashElRef}
              style={{
                fontFamily: MONO, fontSize: hdr.fz, fontWeight: 700, color: EMBER,
                letterSpacing: '-0.02em', textShadow: '0 0 20px rgba(232,93,48,0.3)',
                transition: 'text-shadow .3s', lineHeight: 1, wordBreak: 'break-word',
              }}
            >
              <span ref={revElRef}>{fmtBRL(totalRevenue)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 }}>
              <NP w={40} h={14} color={EMBER} />
              <span style={{ fontFamily: MONO, fontSize: hdr.subFz, color: EMBER }}>
                {activeProducts > 0
                  ? `${activeProducts}/${displayProducts.length} ativos`
                  : 'Ative seu primeiro produto'}
              </span>
            </div>
          </div>
          {isMobile && onCreateProduct && (
            <div style={{ width: '100%', maxWidth: 360 }}>
              <ProductActions product={undefined} onCreateProduct={onCreateProduct} isMobile={true} />
            </div>
          )}
        </div>
      </div>

      <Ticker
        items={
          displayProducts.length > 0
            ? displayProducts.map((p) =>
                p.hasPlanPricing ? `${p.name} \u00b7 ${p.priceLabel}` : `${p.name} \u00b7 sem planos configurados`)
            : ['Aguardando vendas...']
        }
        color={EMBER}
        duration="22s"
      />

      <ProductFilters search={search} onSearchChange={setSearch} />

      <ProductCardGrid
        displayProducts={filteredProducts}
        isMobile={isMobile}
        {...(onCreateProduct ? { onCreateProduct } : {})}
      />

      {displayProducts.length > 0 && (
        <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 16, marginBottom: 16 }}>
          <div style={{ fontFamily: SORA, fontSize: 10, fontWeight: 600, color: 'var(--app-text-tertiary)', letterSpacing: '0.25em', textTransform: 'uppercase' as const, marginBottom: 12 }}>
            {kloelT('Receita por Produto')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {displayProducts.map((p) => {
              const pct = ((p.revenue || 0) / maxRevenue) * 100;
              return (
                <div key={p.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--app-text-primary)' }}>
                      {p.name}
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: EMBER }}>
                      {fmtBRL(p.revenue || 0)}
                    </span>
                  </div>
                  <div style={{ height: 6, background: 'var(--app-bg-surface)', borderRadius: 3 }}>
                    <div
                      style={{
                        height: '100%', width: `${pct}%`,
                        background: `linear-gradient(90deg,${EMBER},${SORA}80)`,
                        borderRadius: 3, transition: 'width .4s',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {displayProducts.length > 0 && (
        <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 16, marginBottom: 16 }}>
          <div style={{ fontFamily: SORA, fontSize: 10, fontWeight: 600, color: 'var(--app-text-tertiary)', letterSpacing: '0.25em', textTransform: 'uppercase' as const, marginBottom: 12 }}>
            {kloelT('Saude operacional')}
          </div>
          {([
            { label: 'Produtos ativos', count: activeProducts, icon: IC.box },
            { label: 'Checkouts ativos', count: activePlanCount, icon: IC.store },
            { label: 'Areas vinculadas', count: memberAreaCount, icon: IC.trend },
            { label: 'Afiliados ativos', count: affiliateCount, icon: IC.zap },
          ] as const).map((m) => {
            const denom = Math.max(
              activeProducts || 0, activePlanCount || 0,
              memberAreaCount || 0, affiliateCount || 0, 1);
            const pct = Math.min(((m.count || 0) / denom) * 100, 100);
            return (
              <div key={m.label} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: MONO, fontSize: 11, color: 'var(--app-text-secondary)' }}>
                    <span style={{ color: EMBER }}>{m.icon(14)}</span>
                    {m.label}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: EMBER }}>{fmt(m.count || 0)}</span>
                </div>
                <div style={{ height: 4, background: 'var(--app-bg-surface)', borderRadius: 2 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: EMBER, borderRadius: 2, transition: 'width .5s' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{ color: EMBER }}>{IC.zap(18)}</span>
            <span style={{ fontFamily: SORA, fontSize: 10, fontWeight: 600, color: 'var(--app-text-tertiary)', letterSpacing: '0.25em', textTransform: 'uppercase' as const }}>
              {kloelT('MOTOR IA')}
            </span>
          </div>
          <p style={{ fontFamily: MONO, fontSize: 12, color: 'var(--app-text-secondary)', lineHeight: 1.6, margin: 0 }}>
            {displayProducts.length > 0
              ? kloelT(`${displayProducts.length} produtos no motor, ${activePlanCount} checkouts e ${affiliateCount} afiliados \u2014 IA operando na jornada de compra.`)
              : kloelT('Crie produtos para ativar o motor de IA e impulsionar suas vendas.')}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Receita', value: fmtBRL(totalRevenue), sub: `${displayProducts.length} produtos no catalogo`, icon: IC.box },
          { label: 'Vendas', value: String(totalSales), sub: `${activePlanCount} checkout${activePlanCount === 1 ? '' : 's'} ativo${activePlanCount === 1 ? '' : 's'}`, icon: IC.store },
          { label: 'Ativos', value: String(activeProducts), sub: `${memberAreaCount} areas de membros`, icon: IC.zap },
        ].map((s) => (
          <div key={s.label} style={{ flex: 1, background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <span style={{ color: EMBER }}>{s.icon(18)}</span>
              <span style={{ fontFamily: SORA, fontSize: 10, fontWeight: 600, color: 'var(--app-text-tertiary)', letterSpacing: '0.25em', textTransform: 'uppercase' as const }}>{s.label}</span>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 600, color: 'var(--app-text-primary)' }}>{s.value}</div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: EMBER, marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 20 }}>
        <div style={{ fontFamily: SORA, fontSize: 10, fontWeight: 600, color: 'var(--app-text-tertiary)', marginBottom: 10, letterSpacing: '0.25em', textTransform: 'uppercase' as const }}>
          {kloelT('Feed ao Vivo')}
        </div>
        <LiveFeed color={EMBER} events={productEvents} />
      </div>
    </div>
  );
}
