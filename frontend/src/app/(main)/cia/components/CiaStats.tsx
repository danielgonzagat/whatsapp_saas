'use client';

import { kloelT } from '@/lib/i18n/t';
import { Grid, StatCard } from '@/components/kloel';
import { formatCurrency } from '../utils';
import { Activity, Bot, Wallet } from 'lucide-react';

interface CiaStatsProps {
  soldAmount: number;
  activeConversations: number;
  pendingPayments: number;
}

export function CiaStats({ soldAmount, activeConversations, pendingPayments }: CiaStatsProps) {
  return (
    <Grid cols={3} gap={4}>
      <StatCard
        label={kloelT('Vendido Hoje')}
        value={formatCurrency(soldAmount)}
        icon={Wallet}
      />
      <StatCard
        label={kloelT('Conversas Ativas')}
        value={activeConversations}
        icon={Activity}
      />
      <StatCard
        label={kloelT('Pagamentos Pendentes')}
        value={pendingPayments}
        icon={Bot}
      />
    </Grid>
  );
}
