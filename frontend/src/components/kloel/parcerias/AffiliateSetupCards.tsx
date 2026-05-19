'use client';

import { useRouter } from 'next/navigation';
import { C, FONT } from './ParceriasDesignTokens';

const SETUP_CARDS = [
  { title: 'Ativar coproducoes', desc: 'Configure reparticao e alinhamento comercial no produto certo.', cta: 'Abrir Produtos', route: '/products?feature=coproducoes' },
  { title: 'Revisar estrategia', desc: 'Use Vendas para enxergar o impacto comercial das parcerias.', cta: 'Abrir Vendas', route: '/vendas?tab=estrategias' },
  { title: 'Acompanhar repasses', desc: 'Visualize saldo, saque e antecipacao do que entrou via parceiros.', cta: 'Abrir Carteira', route: '/carteira/saldo' },
  { title: 'Ajustar banco e billing', desc: 'Garanta conta destino e configuracao de repasse antes de escalar.', cta: 'Abrir Configuracoes', route: '/settings?section=bank' },
];

export default function AffiliateSetupCards() {
  const router = useRouter();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
      {SETUP_CARDS.map((card) => (
        <div key={card.title} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '16px 16px 14px' }}>
          <div style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6 }}>{card.title}</div>
          <div style={{ fontFamily: FONT.sans, fontSize: 11, color: C.secondary, lineHeight: 1.5, minHeight: 34 }}>{card.desc}</div>
          <button type="button" onClick={() => router.push(card.route)}
            style={{ marginTop: 12, padding: '8px 14px', background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: FONT.sans, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            {card.cta}
          </button>
        </div>
      ))}
    </div>
  );
}
