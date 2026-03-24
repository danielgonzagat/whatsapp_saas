'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMarketplaceTemplates } from '@/hooks/useMarketplace';
import { useProducts } from '@/hooks/useProducts';
import { Card } from '@/components/kloel/Card';
import { PageTitle } from '@/components/kloel/PageTitle';
import { Lbl } from '@/components/kloel/Lbl';
import { Val } from '@/components/kloel/Val';
import { OrbitalLoader } from '@/components/kloel/cosmos/OrbitalLoader';
import { StarField } from '@/components/kloel/cosmos/StarField';
import { colors, typography, motion } from '@/lib/design-tokens';

export default function AfiliarSePage() {
  const router = useRouter();
  const { templates, isLoading: templatesLoading } = useMarketplaceTemplates();
  const { products, isLoading: productsLoading } = useProducts();
  const [requesting, setRequesting] = useState<string | null>(null);

  const isLoading = templatesLoading || productsLoading;

  // Products available for affiliation (from marketplace or products marked as affiliate-ready)
  const affiliateProducts = [
    ...(templates || []).map((t: any) => ({ ...t, source: 'marketplace' })),
    ...(products || []).filter((p: any) => p.affiliateEnabled || p.allowAffiliates).map((p: any) => ({ ...p, source: 'products' })),
  ];

  const handleRequestAffiliation = async (productId: string) => {
    setRequesting(productId);
    // Placeholder: in production would call affiliate request API
    setTimeout(() => setRequesting(null), 1500);
  };

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
          title="Afiliar-se — Marketplace"
          sub="Encontre produtos para promover e ganhe comissoes por cada venda"
        />

        {/* Stat Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
          <Card>
            <Lbl>Produtos Disponiveis</Lbl>
            <Val size={28}>{affiliateProducts.length}</Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              no marketplace
            </div>
          </Card>
          <Card>
            <Lbl>Templates</Lbl>
            <Val size={28} color={colors.accent.webb}>{(templates || []).length}</Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              templates de afiliacao
            </div>
          </Card>
          <Card>
            <Lbl>Comissao Media</Lbl>
            <Val size={28} color={colors.accent.gold}>
              {affiliateProducts.length > 0
                ? Math.round(
                    affiliateProducts.reduce((sum: number, p: any) => sum + (p.commission || p.affiliateCommission || 30), 0) /
                    affiliateProducts.length,
                  )
                : 0}%
            </Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              dos produtos listados
            </div>
          </Card>
        </div>

        {/* Products Grid */}
        <h2 style={{
          fontFamily: typography.fontFamily.display, fontSize: 16, fontWeight: 600,
          color: colors.text.starlight, marginBottom: 16,
        }}>
          Produtos para Afiliacao
        </h2>

        {affiliateProducts.length === 0 ? (
          <Card>
            <div style={{ textAlign: 'center', padding: 32, position: 'relative' }}>
              <StarField density={20} />
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ marginBottom: 12 }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={colors.text.dust} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto' }}>
                    <circle cx="9" cy="21" r="1" />
                    <circle cx="20" cy="21" r="1" />
                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                  </svg>
                </div>
                <div style={{ fontFamily: typography.fontFamily.display, fontSize: 15, fontWeight: 600, color: colors.text.moonlight, marginBottom: 6 }}>
                  Nenhum produto disponivel para afiliacao
                </div>
                <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 13, color: colors.text.dust }}>
                  Em breve novos produtos estarao disponiveis no marketplace. Volte depois para conferir.
                </div>
              </div>
            </div>
          </Card>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            {affiliateProducts.map((p: any, i: number) => {
              const productId = p.id || p._id || String(i);
              const commission = p.commission || p.affiliateCommission || 30;
              return (
                <Card key={productId}>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <div style={{ fontFamily: typography.fontFamily.display, fontSize: 15, fontWeight: 600, color: colors.text.starlight, flex: 1 }}>
                        {p.name || p.title || `Produto ${i + 1}`}
                      </div>
                      <span style={{
                        padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                        fontFamily: typography.fontFamily.display,
                        color: colors.accent.gold, background: 'rgba(201, 168, 76, 0.12)',
                        whiteSpace: 'nowrap' as const, marginLeft: 8,
                      }}>
                        {commission}% comissao
                      </span>
                    </div>
                    <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 12, color: colors.text.dust, lineHeight: 1.4 }}>
                      {p.description || p.desc || 'Produto disponivel para afiliacao'}
                    </div>
                  </div>

                  {p.price && (
                    <div style={{ fontFamily: typography.fontFamily.display, fontSize: 14, fontWeight: 600, color: colors.text.moonlight, marginBottom: 12 }}>
                      R$ {Number(p.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                  )}

                  <button
                    onClick={() => handleRequestAffiliation(productId)}
                    disabled={requesting === productId}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      background: requesting === productId ? 'rgba(78, 122, 224, 0.15)' : 'rgba(78, 122, 224, 0.08)',
                      border: `1px solid ${colors.border.space}`,
                      borderRadius: 8,
                      color: colors.accent.webb,
                      fontFamily: typography.fontFamily.display,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: requesting === productId ? 'wait' : 'pointer',
                      transition: `all ${motion.duration.normal} ${motion.easing.gravity}`,
                      opacity: requesting === productId ? 0.7 : 1,
                    }}
                  >
                    {requesting === productId ? 'Solicitando...' : 'Solicitar afiliacao'}
                  </button>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
