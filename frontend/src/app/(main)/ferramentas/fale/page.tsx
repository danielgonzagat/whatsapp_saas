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
} from '@/lib/frontend-capabilities';

const TOOLS = getCapabilitiesByCategory('fale');

export default function FalePage() {
  const router = useRouter();
  const counts = getCategoryCounts('fale');
  return (
    <SectionPage
      title="Fale com seus Leads"
      icon="\u{1F4AC}"
      description={`${counts.total} capacidades de atendimento, campanhas, multicanal e comunicacao operacional`}
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
        <span style={{ fontSize: 16 }}>{'\u{1F4E2}'}</span>
        <span style={{ fontSize: 13, color: '#C9A84C', fontWeight: 500 }}>
          {counts.active} ativas, {counts.partial} parciais e {counts.planned} planejadas neste
          grupo.
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 12,
        }}
      >
        {TOOLS.map((tool) => (
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
        ))}
      </div>
    </SectionPage>
  );
}
