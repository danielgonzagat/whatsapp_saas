'use client';

import { useRouter } from 'next/navigation';
import { useProducts } from '@/hooks/useProducts';
import { Card } from '@/components/kloel/Card';
import { PageTitle } from '@/components/kloel/PageTitle';
import { Lbl } from '@/components/kloel/Lbl';
import { Val } from '@/components/kloel/Val';
import { Metric } from '@/components/kloel/Metric';
import { OrbitalLoader } from '@/components/kloel/cosmos/OrbitalLoader';
import { StarField } from '@/components/kloel/cosmos/StarField';
import { colors, typography, motion } from '@/lib/design-tokens';

export default function FisicosPage() {
  const router = useRouter();
  const { products, isLoading } = useProducts();

  const physicalProducts = (products || []).filter(
    (p: any) =>
      p.format === 'PHYSICAL' ||
      p.format === 'HYBRID' ||
      p.type === 'physical' ||
      p.type === 'hybrid' ||
      p.requiresShipping ||
      p.hasStock,
  );

  const activeProducts = physicalProducts.filter(
    (p: any) => p.active !== false && p.status !== 'inactive' && p.status !== 'archived',
  ).length;

  const totalStock = physicalProducts.reduce(
    (sum: number, p: any) => sum + (p.stock || p.quantity || p.inventory || 0),
    0,
  );

  const lowStockCount = physicalProducts.filter(
    (p: any) => (p.stock || p.quantity || p.inventory || 0) > 0 && (p.stock || p.quantity || p.inventory || 0) <= (p.lowStockThreshold || 5),
  ).length;

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', background: colors.background.void }}>
        <OrbitalLoader size={36} />
      </div>
    );
  }

  return (
    <div style={{ padding: 32, position: 'relative', minHeight: '100vh', background: colors.background.void }}>
      <StarField density={35} />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 960 }}>
        <PageTitle
          title="Gestao de Produtos Fisicos"
          sub="Gerencie estoque, envios e produtos fisicos ou hibridos"
          right={
            <button
              onClick={() => router.push('/products')}
              style={{
                padding: '10px 20px',
                background: colors.accent.webb,
                border: 'none',
                borderRadius: 10,
                color: '#fff',
                fontFamily: typography.fontFamily.display,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: `all ${motion.duration.normal} ${motion.easing.gravity}`,
              }}
            >
              Adicionar produto
            </button>
          }
        />

        {/* Stat Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
          <Card>
            <Lbl>Produtos Fisicos</Lbl>
            <Val size={28}>{physicalProducts.length}</Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              {activeProducts} ativos
            </div>
          </Card>
          <Card>
            <Lbl>Estoque Total</Lbl>
            <Val size={28} color={colors.accent.webb}>{totalStock.toLocaleString('pt-BR')}</Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              unidades disponiveis
            </div>
          </Card>
          <Card>
            <Lbl>Estoque Baixo</Lbl>
            <Val size={28} color={lowStockCount > 0 ? colors.state.warning : colors.state.success}>{lowStockCount}</Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              {lowStockCount > 0 ? 'produtos precisam reposicao' : 'tudo em ordem'}
            </div>
          </Card>
        </div>

        {/* Products Grid */}
        <h2 style={{
          fontFamily: typography.fontFamily.display, fontSize: 16, fontWeight: 600,
          color: colors.text.starlight, marginBottom: 16,
        }}>
          Inventario
        </h2>

        {physicalProducts.length === 0 ? (
          <Card>
            <div style={{ textAlign: 'center', padding: 32, position: 'relative' }}>
              <StarField density={20} />
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ marginBottom: 12 }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={colors.text.dust} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto' }}>
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                    <line x1="12" y1="22.08" x2="12" y2="12" />
                  </svg>
                </div>
                <div style={{ fontFamily: typography.fontFamily.display, fontSize: 15, fontWeight: 600, color: colors.text.moonlight, marginBottom: 6 }}>
                  Nenhum produto fisico cadastrado
                </div>
                <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 13, color: colors.text.dust, marginBottom: 16 }}>
                  Adicione produtos fisicos para gerenciar estoque e logistica de envio.
                </div>
                <button
                  onClick={() => router.push('/products')}
                  style={{
                    padding: '10px 24px',
                    background: 'rgba(78, 122, 224, 0.08)',
                    border: `1px solid ${colors.border.space}`,
                    borderRadius: 10,
                    color: colors.accent.webb,
                    fontFamily: typography.fontFamily.display,
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    transition: `all ${motion.duration.normal} ${motion.easing.gravity}`,
                  }}
                >
                  Adicionar produto
                </button>
              </div>
            </div>
          </Card>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            {physicalProducts.map((p: any, i: number) => {
              const stock = p.stock || p.quantity || p.inventory || 0;
              const isLowStock = stock > 0 && stock <= (p.lowStockThreshold || 5);
              const shippingStatus = p.shippingEnabled ? 'envio ativo' : 'sem envio';

              return (
                <Card key={p.id || p._id || i} onClick={() => router.push('/products')}>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ fontFamily: typography.fontFamily.display, fontSize: 15, fontWeight: 600, color: colors.text.starlight }}>
                        {p.name || p.title || `Produto ${i + 1}`}
                      </div>
                      <span style={{
                        padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                        fontFamily: typography.fontFamily.display, textTransform: 'uppercase' as const,
                        color: p.format === 'HYBRID' || p.type === 'hybrid' ? colors.accent.nebula : colors.accent.webb,
                        background: p.format === 'HYBRID' || p.type === 'hybrid' ? 'rgba(123, 94, 167, 0.1)' : 'rgba(78, 122, 224, 0.08)',
                      }}>
                        {p.format || p.type || 'fisico'}
                      </span>
                    </div>
                  </div>

                  <Metric
                    label="Estoque"
                    value={`${stock} un.`}
                    color={isLowStock ? colors.state.warning : stock === 0 ? colors.state.error : colors.text.starlight}
                  />
                  <Metric label="Envio" value={shippingStatus} />
                  {p.price && (
                    <Metric
                      label="Preco"
                      value={`R$ ${Number(p.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                    />
                  )}

                  {isLowStock && (
                    <div style={{
                      marginTop: 10, padding: '6px 10px', borderRadius: 6,
                      background: 'rgba(224, 168, 78, 0.08)', border: '1px solid rgba(224, 168, 78, 0.2)',
                      fontFamily: typography.fontFamily.sans, fontSize: 11, color: colors.state.warning,
                    }}>
                      Estoque baixo - considere reabastecer
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
