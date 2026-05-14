'use client';
import { colors } from '@/lib/design-tokens';

import { kloelT } from '@/lib/i18n/t';
import { useCollaborators, useCollaboratorStats } from '@/hooks/usePartnerships';
import type { Agent, Invite } from './partnershipTypes';
import { IC } from './ParceriasView.icons';
import { C, FONT } from './ParceriasDesignTokens';

export default function ColaboratorStatsSummary() {
  const { agents, invites } = useCollaborators();
  const { stats } = useCollaboratorStats();
  const displayAgents = agents as Agent[];

  const total = stats?.total || displayAgents.length;
  const online = stats?.online || displayAgents.filter((a) => a.status === 'online').length;
  const pendingInvites = stats?.pendingInvites || (invites as Invite[]).length || 0;
  const rolesUsed = [...new Set(displayAgents.map((a) => a.role))].length;

  const cards = Object.freeze([
    { label: kloelT(`Total Colaboradores`), value: total, icon: IC.users(16), iconStyle: { color: C.muted } },
    { label: kloelT(`Online Agora`), value: online, icon: <div style={{ width: 8, height: 8, borderRadius: '16%', background: colors.semantic.success }} />, iconStyle: {} },
    { label: kloelT(`Convites Pendentes`), value: pendingInvites, icon: IC.mail(16), iconStyle: { color: C.muted } },
    { label: kloelT(`Funcoes Ativas`), value: rolesUsed, icon: IC.shield(16), iconStyle: { color: C.muted } },
  ]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
      {cards.map((card, i) => (
        <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '20px 20px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: FONT.sans, fontSize: 12, color: C.secondary, fontWeight: 500 }}>{card.label}</span>
            <span style={card.iconStyle}>{card.icon}</span>
          </div>
          <span style={{ fontFamily: FONT.mono, fontSize: 24, fontWeight: 700, color: C.text, letterSpacing: '-0.02em' }}>{card.value}</span>
          {i === 1 ? <span style={{ fontFamily: FONT.sans, fontSize: 11, color: C.muted }}>{kloelT(`ativos no momento`)}</span> : null}
        </div>
      ))}
    </div>
  );
}
