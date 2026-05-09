'use client';

import { useState } from 'react';
import { useCollaborators } from '@/hooks/usePartnerships';
import type { Agent } from './partnershipTypes';
import { C } from './ParceriasDesignTokens';
import ColaboratorStatsSummary from './ColaboratorStatsSummary';
import ColaboratorSearchToolbar from './ColaboratorSearchToolbar';
import ColaboratorList from './ColaboratorList';

export default function ColaboratorRoster({
  setShowInviteModal,
}: {
  setShowInviteModal: (v: boolean) => void;
}) {
  const [search, setSearch] = useState('');
  const { agents } = useCollaborators();
  const displayAgents = agents as Agent[];

  const filtered = displayAgents.filter((c) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (c.name || '').toLowerCase().includes(term) || (c.email || '').toLowerCase().includes(term);
  });

  return (
    <div style={{ animation: 'fadeIn 300ms ease' }}>
      <ColaboratorStatsSummary />
      <ColaboratorSearchToolbar search={search} setSearch={setSearch} onInvite={() => setShowInviteModal(true)} />
      <ColaboratorList filtered={filtered} hasData={displayAgents.length > 0} />
    </div>
  );
}
