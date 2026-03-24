'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProducts } from '@/hooks/useProducts';
import { useAnalyticsDashboard } from '@/hooks/useAnalytics';
import { Card } from '@/components/kloel/Card';
import { PageTitle } from '@/components/kloel/PageTitle';
import { Lbl } from '@/components/kloel/Lbl';
import { Val } from '@/components/kloel/Val';
import { Metric } from '@/components/kloel/Metric';
import { OrbitalLoader } from '@/components/kloel/cosmos/OrbitalLoader';
import { StarField } from '@/components/kloel/cosmos/StarField';
import { colors, typography, motion } from '@/lib/design-tokens';

export default function AfiliadosPage() {
  const router = useRouter();
  const { products, isLoading: prodLoading } = useProducts();
  const { dashboard, isLoading: dashLoading } = useAnalyticsDashboard();
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const isLoading = prodLoading || dashLoading;
  const dash = dashboard as any;

  const affiliateProducts = (products || []).filter((p: any) => p.affiliateEnabled || p.allowAffiliates);
  const allProducts = products || [];

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', background: colors.background.void }}>
        <OrbitalLoader size={36} />
      </div>
    );
  }

  const handleCopyLink = (productId: string) => {
    const link = `${window.location.origin}/pay/${productId}?ref=affiliate`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(productId);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <div style={{ padding: 32, position: 'relative', minHeight: '100vh', background: colors.background.void }}>
      <StarField density={30} />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 960 }}>
        <button
          onClick={() => router.push('/parcerias')}
          style={{
            background: 'none',
            border: 'none',
            color: colors.accent.webb,
            fontFamily: typography.fontFamily.sans,
            fontSize: 12,
            cursor: 'pointer',
            padding: 0,
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          &#8592; Voltar para Parcerias
        </button>

        <PageTitle
          title="Programa de Afiliados"
          sub="Gerencie afiliados e acompanhe comissoes"
        />

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
          <Card>
            <Lbl>Afiliados Ativos</Lbl>
            <Val size={24} color={colors.accent.webb}>{dash?.affiliates ?? 0}</Val>
          </Card>
          <Card>
            <Lbl>Vendas via Afiliados</Lbl>
            <Val size={24} color={colors.state.success}>{dash?.affiliateSales ?? 0}</Val>
          </Card>
          <Card>
            <Lbl>Comissoes Pagas</Lbl>
            <Val size={24} color={colors.accent.gold}>
              R$ {(dash?.affiliateCommissions ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </Val>
          </Card>
          <Card>
            <Lbl>Comissoes Pendentes</Lbl>
            <Val size={24}>{dash?.pendingCommissions ?? 0}</Val>
          </Card>
        </div>

        {/* Products with affiliate */}
        <h2 style={{
          fontFamily: typography.fontFamily.display,
          fontSize: 16,
          fontWeight: 600,
          color: colors.text.starlight,
          marginBottom: 16,
        }}>
          Produtos para Afiliacao
        </h2>

        <div style={{ marginBottom: 20 }}>
          <input
            type="text"
            placeholder="Buscar produto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              maxWidth: 400,
              padding: '10px 16px 10px 38px',
              background: colors.background.nebula,
              border: `1px solid ${colors.border.space}`,
              borderRadius: 10,
              color: colors.text.starlight,
              fontFamily: typography.fontFamily.sans,
              fontSize: 14,
              outline: 'none',
            }}
          />
        </div>

        {allProducts.length === 0 ? (
          <Card>
            <div style={{ textAlign: 'center', padding: 32, color: colors.text.dust, fontFamily: typography.fontFamily.sans, fontSize: 14 }}>
              Nenhum produto cadastrado. Crie um produto para habilitar o programa de afiliados.
            </div>
          </Card>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            {allProducts
              .filter((p: any) => {
                if (!search) return true;
                return (p.name || '').toLowerCase().includes(search.toLowerCase());
              })
              .map((product: any, i: number) => (
                <Card key={product.id || product._id || i} style={{ padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontFamily: typography.fontFamily.display, fontSize: 15, fontWeight: 600, color: colors.text.starlight }}>
                        {product.name || `Produto ${i + 1}`}
                      </div>
                      <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 12, color: colors.text.dust, marginTop: 2 }}>
                        {product.category || 'Sem categoria'}
                      </div>
                    </div>
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 600,
                      fontFamily: typography.fontFamily.display,
                      color: product.affiliateEnabled || product.allowAffiliates ? colors.state.success : colors.text.dust,
                      background: product.affiliateEnabled || product.allowAffiliates ? 'rgba(45, 212, 160, 0.1)' : 'rgba(255,255,255,0.04)',
                    }}>
                      {product.affiliateEnabled || product.allowAffiliates ? 'Afiliacao Ativa' : 'Sem Afiliacao'}
                    </span>
                  </div>

                  <Metric
                    label="Comissao"
                    value={product.commissionRate ? `${product.commissionRate}%` : product.commission || '--'}
                    color={colors.accent.gold}
                  />
                  <Metric
                    label="Preco"
                    value={product.price ? `R$ ${Number(product.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '--'}
                  />

                  <button
                    onClick={() => handleCopyLink(product.id || product._id)}
                    style={{
                      marginTop: 12,
                      width: '100%',
                      padding: '8px 16px',
                      background: copied === (product.id || product._id) ? 'rgba(45, 212, 160, 0.1)' : 'rgba(78, 122, 224, 0.08)',
                      border: `1px solid ${copied === (product.id || product._id) ? colors.state.success : colors.border.space}`,
                      borderRadius: 8,
                      color: copied === (product.id || product._id) ? colors.state.success : colors.accent.webb,
                      fontFamily: typography.fontFamily.display,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: `all ${motion.duration.normal} ${motion.easing.gravity}`,
                    }}
                  >
                    {copied === (product.id || product._id) ? 'Link Copiado!' : 'Copiar Link de Afiliado'}
                  </button>
                </Card>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
