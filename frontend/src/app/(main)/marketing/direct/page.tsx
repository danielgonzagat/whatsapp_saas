'use client';

import { useRouter } from 'next/navigation';
import { useCampaigns } from '@/hooks/useCampaigns';
import { Card } from '@/components/kloel/Card';
import { PageTitle } from '@/components/kloel/PageTitle';
import { Lbl } from '@/components/kloel/Lbl';
import { Val } from '@/components/kloel/Val';
import { OrbitalLoader } from '@/components/kloel/cosmos/OrbitalLoader';
import { StarField } from '@/components/kloel/cosmos/StarField';
import { colors, typography, motion } from '@/lib/design-tokens';

export default function DirectPage() {
  const router = useRouter();
  const { campaigns, total, isLoading } = useCampaigns();

  const dmCampaigns = (campaigns || []).filter(
    (c: any) => c.type === 'instagram' || c.type === 'dm' || c.type === 'direct' || c.channel === 'instagram',
  );
  const activeDM = dmCampaigns.filter(
    (c: any) => c.status === 'active' || c.status === 'running',
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
      <StarField density={40} />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 960 }}>
        <PageTitle
          title="Direct — Instagram"
          sub="Automacao de mensagens diretas pelo Instagram"
          right={
            <button
              onClick={() => router.push('/campaigns')}
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
              Criar campanha DM
            </button>
          }
        />

        {/* Stat Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
          <Card>
            <Lbl>Campanhas DM</Lbl>
            <Val size={28}>{dmCampaigns.length}</Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              de {total} totais
            </div>
          </Card>
          <Card>
            <Lbl>Ativas Agora</Lbl>
            <Val size={28} color={colors.state.success}>{activeDM}</Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              campanhas rodando
            </div>
          </Card>
          <Card>
            <Lbl>Mensagens Enviadas</Lbl>
            <Val size={28} color={colors.accent.gold}>
              {dmCampaigns.reduce((sum: number, c: any) => sum + (c.sent || c.messagesSent || 0), 0)}
            </Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              via Instagram DM
            </div>
          </Card>
        </div>

        {/* Info Card */}
        <Card style={{ marginBottom: 32, background: 'rgba(78, 122, 224, 0.04)', border: `1px solid rgba(78, 122, 224, 0.15)` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: 'rgba(78, 122, 224, 0.1)',
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
                Motor de Campanhas Kloel
              </div>
              <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 13, color: colors.text.moonlight, lineHeight: 1.5 }}>
                Esta funcionalidade usa o motor de campanhas do Kloel. Crie campanhas do tipo Instagram DM para
                automatizar o envio de mensagens diretas, nutrir leads e gerar engajamento com sua audiencia.
              </div>
            </div>
          </div>
        </Card>

        {/* Campaign List */}
        <h2 style={{
          fontFamily: typography.fontFamily.display, fontSize: 16, fontWeight: 600,
          color: colors.text.starlight, marginBottom: 16,
        }}>
          Campanhas Instagram DM
        </h2>

        {dmCampaigns.length === 0 ? (
          <Card>
            <div style={{ textAlign: 'center', padding: 32, position: 'relative' }}>
              <StarField density={20} />
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={colors.text.dust} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto' }}>
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                  </svg>
                </div>
                <div style={{ fontFamily: typography.fontFamily.display, fontSize: 15, fontWeight: 600, color: colors.text.moonlight, marginBottom: 6 }}>
                  Nenhuma campanha DM ainda
                </div>
                <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 13, color: colors.text.dust, marginBottom: 16 }}>
                  Crie sua primeira campanha de Instagram DM para comecar a engajar seus seguidores.
                </div>
                <button
                  onClick={() => router.push('/campaigns')}
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
                  Criar campanha DM
                </button>
              </div>
            </div>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dmCampaigns.map((c: any, i: number) => (
              <Card key={c.id || c._id || i} onClick={() => router.push('/campaigns')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontFamily: typography.fontFamily.display, fontSize: 14, fontWeight: 600, color: colors.text.starlight }}>
                      {c.name || c.title || `Campanha DM ${i + 1}`}
                    </div>
                    <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 12, color: colors.text.dust, marginTop: 2 }}>
                      Instagram DM &middot; {c.createdAt ? new Date(c.createdAt).toLocaleDateString('pt-BR') : '--'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 12, color: colors.text.moonlight }}>
                      {c.sent || c.messagesSent || 0} enviadas
                    </div>
                    <span style={{
                      padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      fontFamily: typography.fontFamily.display,
                      color: c.status === 'active' || c.status === 'running' ? colors.state.success : colors.text.moonlight,
                      background: c.status === 'active' || c.status === 'running' ? 'rgba(45, 212, 160, 0.1)' : 'rgba(255,255,255,0.04)',
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
