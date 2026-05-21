'use client';

import { kloelT } from '@/lib/i18n/t';
import { useAffiliates, useAffiliateStats } from '@/hooks/usePartnerships';
import type { Affiliate } from './partnershipTypes';
import { IC } from './ParceriasView.icons';
import { C, FONT } from './ParceriasDesignTokens';

function StatCard({ label, value, icon, iconColor }: { label: string; value: string | number; icon: React.ReactElement; iconColor?: string }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '18px 16px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: FONT.sans, fontSize: 11, color: C.secondary, fontWeight: 500 }}>{label}</span>
        <span style={{ color: iconColor || C.muted }}>{icon}</span>
      </div>
      <span style={{ fontFamily: FONT.mono, fontSize: 22, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
        {value}
      </span>
    </div>
  );
}

export default function AffiliateStatsSummary() {
  const { affiliates } = useAffiliates({});
  const { stats: affStats } = useAffiliateStats();
  const displayAffiliates = affiliates as Affiliate[];

  const activeAffiliates = affStats?.activeAffiliates || displayAffiliates.filter((a) => a.status === 'active' && a.type === 'affiliate').length;
  const producers = affStats?.producers || displayAffiliates.filter((a) => a.type === 'producer').length;
  const totalRevenue = affStats?.totalRevenue || displayAffiliates.reduce((sum, a) => sum + (a.revenue || 0), 0);
  const totalCommissions = affStats?.totalCommissions || displayAffiliates.reduce((sum, a) => sum + ((a.revenue || 0) * (a.commission || 0)) / 100, 0);
  const topPartner =
    affStats?.topPartner ||
    (displayAffiliates.reduce<Affiliate | null>((top, a) => (!top || (a.revenue || 0) > (top.revenue || 0) ? a : top), null)?.name) ||
    null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 24 }}>
      <StatCard label={kloelT(`Afiliados Ativos`)} value={activeAffiliates} icon={IC.users(14)} />
      <StatCard label={kloelT(`Produtores`)} value={producers} icon={IC.shield(14)} />
      <StatCard
        label={kloelT(`Receita Total`)}
        value={`${kloelT(`R$`)} ${Number(totalRevenue).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`}
        icon={IC.trend(14)}
        iconColor={C.ember}
      />
      <StatCard
        label={kloelT(`Comissoes Pagas`)}
        value={`${kloelT(`R$`)} ${Number(totalCommissions).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`}
        icon={IC.dollar(14)}
        iconColor={C.ember}
      />
      <StatCard
        label={kloelT(`Top Parceiro`)}
        value={topPartner || '--'}
        icon={IC.star(14)}
        iconColor={C.ember}
      />
    </div>
  );
}
