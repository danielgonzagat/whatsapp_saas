'use client';

import { useState } from 'react';
import { useAffiliates, revokeAffiliate } from '@/hooks/usePartnerships';
import type { Affiliate } from './partnershipTypes';
import AffiliateSetupCards from './AffiliateSetupCards';
import AffiliateStatsSummary from './AffiliateStatsSummary';
import AffiliateFilterToolbar from './AffiliateFilterToolbar';
import AffiliateList from './AffiliateList';
import AffiliateDetailSheet from './AffiliateDetailSheet';
import AffiliateLinkManager from './AffiliateLinkManager';

export default function AffiliateDirectory({
  setShowAffiliateInviteModal,
}: {
  setShowAffiliateInviteModal: (value: boolean) => void;
}) {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('todos');
  const [detailId, setDetailId] = useState<string | null>(null);

  const { affiliates, mutate: mutateAffiliates } = useAffiliates({ type: filterType, search });
  const displayAffiliates = affiliates as Affiliate[];

  const filtered = displayAffiliates.filter((a) => {
    if (filterType !== 'todos' && a.type !== filterType) {return false;}
    if (search) {
      const term = search.toLowerCase();
      return (a.name || '').toLowerCase().includes(term) || (a.email || '').toLowerCase().includes(term);
    }
    return true;
  });

  const detailAffiliate = detailId ? displayAffiliates.find((a) => a.id === detailId) : null;

  const handleRevoke = async (id: string) => {
    try {
      await revokeAffiliate(id);
      mutateAffiliates();
      setDetailId(null);
    } catch (e) {
      console.error('Failed to revoke', e);
    }
  };

  return (
    <div style={{ animation: 'fadeIn 300ms ease' }}>
      <AffiliateSetupCards />
      <AffiliateStatsSummary />
      <AffiliateFilterToolbar
        filterType={filterType} setFilterType={setFilterType}
        search={search} setSearch={setSearch}
        onInvite={() => setShowAffiliateInviteModal(true)}
      />
      <AffiliateList filtered={filtered} hasData={displayAffiliates.length > 0} onSelect={setDetailId} />
      <AffiliateLinkManager />

      {detailId && detailAffiliate && (
        <AffiliateDetailSheet
          affiliate={detailAffiliate}
          onClose={() => setDetailId(null)}
          onChat={() => setDetailId(null)}
          onRevoke={() => handleRevoke(detailId)}
        />
      )}
    </div>
  );
}
