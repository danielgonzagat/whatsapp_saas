'use client';

import { useRouter } from 'next/navigation';
import { useCampaigns } from '@/hooks/useCampaigns';
import { Card } from '@/components/kloel/Card';
import { PageTitle } from '@/components/kloel/PageTitle';
import { Lbl } from '@/components/kloel/Lbl';
import { Val } from '@/components/kloel/Val';
import { colors, typography, motion } from '@/lib/design-tokens';

export default function TikTokPage() {
  const router = useRouter();
  const { campaigns, total, isLoading, error } = useCampaigns();

  const tiktokCampaigns = (campaigns || []).filter(
    (c: any) => c.type === 'tiktok' || c.channel === 'tiktok',
  );
  const activeTiktok = tiktokCampaigns.filter(
    (c: any) => c.status === 'active' || c.status === 'running',
  ).length;

  if (isLoading && !error) {
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
          title="TikTok — Automacao"
          sub="Automacao de engajamento e mensagens via TikTok"
          right={
            <button
              onClick={() => router.push('/campaigns')}
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
              Criar campanha TikTok
            </button>
          }
        />

        {/* Stat Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
          <Card>
            <Lbl>Campanhas TikTok</Lbl>
            <Val size={28}>{tiktokCampaigns.length}</Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              de {total} totais
            </div>
          </Card>
          <Card>
            <Lbl>Ativas Agora</Lbl>
            <Val size={28} color={colors.state.success}>{activeTiktok}</Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              campanhas rodando
            </div>
          </Card>
          <Card>
            <Lbl>Interacoes</Lbl>
            <Val size={28} color={colors.accent.gold}>
              {tiktokCampaigns.reduce((sum: number, c: any) => sum + (c.sent || c.messagesSent || c.interactions || 0), 0)}
            </Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              via TikTok
            </div>
          </Card>
        </div>

        {/* Info Card */}
        <Card style={{ marginBottom: 32, background: 'rgba(232, 93, 48, 0.04)', border: `1px solid rgba(232, 93, 48, 0.15)` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 6,
              background: 'rgba(232, 93, 48, 0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, flexShrink: 0,
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.accent.webb} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </div>
            <div>
              <div style={{ fontFamily: typography.fontFamily.display, fontSize: 14, fontWeight: 600, color: colors.text.starlight, marginBottom: 4 }}>
                Integracao TikTok
              </div>
              <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 13, color: colors.text.moonlight, lineHeight: 1.5 }}>
                Conecte sua conta TikTok Business para automatizar respostas a comentarios,
                mensagens diretas e criar fluxos de captura de leads a partir dos seus videos.
                Use o motor de campanhas do Kloel para configurar suas automacoes.
              </div>
            </div>
          </div>
        </Card>

        {/* Campaign List */}
        <h2 style={{
          fontFamily: typography.fontFamily.display, fontSize: 16, fontWeight: 600,
          color: colors.text.starlight, marginBottom: 16,
        }}>
          Campanhas TikTok
        </h2>

        {tiktokCampaigns.length === 0 ? (
          <Card>
            <div style={{ textAlign: 'center', padding: 32, position: 'relative' }}>
              
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={colors.text.dust} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto' }}>
                    <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
                  </svg>
                </div>
                <div style={{ fontFamily: typography.fontFamily.display, fontSize: 15, fontWeight: 600, color: colors.text.moonlight, marginBottom: 6 }}>
                  Nenhuma campanha TikTok ainda
                </div>
                <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 13, color: colors.text.dust, marginBottom: 16 }}>
                  Crie sua primeira campanha TikTok para automatizar engajamento com seus seguidores.
                </div>
                <button
                  onClick={() => router.push('/campaigns')}
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
                  Criar campanha TikTok
                </button>
              </div>
            </div>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tiktokCampaigns.map((c: any, i: number) => (
              <Card key={c.id || c._id || i} onClick={() => router.push('/campaigns')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontFamily: typography.fontFamily.display, fontSize: 14, fontWeight: 600, color: colors.text.starlight }}>
                      {c.name || c.title || `Campanha TikTok ${i + 1}`}
                    </div>
                    <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 12, color: colors.text.dust, marginTop: 2 }}>
                      TikTok &middot; {c.createdAt ? new Date(c.createdAt).toLocaleDateString('pt-BR') : '--'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 12, color: colors.text.moonlight }}>
                      {c.sent || c.messagesSent || 0} interacoes
                    </div>
                    <span style={{
                      padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      fontFamily: typography.fontFamily.display,
                      color: c.status === 'active' || c.status === 'running' ? colors.state.success : colors.text.moonlight,
                      background: c.status === 'active' || c.status === 'running' ? 'rgba(224, 221, 216, 0.1)' : 'rgba(255,255,255,0.04)',
                      textTransform: 'uppercase' as const, letterSpacing: '0.04em',
                    }}>
                      {c.status || 'rascunho'}
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
