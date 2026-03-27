'use client';

import { useRouter } from 'next/navigation';
import { useCampaigns } from '@/hooks/useCampaigns';
import { Card } from '@/components/kloel/Card';
import { PageTitle } from '@/components/kloel/PageTitle';
import { Lbl } from '@/components/kloel/Lbl';
import { Val } from '@/components/kloel/Val';
import { colors, typography, motion } from '@/lib/design-tokens';

export default function MessengerPage() {
  const router = useRouter();
  const { campaigns, total, isLoading, error } = useCampaigns();

  const messengerCampaigns = (campaigns || []).filter(
    (c: any) => c.type === 'messenger' || c.type === 'facebook' || c.channel === 'messenger' || c.channel === 'facebook',
  );
  const activeMessenger = messengerCampaigns.filter(
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

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
        <button
          onClick={() => router.push('/marketing')}
          style={{
            background: 'none',
            border: 'none',
            color: '#6E6E73',
            fontSize: 13,
            fontFamily: "var(--font-sora), 'Sora', sans-serif",
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Marketing
        </button>
        <span style={{ color: '#3A3A3F', fontSize: 13 }}>/</span>
        <span style={{ color: '#E0DDD8', fontSize: 13, fontWeight: 600, fontFamily: "var(--font-sora), 'Sora', sans-serif" }}>Messenger</span>
      </div>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 960 }}>
        <PageTitle
          title="Messenger — Automacao"
          sub="Automacao de mensagens via Facebook Messenger"
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
              Criar campanha Messenger
            </button>
          }
        />

        {/* Stat Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
          <Card>
            <Lbl>Campanhas Messenger</Lbl>
            <Val size={28}>{messengerCampaigns.length}</Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              de {total} totais
            </div>
          </Card>
          <Card>
            <Lbl>Ativas Agora</Lbl>
            <Val size={28} color={colors.state.success}>{activeMessenger}</Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              campanhas rodando
            </div>
          </Card>
          <Card>
            <Lbl>Mensagens Enviadas</Lbl>
            <Val size={28} color={colors.accent.gold}>
              {messengerCampaigns.reduce((sum: number, c: any) => sum + (c.sent || c.messagesSent || 0), 0)}
            </Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              via Messenger
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
                Integracao Facebook Messenger
              </div>
              <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 13, color: colors.text.moonlight, lineHeight: 1.5 }}>
                Conecte sua pagina do Facebook para automatizar respostas no Messenger.
                Use o motor de campanhas do Kloel para criar sequencias de mensagens,
                chatbots e fluxos de atendimento automatizado para seus clientes.
              </div>
            </div>
          </div>
        </Card>

        {/* Campaign List */}
        <h2 style={{
          fontFamily: typography.fontFamily.display, fontSize: 16, fontWeight: 600,
          color: colors.text.starlight, marginBottom: 16,
        }}>
          Campanhas Messenger
        </h2>

        {messengerCampaigns.length === 0 ? (
          <Card>
            <div style={{ textAlign: 'center', padding: 32, position: 'relative' }}>
              
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ marginBottom: 12 }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={colors.text.dust} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto' }}>
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <div style={{ fontFamily: typography.fontFamily.display, fontSize: 15, fontWeight: 600, color: colors.text.moonlight, marginBottom: 6 }}>
                  Nenhuma campanha Messenger ainda
                </div>
                <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 13, color: colors.text.dust, marginBottom: 16 }}>
                  Crie sua primeira campanha Messenger para automatizar o atendimento via Facebook.
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
                  Criar campanha Messenger
                </button>
              </div>
            </div>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messengerCampaigns.map((c: any, i: number) => (
              <Card key={c.id || c._id || i} onClick={() => router.push('/campaigns')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontFamily: typography.fontFamily.display, fontSize: 14, fontWeight: 600, color: colors.text.starlight }}>
                      {c.name || c.title || `Campanha Messenger ${i + 1}`}
                    </div>
                    <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 12, color: colors.text.dust, marginTop: 2 }}>
                      Messenger &middot; {c.createdAt ? new Date(c.createdAt).toLocaleDateString('pt-BR') : '--'}
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
