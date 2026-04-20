'use client';

import { kloelT } from '@/lib/i18n/t';
/** Dynamic. */
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

const TOOLS = getCapabilitiesByCategory('fale');

/** Fale page. */
export default function FalePage() {
  const router = useRouter();
  const counts = getCategoryCounts('fale');
  const { live, roadmap } = partitionCapabilities(TOOLS);
  return (
    <SectionPage
      title={kloelT(`Fale com seus Leads`)}
      icon={kloelT(`\\u2709`)}
      description={`${counts.active} capacidades operacionais de atendimento, campanhas, multicanal e comunicacao`}
      back={() => router.push('/ferramentas')}
      tags={['Inbox', 'WhatsApp', 'Email', 'IA', 'Multicanal']}
    >
      <div
        style={{
          background: 'rgba(201, 168, 76, 0.06)',
          border: '1px solid rgba(201, 168, 76, 0.15)',
          borderRadius: 6,
          padding: '14px 20px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span style={{ fontSize: 16 }}>{'\u25B6'}</span>
        <span style={{ fontSize: 13, color: '#C9A84C', fontWeight: 500 }}>
          {counts.active} {kloelT(`operacionais agora`)}
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
          const href = getCapabilityHref(tool);
          return (
            <ToolCard
              key={tool.title}
              icon={tool.icon}
              title={tool.title}
              desc={tool.desc}
              badge={getCapabilityBadge(tool)}
              onClick={href ? () => router.push(href) : undefined}
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
            {kloelT(`Roadmap relacionado`)}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 12,
            }}
          >
            {roadmap.map((tool) => {
              const href = getCapabilityHref(tool);
              return (
                <ToolCard
                  key={tool.title}
                  icon={tool.icon}
                  title={tool.title}
                  desc={tool.desc}
                  badge={getCapabilityBadge(tool)}
                  onClick={href ? () => router.push(href) : undefined}
                />
              );
            })}
          </div>
        </div>
      ) : null}
    </SectionPage>
  );
}
