'use client';

import { useEffect, useState } from 'react';
import { kloelT } from '@/lib/i18n/t';

import { partnershipsApi } from '@/lib/api/partnerships';
import type { Affiliate, AffiliatePerformance } from './partnershipTypes';
import { IC } from './ParceriasView.icons';
import { C, FONT } from './ParceriasDesignTokens';
import AffiliateProfileCard from './AffiliateProfileCard';
import AffiliateMetricsGrid from './AffiliateMetricsGrid';
import AffiliatePerformanceChart from './AffiliatePerformanceChart';
import AffiliateDetailInfo from './AffiliateDetailInfo';

export default function AffiliateDetailSheet({
  affiliate,
  onClose,
  onChat,
  onRevoke,
}: {
  affiliate: Affiliate;
  onClose: () => void;
  onChat: () => void;
  onRevoke: () => void;
}) {
  const a = affiliate || ({} as Affiliate);
  const [perfData, setPerfData] = useState<AffiliatePerformance | null>(null);
  const [perfLoading, setPerfLoading] = useState(false);

  useEffect(() => {
    if (!a.id) return;
    setPerfLoading(true);
    partnershipsApi
      .affiliatePerformance(a.id)
      .then((res) => { if (!res.error && res.data) setPerfData(res.data); })
      .catch(() => {})
      .finally(() => setPerfLoading(false));
  }, [a.id]);

  const handleCopyLink = () => {
    navigator.clipboard
      .writeText(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://kloel.com'}/ref/${a.id || 'unknown'}`)
      .catch(() => {});
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <button type="button" aria-label="Fechar modal" onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', border: 'none', padding: 0, cursor: 'pointer' }} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 560, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: 28, maxHeight: '85vh', overflowY: 'auto' as const, animation: 'slideIn 200ms ease' }}>
        <button type="button" onClick={onClose}
          style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
          <span style={{ color: C.secondary }}>{IC.x(16)}</span>
        </button>

        <AffiliateProfileCard affiliate={a} />
        <AffiliateMetricsGrid affiliate={a} perfData={perfData} loading={perfLoading} />
        <AffiliatePerformanceChart affiliate={a} perfData={perfData} />
        <AffiliateDetailInfo affiliate={a} />

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onChat}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 16px', background: C.ember, border: 'none', borderRadius: 6, color: '#fff', fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <span style={{ color: '#fff' }}>{IC.chat(14)}</span>
            {kloelT(`Abrir chat`)}
          </button>
          <button type="button" onClick={handleCopyLink}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 16px', background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: FONT.sans, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            <span style={{ color: C.secondary }}>{IC.copy(14)}</span>
            {kloelT(`Copiar link`)}
          </button>
          <button type="button" onClick={onRevoke}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 16px', background: 'none', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, color: '#EF4444', fontFamily: FONT.sans, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            <span style={{ color: '#EF4444' }}>{IC.ban(14)}</span>
            {kloelT(`Revogar`)}
          </button>
        </div>
      </div>
    </div>
  );
}
