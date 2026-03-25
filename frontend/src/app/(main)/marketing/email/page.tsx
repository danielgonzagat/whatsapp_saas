'use client';

import { useRouter } from 'next/navigation';
import { useCampaigns } from '@/hooks/useCampaigns';
import { Card } from '@/components/kloel/Card';
import { PageTitle } from '@/components/kloel/PageTitle';
import { Lbl } from '@/components/kloel/Lbl';
import { Val } from '@/components/kloel/Val';
import { Metric } from '@/components/kloel/Metric';
import { colors, typography, motion } from '@/lib/design-tokens';

export default function EmailMarketingPage() {
  const router = useRouter();
  const { campaigns, total, isLoading, error } = useCampaigns();

  const emailCampaigns = (campaigns || []).filter(
    (c: any) => c.type === 'email' || c.channel === 'email',
  );
  const activeEmail = emailCampaigns.filter(
    (c: any) => c.status === 'active' || c.status === 'running' || c.status === 'sent',
  ).length;
  const totalSent = emailCampaigns.reduce((sum: number, c: any) => sum + (c.sent || c.messagesSent || c.emailsSent || 0), 0);
  const totalOpened = emailCampaigns.reduce((sum: number, c: any) => sum + (c.opened || c.opens || 0), 0);
  const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;

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
          title="Email Marketing"
          sub="Crie e gerencie suas campanhas de email"
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
              Criar campanha de email
            </button>
          }
        />

        {/* Stat Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
          <Card>
            <Lbl>Campanhas Email</Lbl>
            <Val size={28}>{emailCampaigns.length}</Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              de {total} totais
            </div>
          </Card>
          <Card>
            <Lbl>Ativas / Enviadas</Lbl>
            <Val size={28} color={colors.state.success}>{activeEmail}</Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              campanhas finalizadas
            </div>
          </Card>
          <Card>
            <Lbl>Emails Enviados</Lbl>
            <Val size={28} color={colors.accent.webb}>{totalSent.toLocaleString('pt-BR')}</Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              total acumulado
            </div>
          </Card>
          <Card>
            <Lbl>Taxa de Abertura</Lbl>
            <Val size={28} color={colors.accent.gold}>{openRate}%</Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              media das campanhas
            </div>
          </Card>
        </div>

        {/* Campaign List */}
        <h2 style={{
          fontFamily: typography.fontFamily.display, fontSize: 16, fontWeight: 600,
          color: colors.text.starlight, marginBottom: 16,
        }}>
          Campanhas de Email
        </h2>

        {emailCampaigns.length === 0 ? (
          <Card>
            <div style={{ textAlign: 'center', padding: 32, position: 'relative' }}>
              
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ marginBottom: 12 }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={colors.text.dust} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto' }}>
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                </div>
                <div style={{ fontFamily: typography.fontFamily.display, fontSize: 15, fontWeight: 600, color: colors.text.moonlight, marginBottom: 6 }}>
                  Nenhuma campanha de email ainda
                </div>
                <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 13, color: colors.text.dust, marginBottom: 16 }}>
                  Crie sua primeira campanha de email marketing para nutrir seus leads e aumentar conversoes.
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
                  Criar campanha de email
                </button>
              </div>
            </div>
          </Card>
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${colors.border.void}` }}>
                  {['Campanha', 'Status', 'Enviados', 'Abertos', 'Data'].map((h) => (
                    <th key={h} style={{
                      padding: '12px 16px', fontFamily: typography.fontFamily.display,
                      fontSize: 11, fontWeight: 600, color: colors.text.dust,
                      textTransform: 'uppercase' as const, letterSpacing: '0.08em', textAlign: 'left',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {emailCampaigns.map((c: any, i: number) => (
                  <tr
                    key={c.id || c._id || i}
                    onClick={() => router.push('/campaigns')}
                    style={{ borderBottom: `1px solid ${colors.border.void}`, cursor: 'pointer' }}
                  >
                    <td style={{ padding: '12px 16px', fontFamily: typography.fontFamily.sans, fontSize: 13, color: colors.text.starlight }}>
                      {c.name || c.title || `Email ${i + 1}`}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                        fontFamily: typography.fontFamily.display,
                        color: c.status === 'sent' || c.status === 'active' ? colors.state.success : colors.text.moonlight,
                        background: c.status === 'sent' || c.status === 'active' ? 'rgba(224, 221, 216, 0.1)' : 'rgba(255,255,255,0.04)',
                        textTransform: 'uppercase' as const,
                      }}>
                        {c.status || 'rascunho'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: typography.fontFamily.sans, fontSize: 13, color: colors.text.moonlight }}>
                      {(c.sent || c.messagesSent || c.emailsSent || 0).toLocaleString('pt-BR')}
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: typography.fontFamily.sans, fontSize: 13, color: colors.text.moonlight }}>
                      {(c.opened || c.opens || 0).toLocaleString('pt-BR')}
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: typography.fontFamily.sans, fontSize: 12, color: colors.text.dust }}>
                      {c.createdAt ? new Date(c.createdAt).toLocaleDateString('pt-BR') : '--'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
