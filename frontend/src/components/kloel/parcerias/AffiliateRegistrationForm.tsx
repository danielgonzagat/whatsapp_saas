'use client';

import { kloelT } from '@/lib/i18n/t';
import { createAffiliate } from '@/hooks/usePartnerships';
import { useId, useState } from 'react';
import { IC } from './ParceriasView.icons';
import { C, FONT } from './ParceriasDesignTokens';

export default function AffiliateRegistrationForm({ onClose }: { onClose: () => void }) {
  const fid = useId();
  const [partnerName, setPartnerName] = useState('');
  const [partnerEmail, setPartnerEmail] = useState('');
  const [commissionRate, setCommissionRate] = useState('30');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!partnerName.trim() || !partnerEmail.trim()) {
      setError('Preencha nome e email do afiliado.');
      return;
    }
    setSending(true);
    setError('');
    try {
      await createAffiliate({
        partnerName: partnerName.trim(),
        partnerEmail: partnerEmail.trim(),
        type: 'AFFILIATE',
        commissionRate: commissionRate.trim() ? Number(commissionRate) : undefined,
      });
      onClose();
    } catch (affiliateError: unknown) {
      setError(
        affiliateError instanceof Error
          ? affiliateError.message
          : 'Nao foi possivel enviar o convite agora.',
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div role="button" tabIndex={0} aria-label="Fechar modal" onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: C.bgOverlay, backdropFilter: 'blur(4px)' }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLElement).click(); } }}
      />
      <div style={{ position: 'relative', width: '100%', maxWidth: 460, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: 28, animation: 'slideIn 200ms ease' }}>
        <button type="button" onClick={onClose}
          style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
          <span style={{ color: C.secondary }}>{IC.x(16)}</span>
        </button>
        <h2 style={{ fontFamily: FONT.sans, fontSize: 18, fontWeight: 700, color: C.text, margin: '0 0 4px' }}>
          {kloelT(`Convidar afiliado`)}
        </h2>
        <p style={{ fontFamily: FONT.sans, fontSize: 13, color: C.secondary, margin: '0 0 20px' }}>
          {kloelT(`A Kloel envia um convite por email. Quando o afiliado concluir o cadastro, a conta dele é provisionada automaticamente no seu programa.`)}
        </p>
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <label htmlFor={`${fid}-affiliate-name`} style={{ display: 'block', marginBottom: 6, fontFamily: FONT.sans, fontSize: 12, fontWeight: 500, color: C.secondary }}>
              {kloelT(`Nome do afiliado`)}
            </label>
            <input id={`${fid}-affiliate-name`} value={partnerName} onChange={(e) => setPartnerName(e.target.value)}
              placeholder={kloelT(`Ex.: Ana Souza`)}
              style={{ width: '100%', padding: '10px 14px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: FONT.sans, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }}
            />
          </div>
          <div>
            <label htmlFor={`${fid}-affiliate-email`} style={{ display: 'block', marginBottom: 6, fontFamily: FONT.sans, fontSize: 12, fontWeight: 500, color: C.secondary }}>
              {kloelT(`Email do afiliado`)}
            </label>
            <input id={`${fid}-affiliate-email`} type="email" value={partnerEmail} onChange={(e) => setPartnerEmail(e.target.value)}
              placeholder={kloelT(`afiliado@email.com`)}
              style={{ width: '100%', padding: '10px 14px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: FONT.sans, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }}
            />
          </div>
          <div>
            <label htmlFor={`${fid}-affiliate-commission`} style={{ display: 'block', marginBottom: 6, fontFamily: FONT.sans, fontSize: 12, fontWeight: 500, color: C.secondary }}>
              {kloelT(`Comissão inicial (%)`)}
            </label>
            <input id={`${fid}-affiliate-commission`} type="number" min={0} max={100} value={commissionRate} onChange={(e) => setCommissionRate(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: FONT.sans, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }}
            />
          </div>
        </div>
        <div style={{ marginTop: 16, padding: '12px 14px', background: C.infoBg, border: `1px solid color-mix(in srgb, ${C.info} 14%, transparent)`, borderRadius: 6, fontFamily: FONT.sans, fontSize: 12, color: C.secondary, lineHeight: 1.6 }}>
          {kloelT(`O afiliado entra como pendente até concluir o cadastro dele. Depois disso, a conta de afiliado é criada automaticamente e o status muda para ativo.`)}
        </div>
        {error ? (
          <div style={{ marginTop: 12, padding: '10px 12px', background: C.errorBg, border: `1px solid color-mix(in srgb, ${C.error} 14%, transparent)`, borderRadius: 6, fontFamily: FONT.sans, fontSize: 12, color: C.error }}>
            {error}
          </div>
        ) : null}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" onClick={onClose}
            style={{ padding: '9px 18px', background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, color: C.secondary, fontFamily: FONT.sans, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            {kloelT(`Cancelar`)}
          </button>
          <button type="button" onClick={handleSubmit} disabled={sending}
            style={{ padding: '9px 22px', background: C.ember, border: 'none', borderRadius: 6, color: C.textOnAccent, fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, cursor: sending ? 'wait' : 'pointer', opacity: sending ? 0.7 : 1 }}>
            {sending ? 'Enviando...' : 'Enviar convite'}
          </button>
        </div>
      </div>
    </div>
  );
}
