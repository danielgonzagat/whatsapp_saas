'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useFlows } from '@/hooks/useFlowsSWR';
import { useFollowups } from '@/hooks/useFollowups';
import { Card } from '@/components/kloel/Card';
import { PageTitle } from '@/components/kloel/PageTitle';
import { Lbl } from '@/components/kloel/Lbl';
import { Val } from '@/components/kloel/Val';
import { Metric } from '@/components/kloel/Metric';
import { colors, typography, motion } from '@/lib/design-tokens';

export default function MarketingPage() {
  const router = useRouter();
  const { campaigns, total: totalCampaigns, isLoading: campLoading } = useCampaigns();
  const { flows, isLoading: flowLoading } = useFlows();
  const { followups, total: totalFollowups, isLoading: fuLoading } = useFollowups();

  const isLoading = campLoading || flowLoading || fuLoading;

  const activeFlows = (flows || []).filter((f: any) => f.active || f.status === 'active').length;
  const activeCampaigns = (campaigns || []).filter((c: any) => c.status === 'active' || c.status === 'running').length;
  const pendingFollowups = (followups || []).filter((f: any) => f.status === 'pending' || f.status === 'scheduled').length;

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
          title="Marketing"
          sub="Visao geral das suas campanhas, fluxos e follow-ups"
        />

        {/* Stat Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
          <Card>
            <Lbl>Campanhas Totais</Lbl>
            <Val size={28}>{totalCampaigns}</Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              {activeCampaigns} ativas
            </div>
          </Card>
          <Card>
            <Lbl>Fluxos Ativos</Lbl>
            <Val size={28} color={colors.state.success}>{activeFlows}</Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              de {(flows || []).length} totais
            </div>
          </Card>
          <Card>
            <Lbl>Follow-ups</Lbl>
            <Val size={28} color={colors.accent.gold}>{totalFollowups}</Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              {pendingFollowups} pendentes
            </div>
          </Card>
        </div>

        {/* Quick Actions */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
          {[
            { label: 'Nova Campanha', icon: '\u{1F4E2}', href: '/campaigns' },
            { label: 'Novo Fluxo', icon: '\u{26A1}', href: '/flow' },
            { label: 'WhatsApp', icon: '\u{1F4F1}', href: '/marketing/whatsapp' },
          ].map((action) => (
            <button
              key={action.label}
              onClick={() => router.push(action.href)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 20px',
                background: 'rgba(232, 93, 48, 0.08)',
                border: `1px solid ${colors.border.space}`,
                borderRadius: 6,
                color: colors.accent.webb,
                fontFamily: typography.fontFamily.display,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: `all ${motion.duration.normal} ${motion.easing.gravity}`,
              }}
            >
              <span style={{ fontSize: 16 }}>{action.icon}</span>
              {action.label}
            </button>
          ))}
        </div>

        {/* Recent Campaigns */}
        <div style={{ marginBottom: 32 }}>
          <h2 style={{
            fontFamily: typography.fontFamily.display,
            fontSize: 16,
            fontWeight: 600,
            color: colors.text.starlight,
            marginBottom: 16,
          }}>
            Campanhas Recentes
          </h2>

          {(campaigns || []).length === 0 ? (
            <Card>
              <div style={{ textAlign: 'center', padding: 24, color: colors.text.dust, fontFamily: typography.fontFamily.sans, fontSize: 14 }}>
                Nenhuma campanha criada ainda. Crie sua primeira campanha para comecar a engajar seus leads.
              </div>
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(campaigns || []).slice(0, 5).map((c: any, i: number) => (
                <Card key={c.id || c._id || i} onClick={() => router.push(`/campaigns`)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{
                        fontFamily: typography.fontFamily.display,
                        fontSize: 14,
                        fontWeight: 600,
                        color: colors.text.starlight,
                      }}>
                        {c.name || c.title || `Campanha ${i + 1}`}
                      </div>
                      <div style={{
                        fontFamily: typography.fontFamily.sans,
                        fontSize: 12,
                        color: colors.text.dust,
                        marginTop: 2,
                      }}>
                        {c.type || 'WhatsApp'} &middot; {c.createdAt ? new Date(c.createdAt).toLocaleDateString('pt-BR') : '--'}
                      </div>
                    </div>
                    <span style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      fontFamily: typography.fontFamily.display,
                      color: c.status === 'active' || c.status === 'running' ? colors.state.success : colors.text.moonlight,
                      background: c.status === 'active' || c.status === 'running' ? 'rgba(224, 221, 216, 0.1)' : 'rgba(255,255,255,0.04)',
                      textTransform: 'uppercase' as const,
                      letterSpacing: '0.04em',
                    }}>
                      {c.status || 'rascunho'}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Recent Followups */}
        <div>
          <h2 style={{
            fontFamily: typography.fontFamily.display,
            fontSize: 16,
            fontWeight: 600,
            color: colors.text.starlight,
            marginBottom: 16,
          }}>
            Follow-ups Pendentes
          </h2>
          {(followups || []).length === 0 ? (
            <Card>
              <div style={{ textAlign: 'center', padding: 24, color: colors.text.dust, fontFamily: typography.fontFamily.sans, fontSize: 14 }}>
                Nenhum follow-up agendado.
              </div>
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(followups || []).slice(0, 5).map((f: any, i: number) => (
                <Metric
                  key={f.id || i}
                  label={f.phone || f.contact || `Follow-up ${i + 1}`}
                  value={f.scheduledAt ? new Date(f.scheduledAt).toLocaleDateString('pt-BR') : f.status || '--'}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
