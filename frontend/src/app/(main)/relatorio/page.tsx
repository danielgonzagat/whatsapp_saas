'use client';

import { useState } from 'react';
import { useAnalyticsDashboard, useAnalyticsActivity } from '@/hooks/useAnalytics';
import { Card } from '@/components/kloel/Card';
import { PageTitle } from '@/components/kloel/PageTitle';
import { Lbl } from '@/components/kloel/Lbl';
import { Val } from '@/components/kloel/Val';
import { Metric } from '@/components/kloel/Metric';
import { colors, typography, motion } from '@/lib/design-tokens';

export default function RelatorioPage() {
  const { dashboard, isLoading: dashLoading } = useAnalyticsDashboard();
  const { activity, isLoading: actLoading } = useAnalyticsActivity();
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  const isLoading = dashLoading || actLoading;
  const dash = dashboard;
  const act = activity;

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', background: colors.background.void }}>
        <div style={{width:20,height:20,border:'2px solid transparent',borderTopColor:'#E85D30',borderRadius:'50%',animation:'spin 1s linear infinite'}} />
      </div>
    );
  }

  const kpis = [
    { label: 'Mensagens Enviadas', value: dash?.messagesSent ?? dash?.messages ?? 0, color: colors.accent.webb },
    { label: 'Conversas', value: dash?.conversations ?? dash?.chats ?? 0, color: colors.text.starlight },
    { label: 'Leads Captados', value: dash?.newLeads ?? dash?.leads ?? 0, color: colors.state.success },
    { label: 'Vendas', value: dash?.sales ?? dash?.conversions ?? 0, color: colors.accent.gold },
    { label: 'Taxa de Resposta', value: `${dash?.responseRate ?? dash?.replyRate ?? 0}%`, color: colors.state.success },
    { label: 'Receita', value: `R$ ${(dash?.revenue ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, color: colors.accent.gold },
  ];

  const activityItems = Array.isArray(act) ? act : (act?.items || act?.events || []);

  return (
    <div style={{ padding: 32, position: 'relative', minHeight: '100vh', background: colors.background.void }}>
      
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 960 }}>
        <PageTitle
          title="Relatorios"
          sub="Analise detalhada do desempenho da sua operacao"
          right={
            <div style={{ display: 'flex', gap: 6 }}>
              {(['7d', '30d', '90d'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  style={{
                    padding: '8px 14px',
                    background: period === p ? 'rgba(232, 93, 48, 0.12)' : 'transparent',
                    border: `1px solid ${period === p ? colors.accent.webb : colors.border.space}`,
                    borderRadius: 6,
                    color: period === p ? colors.accent.webb : colors.text.moonlight,
                    fontFamily: typography.fontFamily.display,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: `all ${motion.duration.normal} ${motion.easing.gravity}`,
                  }}
                >
                  {p === '7d' ? '7 dias' : p === '30d' ? '30 dias' : '90 dias'}
                </button>
              ))}
            </div>
          }
        />

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
          {kpis.map((kpi) => (
            <Card key={kpi.label}>
              <Lbl>{kpi.label}</Lbl>
              <Val size={26} color={kpi.color}>{kpi.value}</Val>
            </Card>
          ))}
        </div>

        {/* Activity Chart Placeholder */}
        <Card style={{ marginBottom: 32, padding: 24 }}>
          <Lbl>Atividade ({period === '7d' ? '7 dias' : period === '30d' ? '30 dias' : '90 dias'})</Lbl>
          <div style={{
            height: 200,
            marginTop: 16,
            borderRadius: 6,
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Background Grid */}
            {[0, 1, 2, 3, 4].map((line) => (
              <div key={line} style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: `${line * 25}%`,
                height: 1,
                background: colors.border.void,
              }} />
            ))}
            {/* Bar Chart */}
            <div style={{
              display: 'flex',
              alignItems: 'flex-end',
              height: '100%',
              gap: 3,
              padding: '0 4px 4px 4px',
              position: 'relative',
              zIndex: 1,
            }}>
              {Array.from({ length: period === '7d' ? 7 : period === '30d' ? 30 : 90 }, (_, i) => {
                const dayCount = period === '7d' ? 7 : period === '30d' ? 30 : 90;
                const height = 15 + Math.sin(i * 0.4 + 1) * 25 + Math.cos(i * 0.2) * 15 + (i / dayCount) * 30;
                return (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: `${Math.min(95, Math.max(5, height))}%`,
                      background: i === dayCount - 1
                        ? colors.accent.webb
                        : `rgba(232, 93, 48, ${0.15 + (i / dayCount) * 0.3})`,
                      borderRadius: '2px 2px 0 0',
                      minWidth: 1,
                    }}
                  />
                );
              })}
            </div>
          </div>
        </Card>

        {/* Activity Feed + Additional Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Activity Feed */}
          <div>
            <h2 style={{
              fontFamily: typography.fontFamily.display,
              fontSize: 16,
              fontWeight: 600,
              color: colors.text.starlight,
              marginBottom: 16,
            }}>
              Atividade Recente
            </h2>
            {activityItems.length === 0 ? (
              <Card>
                <div style={{ textAlign: 'center', padding: 24, color: colors.text.dust, fontFamily: typography.fontFamily.sans, fontSize: 14 }}>
                  Nenhuma atividade registrada no periodo.
                </div>
              </Card>
            ) : (
              <Card style={{ padding: 0 }}>
                {activityItems.slice(0, 10).map((item: any, i: number) => (
                  <div
                    key={item.id || i}
                    style={{
                      padding: '12px 20px',
                      borderBottom: i < Math.min(activityItems.length, 10) - 1 ? `1px solid ${colors.border.void}` : 'none',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 13, color: colors.text.starlight }}>
                        {item.description || item.message || item.action || 'Evento'}
                      </div>
                      <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 11, color: colors.text.dust, marginTop: 2 }}>
                        {item.type || item.category || '--'}
                      </div>
                    </div>
                    <span style={{ fontFamily: typography.fontFamily.sans, fontSize: 11, color: colors.text.dust, whiteSpace: 'nowrap' as const }}>
                      {item.timestamp || item.createdAt ? new Date(item.timestamp || item.createdAt).toLocaleString('pt-BR') : '--'}
                    </span>
                  </div>
                ))}
              </Card>
            )}
          </div>

          {/* Detailed Metrics */}
          <div>
            <h2 style={{
              fontFamily: typography.fontFamily.display,
              fontSize: 16,
              fontWeight: 600,
              color: colors.text.starlight,
              marginBottom: 16,
            }}>
              Metricas Detalhadas
            </h2>
            <Card style={{ padding: 20 }}>
              <Metric label="Tempo Medio de Resposta" value={dash?.avgResponseTime || dash?.responseTime || '--'} />
              <Metric label="Satisfacao do Cliente" value={dash?.satisfaction ? `${dash.satisfaction}%` : '--'} color={colors.state.success} />
              <Metric label="Mensagens/Conversa" value={dash?.messagesPerChat ?? dash?.avgMessages ?? '--'} />
              <Metric label="Taxa de Fechamento" value={dash?.closeRate ? `${dash.closeRate}%` : '--'} color={colors.accent.gold} />
              <Metric label="Leads Quentes" value={dash?.hotLeads ?? '--'} color={colors.state.warning} />
              <Metric label="Automacoes Executadas" value={dash?.automationsRun ?? dash?.automations ?? '--'} />
              <Metric label="Follow-ups Enviados" value={dash?.followupsSent ?? dash?.followups ?? '--'} />
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
