'use client';

import { useState } from 'react';
import { kloelT } from '@/lib/i18n/t';
import { sendReportEmail } from '@/lib/api/reports';
import { V, FONT_MONO, chartCardStyle, inputStyle, labelStyle } from '../analytics.design-tokens';
import { ICONS } from '../shared/Icons';
import { Button } from '../shared/Components';
import type { ReportFilters } from '../analytics.types';

const REPORT_TYPES = ['vendas', 'assinaturas', 'abandonos', 'chargeback'] as const;

export function EnvioRelatoriosTab({ filters, isMobile }: { filters: ReportFilters; isMobile: boolean }) {
  const [email, setEmail] = useState('');
  const [reportType, setReportType] = useState<string>('vendas');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message?: string } | null>(null);

  const periodDisplay = filters.startDate && filters.endDate
    ? `${filters.startDate} \u2192 ${filters.endDate}`
    : kloelT(`Ultimos 30 dias`);

  const handleSend = async () => {
    if (!email) {return;}
    setSending(true);
    setResult(null);
    try {
      const res = await sendReportEmail({
        email,
        reportType,
        period: periodDisplay,
        filters: filters as Record<string, string>,
      });
      setResult({ success: true, message: res.data?.message ?? kloelT(`Relatorio enviado com sucesso`) });
    } catch {
      setResult({ success: false, message: kloelT(`Erro ao enviar relatorio`) });
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
      gap: 20,
    }}>
      <div style={{ ...chartCardStyle, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          {ICONS.file(18)}
          <span style={{ fontSize: 14, fontWeight: 600, color: V.t }}>
            {kloelT(`Enviar relatorio por email`)}
          </span>
        </div>

        <label style={labelStyle}>{kloelT(`Email de destino`)}</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={kloelT(`financeiro@empresa.com`)}
          style={{ ...inputStyle, marginBottom: 16 }}
        />

        <label style={labelStyle}>{kloelT(`Tipo de relatorio`)}</label>
        <select
          value={reportType}
          onChange={(e) => setReportType(e.target.value)}
          style={{ ...inputStyle, marginBottom: 16 }}
        >
          {REPORT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>

        <label style={labelStyle}>{kloelT(`Periodo`)}</label>
        <div style={{
          ...inputStyle,
          background: V.s,
          marginBottom: 20,
          fontFamily: FONT_MONO,
          fontSize: 12,
          color: V.t2,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          {ICONS.clock(14)}
          {periodDisplay}
        </div>

        <Button primary onClick={handleSend} style={{ width: '100%', justifyContent: 'center' }}>
          {ICONS.file(14)}
          {sending ? kloelT(`Enviando...`) : kloelT(`Enviar relatorio`)}
        </Button>

        {result && (
          <div style={{
            marginTop: 14,
            padding: '10px 14px',
            borderRadius: 6,
            background: result.success ? `${V.g2}10` : `${V.r}10`,
            border: `1px solid ${result.success ? V.g2 : V.r}`,
          }}>
            <span style={{ fontSize: 11, color: result.success ? V.g2 : V.r, fontFamily: FONT_MONO }}>
              {result.message}
            </span>
          </div>
        )}
      </div>

      <div style={{ ...chartCardStyle, padding: 20 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: V.t, display: 'block', marginBottom: 14 }}>
          {kloelT(`Rotina recomendada`)}
        </span>

        {[
          {
            t: kloelT(`Relatorio semanal`),
            d: kloelT(`Envie um resumo de vendas toda segunda-feira para o time financeiro. Inclua receita, ticket medio e principais produtos.`),
            i: ICONS.repeat,
          },
          {
            t: kloelT(`Relatorio de churn`),
            d: kloelT(`Mensalmente, analise cancelamentos e envie para o time de produto com os principais motivos de saida.`),
            i: ICONS.ban,
          },
          {
            t: kloelT(`Relatorio de chargeback`),
            d: kloelT(`Sempre que houver disputas, gere o relatorio e compartilhe com o time de risco para acao imediata.`),
            i: ICONS.alert,
          },
        ].map((card) => (
          <div
            key={card.t}
            style={{
              display: 'flex',
              gap: 12,
              padding: '12px 0',
              borderBottom: `1px solid ${V.b}`,
            }}
          >
            <div style={{ color: V.em, flexShrink: 0, marginTop: 2 }}>
              {card.i(16)}
            </div>
            <div>
              <span style={{ fontSize: 11, fontWeight: 600, color: V.t, display: 'block', marginBottom: 4 }}>
                {card.t}
              </span>
              <span style={{ fontSize: 10, color: V.t2, lineHeight: 1.5 }}>
                {card.d}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
