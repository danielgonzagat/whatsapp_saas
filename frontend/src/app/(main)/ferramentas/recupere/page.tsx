'use client';

export const dynamic = 'force-dynamic';

import { useRouter } from 'next/navigation';
import { SectionPage } from '@/components/kloel/SectionPage';
import { ToolCard } from '@/components/kloel/ToolCard';
import { getCapabilitiesByCategory, getCapabilityBadge, getCategoryCounts } from '@/lib/frontend-capabilities';

const TOOLS = getCapabilitiesByCategory('recupere');

export default function RecuperePage() {
  const router = useRouter();
  const counts = getCategoryCounts('recupere');
  const handleToolClick = (route?: string, title?: string, planned?: boolean) => {
    if (route) {
      router.push(route);
      return;
    }
    if (planned && title) {
      router.push(`/ferramentas/em-breve?tool=${encodeURIComponent(title)}`);
    }
  };

  return (
    <SectionPage
      title="Recupere Vendas"
      icon="\u{1F504}"
      description={`${counts.total} capacidades para recuperar carrinhos, leads frios e conversoes perdidas`}
      back={() => router.push('/ferramentas')}
      tags={['Carrinho', 'Leads', 'Retorno', 'Fluxos', 'Conversao']}
    >
      <div style={{
        background: 'rgba(45, 212, 160, 0.06)',
        border: '1px solid rgba(45, 212, 160, 0.15)',
        borderRadius: 6,
        padding: '14px 20px',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <span style={{ fontSize: 16 }}>{'\u{1F501}'}</span>
        <span style={{ fontSize: 13, color: '#2DD4A0', fontWeight: 500 }}>
          {counts.active} ativas, {counts.partial} parciais e {counts.planned} planejadas neste grupo.
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {TOOLS.map((tool) => (
          <ToolCard
            key={tool.title}
            icon={tool.icon}
              title={tool.title}
              desc={tool.desc}
              badge={getCapabilityBadge(tool)}
              disabled={tool.status === 'planned'}
              onClick={tool.route || tool.status === 'planned' ? () => handleToolClick(tool.route, tool.title, tool.status === 'planned') : undefined}
            />
        ))}
      </div>
    </SectionPage>
  );
}
