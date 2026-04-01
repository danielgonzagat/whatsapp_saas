'use client';

export const dynamic = 'force-dynamic';

import { useRouter } from 'next/navigation';
import { SectionPage } from '@/components/kloel/SectionPage';
import { ToolCard } from '@/components/kloel/ToolCard';
import { getCapabilitiesByCategory, getCapabilityBadge, getCategoryCounts, getCapabilityHref } from '@/lib/frontend-capabilities';

const TOOLS = getCapabilitiesByCategory('impulsione');

export default function ImpulsionePage() {
  const router = useRouter();
  const counts = getCategoryCounts('impulsione');
  return (
    <SectionPage
      title="Impulsione suas Vendas"
      icon="\u{1F680}"
      description={`${counts.total} capacidades para conversao, paginas, funnels e crescimento de receita`}
      back={() => router.push('/ferramentas')}
      tags={['Afiliados', 'Paginas', 'Checkout', 'Funil', 'Conteudo']}
    >
      <div style={{
        background: 'rgba(232, 93, 48, 0.06)',
        border: '1px solid rgba(232, 93, 48, 0.15)',
        borderRadius: 6,
        padding: '14px 20px',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <span style={{ fontSize: 16 }}>{'\u{1F6A7}'}</span>
        <span style={{ fontSize: 13, color: '#E85D30', fontWeight: 500 }}>
          {counts.active} ativas, {counts.partial} parciais e {counts.planned} planejadas neste grupo.
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {TOOLS.map((tool) => {
          return (
            <ToolCard
              key={tool.title}
              icon={tool.icon}
              title={tool.title}
              desc={tool.desc}
              badge={getCapabilityBadge(tool)}
              disabled={tool.status === 'planned'}
              onClick={getCapabilityHref(tool) ? () => router.push(getCapabilityHref(tool)!) : undefined}
            />
          );
        })}
      </div>
    </SectionPage>
  );
}
