'use client';

import {
  SUBINTERFACE_PILL_ROW_STYLE,
  getSubinterfacePillStyle,
} from '@/components/kloel/ui/subinterface-pill';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import {
  useWalletAnticipations,
  useWalletBalance,
  useWalletChart,
  useWalletMonthly,
  useWalletTransactions,
  useWalletWithdrawals,
} from '@/hooks/useWallet';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  renderWalletPulseKeyframes,
  WALLET_SELECTION_STYLE,
} from './carteira/carteira.helpers';
import type {
  AnticipationItem,
  RawTransaction,
  WithdrawalItem,
} from './carteira/carteira.types';
import { IC } from './carteira/carteira.config';
import CarteiraSaldoCard from './carteira/CarteiraSaldoCard';
import CarteiraExtratoTable from './carteira/CarteiraExtratoTable';
import CarteiraSaque from './carteira/CarteiraSaque';
import { CarteiraWithdrawModal } from './carteira/CarteiraWithdrawModal';
import { CarteiraAntecipateModal } from './carteira/CarteiraAntecipateModal';
import { CarteiraTabAntecipacoes } from './carteira/CarteiraTabAntecipacoes';

/*
  KLOEL — CARTEIRA
  "Cada centavo que entra. Cada centavo que sai. Tudo visivel."
*/

export default function KloelCarteira({ defaultTab = 'saldo' }: { defaultTab?: string }) {
  const { isMobile } = useResponsiveViewport();
  const pathname = usePathname();
  const routes: Record<string, string> = {
    saldo: '/carteira/saldo',
    extrato: '/carteira/extrato',
    saques: '/carteira/saques',
    antecipacoes: '/carteira/antecipacoes',
  };
  const pathTab = Object.entries(routes).find(([, route]) => pathname === route)?.[0];
  const resolvedDefaultTab = pathTab ?? (defaultTab === 'movimentacoes' ? 'extrato' : defaultTab);

  const {
    balance: realBalance,
    isLoading: balanceLoading,
    mutate: mutateBalance,
  } = useWalletBalance();
  const { transactions: realTransactions, mutate: mutateTransactions } = useWalletTransactions();
  const { chart: realChart } = useWalletChart();
  useWalletMonthly();
  const { withdrawals: realWithdrawals, mutate: mutateWithdrawals } = useWalletWithdrawals();
  const { anticipations: realAnticipations, totals: realAntTotals } = useWalletAnticipations();

  const bal =
    realBalance && realBalance.available !== undefined
      ? {
          available: realBalance.available ?? 0,
          pending: realBalance.pending ?? 0,
          blocked: realBalance.blocked ?? realBalance.locked ?? 0,
          total:
            realBalance.total ??
            (realBalance.available ?? 0) + (realBalance.pending ?? 0) + (realBalance.blocked ?? 0),
        }
      : { available: 0, pending: 0, blocked: 0, total: 0 };

  const txList =
    realTransactions && realTransactions.length > 0
      ? (realTransactions as RawTransaction[]).map((t) => ({
          id: t.id,
          type: t.type || 'sale',
          desc: t.description || t.desc || '',
          amount: t.amount,
          status: t.status || 'completed',
          method: t.method || '—',
          date: new Date(t.createdAt).toLocaleDateString('pt-BR'),
          time: new Date(t.createdAt).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          fee: t.fee || 0,
        }))
      : [];

  const [tab, setTab] = useState(resolvedDefaultTab);
  const [lastDefaultTab, setLastDefaultTab] = useState(resolvedDefaultTab);
  // Follow the `defaultTab` prop and canonical wallet tab paths while still allowing
  // local tab switches. Render-time sync avoids an extra effect/render cascade.
  if (resolvedDefaultTab !== lastDefaultTab) {
    setLastDefaultTab(resolvedDefaultTab);
    setTab(resolvedDefaultTab);
  }
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('todos');
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showAntecipateModal, setShowAntecipateModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');

  function handleTabChange(newTab: string) {
    setTab(newTab);
    setFilterType('todos');
    setSearch('');
    const nextRoute = routes[newTab] || '/carteira';
    if (pathname === nextRoute) {
      return;
    }
    window.history.pushState(null, '', nextRoute);
  }

  const TABS = [
    { key: 'saldo', label: 'Saldo', icon: IC.wallet },
    { key: 'extrato', label: 'Extrato', icon: IC.calendar },
    { key: 'saques', label: 'Saques', icon: IC.upload },
    { key: 'antecipacoes', label: 'Antecipações', icon: IC.spark },
  ];

  return (
    <div
      data-testid="wallet-view-root"
      style={{
        background: 'var(--app-bg-primary)',
        minHeight: '100vh',
        fontFamily: "'Sora',sans-serif",
        color: 'var(--app-text-primary)',
        padding: isMobile ? 16 : 24,
      }}
    >
      <style>{WALLET_SELECTION_STYLE}</style>

      {showWithdrawModal && (
        <CarteiraWithdrawModal
          open
          onClose={() => setShowWithdrawModal(false)}
          available={bal.available}
          withdrawAmount={withdrawAmount}
          onWithdrawAmountChange={setWithdrawAmount}
          onSuccess={() => {
            mutateBalance();
            mutateTransactions();
            mutateWithdrawals();
          }}
        />
      )}
      {showAntecipateModal && (
        <CarteiraAntecipateModal
          open
          onClose={() => setShowAntecipateModal(false)}
          pending={bal.pending}
        />
      )}

      <style>{renderWalletPulseKeyframes()}</style>

      {balanceLoading && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, 1fr)',
            gap: 12,
            marginBottom: 24,
          }}
        >
          {['saldo', 'receita', 'saques', 'pendente'].map((cardKey) => (
            <div
              key={`skeleton-card-${cardKey}`}
              style={{
                background: 'var(--app-bg-card)',
                border: '1px solid var(--app-border-primary)',
                borderRadius: 6,
                padding: 18,
              }}
            >
              <div
                style={{
                  width: '60%',
                  height: 10,
                  background: 'var(--app-bg-secondary)',
                  borderRadius: 4,
                  marginBottom: 12,
                  animation: 'kloel-pulse 1.5s ease-in-out infinite',
                }}
              />
              <div
                style={{
                  width: '40%',
                  height: 22,
                  background: 'var(--app-bg-secondary)',
                  borderRadius: 4,
                  animation: 'kloel-pulse 1.5s ease-in-out infinite',
                }}
              />
            </div>
          ))}
        </div>
      )}

      <div style={SUBINTERFACE_PILL_ROW_STYLE}>
        {TABS.map((t) => (
          <button
            type="button"
            key={t.key}
            onClick={() => handleTabChange(t.key)}
            style={getSubinterfacePillStyle(tab === t.key, isMobile)}
          >
            <span style={{ display: 'flex', alignItems: 'center' }}>{t.icon(14)}</span>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        {tab === 'saldo' && !balanceLoading && (
          <CarteiraSaldoCard
            bal={bal}
            revenueChart={realChart}
            txList={txList}
            onOpenWithdraw={() => setShowWithdrawModal(true)}
            onOpenAntecipate={() => setShowAntecipateModal(true)}
            onNavigateExtrato={() => handleTabChange('extrato')}
          />
        )}
        {tab === 'extrato' && (
          <CarteiraExtratoTable
            txList={txList}
            filterType={filterType}
            onFilterTypeChange={setFilterType}
            search={search}
            onSearchChange={setSearch}
          />
        )}
        {tab === 'saques' && (
          <CarteiraSaque
            available={bal.available}
            onOpenWithdraw={() => setShowWithdrawModal(true)}
            withdrawals={realWithdrawals as WithdrawalItem[]}
          />
        )}
        {tab === 'antecipacoes' && (
          <CarteiraTabAntecipacoes
            pending={bal.pending}
            onOpenAntecipate={() => setShowAntecipateModal(true)}
            anticipations={realAnticipations as AnticipationItem[]}
            antTotals={realAntTotals}
          />
        )}
      </div>
    </div>
  );
}
