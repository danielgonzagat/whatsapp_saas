'use client';

import { kloelT } from '@/lib/i18n/t';
import { buildPayUrl } from '@/lib/subdomains';
import type { AffiliateLink } from './partnershipTypes';
import { IC } from './ParceriasView.icons';
import { C, FONT } from './ParceriasDesignTokens';

function fmtMoney(n: number) {
  return 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

export default function AffiliateLinkList({
  links,
  loading,
}: {
  links: AffiliateLink[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div style={{ color: C.secondary, fontFamily: FONT.sans, fontSize: 13, padding: '20px 0' }}>
        {kloelT(`Carregando links...`)}
      </div>
    );
  }

  if (links.length === 0) {
    return (
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '40px 20px', textAlign: 'center' as const, marginBottom: 20 }}>
        <span style={{ color: C.muted }}>{IC.link(32)}</span>
        <p style={{ fontFamily: FONT.sans, fontSize: 14, color: C.secondary, marginTop: 12 }}>
          {kloelT(`Voce nao tem links de afiliado ainda`)}
        </p>
        <p style={{ fontFamily: FONT.sans, fontSize: 12, color: C.muted }}>
          {kloelT(`Use a busca abaixo para encontrar produtos para promover`)}
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
      {links.map((link) => (
        <div key={link.id}
          style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 110px 100px 160px', gap: 12, alignItems: 'center', padding: '12px 16px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 6 }}>
          <div>
            <div style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: C.text }}>{link.affiliateProduct?.productId || link.id}</div>
            <div style={{ fontFamily: FONT.mono, fontSize: 10, color: C.secondary, marginTop: 2 }}>{link.code || link.id}</div>
          </div>
          <div style={{ textAlign: 'right' as const }}>
            <div style={{ fontFamily: FONT.sans, fontSize: 10, color: C.secondary }}>{kloelT(`Cliques`)}</div>
            <div style={{ fontFamily: FONT.mono, fontSize: 14, color: C.text }}>{link.clicks || 0}</div>
          </div>
          <div style={{ textAlign: 'right' as const }}>
            <div style={{ fontFamily: FONT.sans, fontSize: 10, color: C.secondary }}>{kloelT(`Vendas`)}</div>
            <div style={{ fontFamily: FONT.mono, fontSize: 14, color: C.text }}>{link.sales || 0}</div>
          </div>
          <div style={{ textAlign: 'right' as const }}>
            <div style={{ fontFamily: FONT.sans, fontSize: 10, color: C.secondary }}>{kloelT(`Receita`)}</div>
            <div style={{ fontFamily: FONT.mono, fontSize: 13, color: C.text }}>{fmtMoney(link.revenue || 0)}</div>
          </div>
          <div style={{ textAlign: 'right' as const }}>
            <div style={{ fontFamily: FONT.sans, fontSize: 10, color: C.secondary }}>{kloelT(`Comissao`)}</div>
            <div style={{ fontFamily: FONT.mono, fontSize: 13, color: C.ember, fontWeight: 600 }}>{fmtMoney(link.commissionEarned || 0)}</div>
          </div>
          <button type="button"
            onClick={() => navigator.clipboard.writeText(buildPayUrl(`/${link.code || link.id}`, window.location.host)).catch(() => {})}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 12px', background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, color: C.secondary, fontFamily: FONT.sans, fontSize: 12, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
            {IC.copy(12)} {kloelT(`Copiar link`)}
          </button>
        </div>
      ))}
    </div>
  );
}
