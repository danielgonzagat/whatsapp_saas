'use client';

export const dynamic = 'force-dynamic';

import { SectionPage } from '@/components/kloel/SectionPage';
import { ToolCard } from '@/components/kloel/ToolCard';
import {
  getCapabilitiesByCategory,
  getCapabilityBadge,
  getCapabilityHref,
  getCategoryCounts,
  partitionCapabilities,
} from '@/lib/frontend-capabilities';
import { useRouter } from 'next/navigation';

const TOOLS = getCapabilitiesByCategory('gerencie');

export default function GerenciePage() {
  const router = useRouter();
  const counts = getCategoryCounts('gerencie');
  const { live, roadmap } = partitionCapabilities(TOOLS);
  return (
    <SectionPage
      title="Gerencie seu Negocio"
      icon="\u{2699}\u{FE0F}"
      description={`${counts.active} capacidades operacionais para pagamento, equipe, operacao, video e controle do negocio`}
      back={() => router.push('/ferramentas')}
      tags={['Pagamento', 'Equipe', 'Relatorios', 'Rastreamento', 'Integracao']}
    >
      <div
        style={{
          background: 'rgba(232, 93, 48, 0.06)',
          border: '1px solid rgba(232, 93, 48, 0.15)',
          borderRadius: 6,
          padding: '14px 20px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span style={{ fontSize: 16 }}>{'\u2022'}</span>
        <span style={{ fontSize: 13, color: '#E85D30', fontWeight: 500 }}>
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
        {live.map((tool) => {
          return (
            <ToolCard
              key={tool.title}
              icon={tool.icon}
              title={tool.title}
              desc={tool.desc}
              badge={getCapabilityBadge(tool)}
              disabled={tool.status === 'planned'}
              onClick={
                getCapabilityHref(tool) ? () => router.push(getCapabilityHref(tool)!) : undefined
              }
            />
          );
        })}
      </div>

      {roadmap.length > 0 ? (
        <div style={{ marginTop: 28 }}>
          <div
            style={{
              fontSize: 11,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--app-text-secondary)',
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
