'use client';

import { useCollaborators, useCollaboratorStats } from '@/hooks/usePartnerships';
import type { Agent } from './partnershipTypes';
import { C, FONT } from './ParceriasDesignTokens';
import { buildCollaboratorStatCards } from './ColaboratorStatsSummary.helpers';

function isAgent(candidate: unknown): candidate is Agent {
  if (typeof candidate !== 'object' || candidate === null) {
    return false;
  }
  const agent = candidate as Partial<Record<keyof Agent, unknown>>;
  return typeof agent.status === 'string' && typeof agent.role === 'string';
}

export default function ColaboratorStatsSummary() {
  const { agents, invites } = useCollaborators();
  const { stats } = useCollaboratorStats();
  const displayAgents = agents.filter(isAgent);

  const total = stats?.total || displayAgents.length;
  const online = stats?.online || displayAgents.filter((a) => a.status === 'online').length;
  const pendingInvites = stats?.pendingInvites || invites.length || 0;
  const rolesUsed = [...new Set(displayAgents.map((a) => a.role))].length;

  const cards = buildCollaboratorStatCards({ online, pendingInvites, rolesUsed, total });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
      {cards.map((card) => (
        <div key={card.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '20px 20px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: FONT.sans, fontSize: 12, color: C.secondary, fontWeight: 500 }}>{card.label}</span>
            <span style={card.iconStyle}>{card.icon}</span>
          </div>
          <span style={{ fontFamily: FONT.mono, fontSize: 24, fontWeight: 700, color: C.text, letterSpacing: '-0.02em' }}>{card.value}</span>
          {card.helperText ? <span style={{ fontFamily: FONT.sans, fontSize: 11, color: C.muted }}>{card.helperText}</span> : null}
        </div>
      ))}
    </div>
  );
}
