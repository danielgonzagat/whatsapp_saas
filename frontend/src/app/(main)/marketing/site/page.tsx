'use client';

import { useRouter } from 'next/navigation';
import { useFlows, useFlowTemplates } from '@/hooks/useFlowsSWR';
import { Card } from '@/components/kloel/Card';
import { ToolCard } from '@/components/kloel/ToolCard';
import { PageTitle } from '@/components/kloel/PageTitle';
import { Lbl } from '@/components/kloel/Lbl';
import { Val } from '@/components/kloel/Val';
import { colors, typography, motion } from '@/lib/design-tokens';

export default function SitePage() {
  const router = useRouter();
  const { flows, isLoading: flowsLoading } = useFlows();
  const { templates, isLoading: templatesLoading } = useFlowTemplates();

  const isLoading = flowsLoading || templatesLoading;

  const pageFlows = (flows || []).filter(
    (f: any) => f.type === 'page' || f.type === 'landing' || f.type === 'site' || f.category === 'page',
  );
  const activePages = pageFlows.filter((f: any) => f.active || f.status === 'active').length;

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', background: colors.background.void }}>
        <div style={{width:20,height:20,border:'2px solid transparent',borderTopColor:'#E85D30',borderRadius:'50%',animation:'spin 1s linear infinite'}} />
      </div>
    );
  }

  return (
    <div style={{ padding: 32, position: 'relative', minHeight: '100vh', background: colors.background.void }}>
      
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 960 }}>
        <PageTitle
          title="Criacao de Paginas"
          sub="Crie landing pages, paginas de captura e funis com o Flow Builder"
          right={
            <button
              onClick={() => router.push('/flow')}
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
              Abrir Flow Builder
            </button>
          }
        />

        {/* Stat Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
          <Card>
            <Lbl>Paginas Criadas</Lbl>
            <Val size={28}>{pageFlows.length}</Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              de {(flows || []).length} fluxos totais
            </div>
          </Card>
          <Card>
            <Lbl>Paginas Ativas</Lbl>
            <Val size={28} color={colors.state.success}>{activePages}</Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              publicadas e online
            </div>
          </Card>
          <Card>
            <Lbl>Templates Disponiveis</Lbl>
            <Val size={28} color={colors.accent.gold}>{(templates || []).length}</Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              prontos para usar
            </div>
          </Card>
        </div>

        {/* Templates Grid */}
        <h2 style={{
          fontFamily: typography.fontFamily.display, fontSize: 16, fontWeight: 600,
          color: colors.text.starlight, marginBottom: 16,
        }}>
          Templates de Paginas
        </h2>

        {(templates || []).length === 0 ? (
          <Card>
            <div style={{ textAlign: 'center', padding: 32, position: 'relative' }}>
              
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ marginBottom: 12 }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={colors.text.dust} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto' }}>
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                    <line x1="9" y1="21" x2="9" y2="9" />
                  </svg>
                </div>
                <div style={{ fontFamily: typography.fontFamily.display, fontSize: 15, fontWeight: 600, color: colors.text.moonlight, marginBottom: 6 }}>
                  Nenhum template disponivel
                </div>
                <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 13, color: colors.text.dust, marginBottom: 16 }}>
                  Use o Flow Builder para criar paginas do zero ou aguarde novos templates.
                </div>
                <button
                  onClick={() => router.push('/flow')}
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
                  Abrir Flow Builder
                </button>
              </div>
            </div>
          </Card>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 32 }}>
            {(templates || []).map((t: any, i: number) => (
              <ToolCard
                key={t.id || t._id || i}
                icon={t.icon || '\u{1F4C4}'}
                title={t.name || t.title || `Template ${i + 1}`}
                desc={t.description || t.desc || 'Template de pagina'}
                badge={t.category || t.type || 'pagina'}
                onClick={() => router.push('/flow')}
              />
            ))}
          </div>
        )}

        {/* Existing Pages */}
        {pageFlows.length > 0 && (
          <>
            <h2 style={{
              fontFamily: typography.fontFamily.display, fontSize: 16, fontWeight: 600,
              color: colors.text.starlight, marginBottom: 16,
            }}>
              Suas Paginas
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pageFlows.map((f: any, i: number) => (
                <Card key={f.id || f._id || i} onClick={() => router.push('/flow')}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontFamily: typography.fontFamily.display, fontSize: 14, fontWeight: 600, color: colors.text.starlight }}>
                        {f.name || f.title || `Pagina ${i + 1}`}
                      </div>
                      <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 12, color: colors.text.dust, marginTop: 2 }}>
                        {f.type || 'Landing Page'} &middot; {f.createdAt ? new Date(f.createdAt).toLocaleDateString('pt-BR') : '--'}
                      </div>
                    </div>
                    <span style={{
                      padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      fontFamily: typography.fontFamily.display,
                      color: f.active || f.status === 'active' ? colors.state.success : colors.text.moonlight,
                      background: f.active || f.status === 'active' ? 'rgba(224, 221, 216, 0.1)' : 'rgba(255,255,255,0.04)',
                      textTransform: 'uppercase' as const, letterSpacing: '0.04em',
                    }}>
                      {f.active || f.status === 'active' ? 'online' : 'rascunho'}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
