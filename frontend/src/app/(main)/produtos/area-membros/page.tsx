'use client';

import { useRouter } from 'next/navigation';
import { useProducts } from '@/hooks/useProducts';
import { Card } from '@/components/kloel/Card';
import { PageTitle } from '@/components/kloel/PageTitle';
import { Lbl } from '@/components/kloel/Lbl';
import { Val } from '@/components/kloel/Val';
import { Metric } from '@/components/kloel/Metric';
import { colors, typography, motion } from '@/lib/design-tokens';

export default function AreaMembrosPage() {
  const router = useRouter();
  const { products, isLoading } = useProducts();

  const memberProducts = (products || []).filter(
    (p: any) =>
      p.type === 'subscription' ||
      p.type === 'digital' ||
      p.type === 'membership' ||
      p.type === 'course' ||
      p.format === 'DIGITAL' ||
      p.format === 'SUBSCRIPTION' ||
      p.hasMembers ||
      p.memberArea,
  );

  const activeProducts = memberProducts.filter(
    (p: any) => p.active !== false && p.status !== 'inactive' && p.status !== 'archived',
  ).length;

  const totalMembers = memberProducts.reduce(
    (sum: number, p: any) => sum + (p.activeMembers || p.membersCount || p.subscribers || 0),
    0,
  );

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', background: colors.background.void }}>
        <div style={{ width: 36, height: 36, border: '2px solid #6E6E73', borderTop: '2px solid #E0DDD8', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ padding: 32, position: 'relative', minHeight: '100vh', background: colors.background.void }}>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 960 }}>
        <PageTitle
          title="Area de Membros"
          sub="Gerencie seus produtos digitais e areas de membros"
          right={
            <button
              onClick={() => router.push('/products')}
              style={{
                padding: '10px 20px',
                background: colors.accent.webb,
                border: 'none',
                borderRadius: 6,
                color: '#fff',
                fontFamily: typography.fontFamily.display,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: `all ${motion.duration.normal} ${motion.easing.gravity}`,
              }}
            >
              Criar produto digital
            </button>
          }
        />

        {/* Stat Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
          <Card>
            <Lbl>Produtos com Area de Membros</Lbl>
            <Val size={28}>{memberProducts.length}</Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              de {(products || []).length} totais
            </div>
          </Card>
          <Card>
            <Lbl>Produtos Ativos</Lbl>
            <Val size={28} color={colors.state.success}>{activeProducts}</Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              recebendo novos membros
            </div>
          </Card>
          <Card>
            <Lbl>Membros Ativos</Lbl>
            <Val size={28} color={colors.accent.gold}>{totalMembers}</Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              total em todos os produtos
            </div>
          </Card>
        </div>

        {/* Products Grid */}
        <h2 style={{
          fontFamily: typography.fontFamily.display, fontSize: 16, fontWeight: 600,
          color: colors.text.starlight, marginBottom: 16,
        }}>
          Seus Produtos Digitais
        </h2>

        {memberProducts.length === 0 ? (
          <Card>
            <div style={{ textAlign: 'center', padding: 32, position: 'relative' }}>

              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ marginBottom: 12 }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={colors.text.dust} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto' }}>
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <div style={{ fontFamily: typography.fontFamily.display, fontSize: 15, fontWeight: 600, color: colors.text.moonlight, marginBottom: 6 }}>
                  Nenhum produto com area de membros
                </div>
                <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 13, color: colors.text.dust, marginBottom: 16 }}>
                  Crie um produto digital com area de membros para oferecer conteudo exclusivo aos seus clientes.
                </div>
                <button
                  onClick={() => router.push('/products')}
                  style={{
                    padding: '10px 24px',
                    background: 'rgba(232, 93, 48, 0.08)',
                    border: `1px solid ${colors.border.space}`,
                    borderRadius: 6,
                    color: colors.accent.webb,
                    fontFamily: typography.fontFamily.display,
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    transition: `all ${motion.duration.normal} ${motion.easing.gravity}`,
                  }}
                >
                  Criar produto digital
                </button>
              </div>
            </div>
          </Card>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            {memberProducts.map((p: any, i: number) => (
              <Card key={p.id || p._id || i} onClick={() => router.push('/products')}>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontFamily: typography.fontFamily.display, fontSize: 15, fontWeight: 600, color: colors.text.starlight }}>
                    {p.name || p.title || `Produto ${i + 1}`}
                  </div>
                  <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 12, color: colors.text.dust, marginTop: 2 }}>
                    {p.type || p.format || 'Digital'} &middot; {p.createdAt ? new Date(p.createdAt).toLocaleDateString('pt-BR') : '--'}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: 'rgba(232, 93, 48, 0.08)', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colors.accent.webb} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                      </svg>
                    </div>
                    <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 13, color: colors.text.moonlight }}>
                      {p.activeMembers || p.membersCount || p.subscribers || 0} membros
                    </div>
                  </div>
                  <span style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                    fontFamily: typography.fontFamily.display,
                    color: p.active !== false && p.status !== 'inactive' ? colors.state.success : colors.text.moonlight,
                    background: p.active !== false && p.status !== 'inactive' ? 'rgba(224, 221, 216, 0.1)' : 'rgba(255,255,255,0.04)',
                    textTransform: 'uppercase' as const, letterSpacing: '0.04em',
                  }}>
                    {p.active !== false && p.status !== 'inactive' ? 'ativo' : 'inativo'}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
