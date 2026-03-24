'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useContacts } from '@/hooks/useCRM';
import { useDeals } from '@/hooks/useCRM';
import { useAnalyticsDashboard } from '@/hooks/useAnalytics';
import { Card } from '@/components/kloel/Card';
import { PageTitle } from '@/components/kloel/PageTitle';
import { Lbl } from '@/components/kloel/Lbl';
import { Val } from '@/components/kloel/Val';
import { Metric } from '@/components/kloel/Metric';
import { colors, typography } from '@/lib/design-tokens';

export default function VendasPage() {
  const router = useRouter();
  const { contacts, total: totalContacts, isLoading: contactsLoading } = useContacts();
  const { deals, total: totalDeals, isLoading: dealsLoading } = useDeals();
  const { dashboard, isLoading: dashLoading } = useAnalyticsDashboard();

  const isLoading = contactsLoading || dealsLoading || dashLoading;

  const wonDeals = (deals || []).filter((d: any) => d.stage === 'won' || d.status === 'won').length;
  const conversionRate = totalDeals > 0 ? Math.round((wonDeals / totalDeals) * 100) : 0;
  const totalRevenue = (deals || []).reduce((sum: number, d: any) => sum + (d.value || d.amount || 0), 0);

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
          title="Vendas"
          sub="Acompanhe seus leads, negocios e metricas de conversao"
          right={
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => router.push('/vendas/gestao-vendas')}
                style={{
                  padding: '8px 16px',
                  background: 'rgba(232, 93, 48, 0.08)',
                  border: `1px solid ${colors.border.space}`,
                  borderRadius: 6,
                  color: colors.accent.webb,
                  fontFamily: typography.fontFamily.display,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                CRM
              </button>
              <button
                onClick={() => router.push('/vendas/assinaturas')}
                style={{
                  padding: '8px 16px',
                  background: 'rgba(232, 93, 48, 0.08)',
                  border: `1px solid ${colors.border.space}`,
                  borderRadius: 6,
                  color: colors.accent.webb,
                  fontFamily: typography.fontFamily.display,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Assinaturas
              </button>
            </div>
          }
        />

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
          <Card>
            <Lbl>Total de Leads</Lbl>
            <Val size={28}>{totalContacts}</Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              contatos no CRM
            </div>
          </Card>
          <Card>
            <Lbl>Negocios no Pipeline</Lbl>
            <Val size={28} color={colors.accent.webb}>{totalDeals}</Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              {wonDeals} fechados
            </div>
          </Card>
          <Card>
            <Lbl>Taxa de Conversao</Lbl>
            <Val size={28} color={colors.state.success}>{conversionRate}%</Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              negocios ganhos / total
            </div>
          </Card>
          <Card>
            <Lbl>Receita Total</Lbl>
            <Val size={28} color={colors.accent.gold}>
              R$ {totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              valor dos negocios
            </div>
          </Card>
        </div>

        {/* Recent Deals */}
        <div style={{ marginBottom: 32 }}>
          <h2 style={{
            fontFamily: typography.fontFamily.display,
            fontSize: 16,
            fontWeight: 600,
            color: colors.text.starlight,
            marginBottom: 16,
          }}>
            Negocios Recentes
          </h2>
          {(deals || []).length === 0 ? (
            <Card>
              <div style={{ textAlign: 'center', padding: 24, color: colors.text.dust, fontFamily: typography.fontFamily.sans, fontSize: 14 }}>
                Nenhum negocio no pipeline ainda. Os negocios aparecerao conforme seus leads avancem.
              </div>
            </Card>
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${colors.border.void}` }}>
                    {['Negocio', 'Contato', 'Etapa', 'Valor'].map((h) => (
                      <th key={h} style={{
                        padding: '12px 16px',
                        fontFamily: typography.fontFamily.display,
                        fontSize: 11,
                        fontWeight: 600,
                        color: colors.text.dust,
                        textTransform: 'uppercase' as const,
                        letterSpacing: '0.08em',
                        textAlign: 'left',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(deals || []).slice(0, 8).map((d: any, i: number) => (
                    <tr key={d.id || d._id || i} style={{ borderBottom: `1px solid ${colors.border.void}` }}>
                      <td style={{ padding: '12px 16px', fontFamily: typography.fontFamily.sans, fontSize: 13, color: colors.text.starlight }}>
                        {d.title || d.name || `Negocio ${i + 1}`}
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: typography.fontFamily.sans, fontSize: 13, color: colors.text.moonlight }}>
                        {d.contact?.name || d.contactName || d.phone || '--'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          fontFamily: typography.fontFamily.display,
                          color: d.stage === 'won' ? colors.state.success : colors.accent.webb,
                          background: d.stage === 'won' ? 'rgba(224, 221, 216, 0.1)' : 'rgba(232, 93, 48, 0.08)',
                        }}>
                          {d.stage || d.status || 'novo'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: typography.fontFamily.display, fontSize: 13, fontWeight: 600, color: colors.text.starlight }}>
                        R$ {(d.value || d.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>

        {/* Recent Contacts */}
        <div>
          <h2 style={{
            fontFamily: typography.fontFamily.display,
            fontSize: 16,
            fontWeight: 600,
            color: colors.text.starlight,
            marginBottom: 16,
          }}>
            Contatos Recentes
          </h2>
          {(contacts || []).length === 0 ? (
            <Card>
              <div style={{ textAlign: 'center', padding: 24, color: colors.text.dust, fontFamily: typography.fontFamily.sans, fontSize: 14 }}>
                Nenhum contato ainda. Conecte o WhatsApp para comecar a captar leads.
              </div>
            </Card>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
              {(contacts || []).slice(0, 6).map((c: any, i: number) => (
                <Card key={c.id || c._id || c.phone || i}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: colors.background.nebula,
                      border: `1px solid ${colors.border.space}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: typography.fontFamily.display,
                      fontSize: 14,
                      fontWeight: 600,
                      color: colors.accent.webb,
                    }}>
                      {(c.name || c.phone || '?')[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: typography.fontFamily.display, fontSize: 14, fontWeight: 600, color: colors.text.starlight, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                        {c.name || c.phone || 'Contato'}
                      </div>
                      <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 12, color: colors.text.dust }}>
                        {c.phone || c.email || '--'}
                      </div>
                    </div>
                    {c.tags && c.tags.length > 0 && (
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 600,
                        fontFamily: typography.fontFamily.display,
                        color: colors.accent.gold,
                        background: 'rgba(224, 221, 216, 0.1)',
                      }}>
                        {c.tags[0]}
                      </span>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
