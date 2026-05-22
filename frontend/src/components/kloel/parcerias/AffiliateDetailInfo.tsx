'use client';

import { kloelT } from '@/lib/i18n/t';
import { useRouter } from 'next/navigation';
import type { Affiliate } from './partnershipTypes';
import { IC } from './ParceriasView.icons';
import { C, FONT } from './ParceriasDesignTokens';

const OP_CARDS = [
  { label: 'Produtos', sub: 'Coproducoes e comissoes', route: '/products?feature=coproducoes' },
  { label: 'Vendas', sub: 'Estrategias e pipeline', route: '/vendas?tab=estrategias' },
  { label: 'Carteira', sub: 'Repasses e saque', route: '/carteira/saldo' },
];

export default function AffiliateDetailInfo({ affiliate }: { affiliate: Affiliate }) {
  const router = useRouter();
  const a = affiliate;

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <h4 style={{ fontFamily: FONT.sans, fontSize: 12, fontWeight: 600, color: C.secondary, marginBottom: 10, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>
          {kloelT(`Produtos`)}
        </h4>
        {a.products && a.products.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
            {a.products.map((p: string) => (
              <span key={p}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: FONT.sans, fontSize: 12, color: C.text }}>
                <span style={{ color: C.muted }}>{IC.box(12)}</span>
                {p}
              </span>
            ))}
          </div>
        ) : (
          <p style={{ fontFamily: FONT.sans, fontSize: 12, color: C.muted }}>{kloelT(`Nenhum produto vinculado`)}</p>
        )}
      </div>

      <div style={{ borderTop: `1px solid ${C.divider}`, paddingTop: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontFamily: FONT.sans, fontSize: 12, color: C.secondary }}>{kloelT(`Membro desde`)}</span>
          <span style={{ fontFamily: FONT.sans, fontSize: 12, color: C.text }}>{a.joined ? new Date(a.joined).toLocaleDateString('pt-BR') : '--'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontFamily: FONT.sans, fontSize: 12, color: C.secondary }}>{kloelT(`Comissao efetiva`)}</span>
          <span style={{ fontFamily: FONT.mono, fontSize: 12, color: C.ember, fontWeight: 600 }}>
            {kloelT(`R$`)} {(((a.revenue || 0) * (a.commission || 0)) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <h4 style={{ fontFamily: FONT.sans, fontSize: 12, fontWeight: 600, color: C.secondary, marginBottom: 10, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>
          {kloelT(`Operacao`)}
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {OP_CARDS.map((item) => (
            <button type="button" key={item.label} onClick={() => router.push(item.route)}
              style={{ textAlign: 'left' as const, padding: '12px 14px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer' }}>
              <div style={{ fontFamily: FONT.sans, fontSize: 12, fontWeight: 600, color: C.text }}>{item.label}</div>
              <div style={{ fontFamily: FONT.sans, fontSize: 10, color: C.secondary, marginTop: 4 }}>{item.sub}</div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
