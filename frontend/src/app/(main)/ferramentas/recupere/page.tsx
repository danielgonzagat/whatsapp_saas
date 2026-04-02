'use client';

export const dynamic = 'force-dynamic';

import { useRouter } from 'next/navigation';
import { SectionPage } from '@/components/kloel/SectionPage';
import { ToolCard } from '@/components/kloel/ToolCard';
import {
  getCapabilitiesByCategory,
  getCapabilityBadge,
  getCategoryCounts,
  getCapabilityHref,
  partitionCapabilities,
} from '@/lib/frontend-capabilities';

const TOOLS = getCapabilitiesByCategory('recupere');

export default function RecuperePage() {
  const router = useRouter();
  const counts = getCategoryCounts('recupere');
  const { live, roadmap } = partitionCapabilities(TOOLS);
  return (
    <SectionPage
      title="Recupere Vendas"
      icon="\u21BB"
      description={`${counts.active} capacidades operacionais para recuperar carrinhos, leads frios e conversoes perdidas`}
      back={() => router.push('/ferramentas')}
      tags={['Carrinho', 'Leads', 'Retorno', 'Fluxos', 'Conversao']}
    >
      <div
        style={{
          background: 'rgba(45, 212, 160, 0.06)',
          border: '1px solid rgba(45, 212, 160, 0.15)',
          borderRadius: 6,
          padding: '14px 20px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span style={{ fontSize: 16 }}>{'\u21BB'}</span>
        <span style={{ fontSize: 13, color: '#2DD4A0', fontWeight: 500 }}>
          {counts.active} operacionais agora
          {counts.planned ? ` • ${counts.planned} em roadmap controlado` : ''}.
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 12,
        }}
      >
        {live.map((tool) => (
          <ToolCard
            key={tool.title}
            icon={tool.icon}
            title={tool.title}
            desc={tool.desc}
            badge={getCapabilityBadge(tool)}
            onClick={
              getCapabilityHref(tool) ? () => router.push(getCapabilityHref(tool)!) : undefined
            }
          />
        ))}
      </div>

      {roadmap.length > 0 ? (
        <div style={{ marginTop: 28 }}>
          <div
            style={{
              fontSize: 11,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: '#6E6E73',
              marginBottom: 12,
            }}
          >
            Roadmap relacionado
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 12,
            }}
          >
            {roadmap.map((tool) => (
              <ToolCard
                key={tool.title}
                icon={tool.icon}
                title={tool.title}
                desc={tool.desc}
                badge={getCapabilityBadge(tool)}
                onClick={
                  getCapabilityHref(tool) ? () => router.push(getCapabilityHref(tool)!) : undefined
                }
              />
            ))}
          </div>
        </div>
      ) : null}
    </SectionPage>
  );
}
