'use client';

import {
  SUBINTERFACE_PILL_ROW_STYLE,
  getSubinterfacePillStyle,
} from '@/components/kloel/ui/subinterface-pill';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import {
  useOrderAlerts,
  useOrderPipeline,
  useOrderStats,
  useOrders,
  useReturnOrder,
  useSales,
  useSalesChart,
  useSalesStats,
  useSubscriptionStats,
  useSubscriptions,
} from '@/hooks/useSales';
import { useSalesPipeline } from '@/hooks/useSalesPipeline';
import { apiFetch, tokenStorage } from '@/lib/api';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { startTransition, useEffect, useRef, useState } from 'react';
import { mutate } from 'swr';

import { IC } from './VendasView.icons';
import { SORA } from './utils';
import { SmartPaymentModal } from './SmartPaymentModal';
import { DetailModal } from './DetailModal';
import { ShipModal } from './ShipModal';
import { GestaoVendas } from './GestaoVendas';
import { GestaoAssinaturas } from './GestaoAssinaturas';
import { GestaoFisicos } from './GestaoFisicos';
import { EstrategiasTab } from './EstrategiasTab';
import { OrderAlertsBanner } from './OrderAlertsBanner';
import { PipelineTab } from './PipelineTab';
import type {
  SaleItem,
  SubscriptionItem,
  OrderItem,
  SalesStatsData,
  SubStatsData,
  OrderStatsData,
  OrderPipelineData,
  PipelineStage,
} from './types';

interface VendasViewProps {
  defaultTab?: string;
}

const TABS = [
  { key: 'vendas', label: 'Gestao de Vendas', icon: IC.dollar },
  { key: 'assinaturas', label: 'Assinaturas', icon: IC.repeat },
  { key: 'fisicos', label: 'Produtos Fisicos', icon: IC.truck },
  { key: 'pipeline', label: 'Pipeline CRM', icon: IC.trend },
  { key: 'estrategias', label: 'Estrategias', icon: IC.map },
];

export function VendasView({ defaultTab = 'vendas' }: VendasViewProps) {
  const { isMobile } = useResponsiveViewport();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTab = searchParams?.get('tab');
  const workspaceId = tokenStorage.getWorkspaceId();
  const [tab, setTab] = useState(requestedTab || defaultTab);
  const prevDefaultV = useRef(defaultTab);

  useEffect(() => {
    if (prevDefaultV.current !== defaultTab) {
      queueMicrotask(() => setTab(defaultTab));
      prevDefaultV.current = defaultTab;
    }
  }, [defaultTab]);

  useEffect(() => {
    if (requestedTab && requestedTab !== tab) {
      queueMicrotask(() => setTab(requestedTab));
    }
  }, [requestedTab, tab]);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailType, setDetailType] = useState<'sale' | 'sub' | 'order'>('sale');
  const [actionLoading, setActionLoading] = useState(false);
  const [shipTrackingCode, setShipTrackingCode] = useState('');
  const [showShipModal, setShowShipModal] = useState<string | null>(null);
  const [showSmartPayment, setShowSmartPayment] = useState(false);

  const useSalesParams: { status?: string; search?: string } = {};
  if (tab === 'vendas') {
    useSalesParams.status = filterStatus;
    useSalesParams.search = search;
  }
  const { sales, mutate: mutateSales } = useSales(useSalesParams);
  const { stats: salesStats } = useSalesStats();
  const { chart } = useSalesChart();
  const { subscriptions, mutate: mutateSubs } = useSubscriptions();
  const { stats: subStats } = useSubscriptionStats();
  const { orders, mutate: mutateOrders } = useOrders();
  const { stats: orderStats } = useOrderStats();
  const { pipeline } = useOrderPipeline();
  const { stages: salesStages, isLoading: salesPipelineLoading } = useSalesPipeline();

  const handleTabChange = (newTab: string) => {
    setTab(newTab);
    setFilterStatus('todos');
    setSearch('');
    const routes: Record<string, string> = {
      vendas: '/vendas',
      assinaturas: '/vendas/assinaturas',
      fisicos: '/vendas/fisicos',
      pipeline: '/vendas/pipeline',
      estrategias: '/vendas?tab=estrategias',
    };
    const nextRoute = routes[newTab] || '/vendas';
    const currentRoute = `${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ''}`;
    if (currentRoute === nextRoute) {
      return;
    }
    startTransition(() => {
      router.push(nextRoute);
    });
  };

  const openDetail = (id: string, type: 'sale' | 'sub' | 'order') => {
    setDetailId(id);
    setDetailType(type);
  };

  const invalidateSales = () =>
    mutate((key: string) => typeof key === 'string' && key.startsWith('/sales'));

  const handleRefund = async (id: string) => {
    setActionLoading(true);
    await apiFetch(`/sales/${id}/refund`, { method: 'POST' });
    await mutateSales();
    invalidateSales();
    setActionLoading(false);
    setDetailId(null);
  };

  const handlePauseSub = async (id: string) => {
    setActionLoading(true);
    await apiFetch(`/sales/subscriptions/${id}/pause`, { method: 'POST' });
    await mutateSubs();
    invalidateSales();
    setActionLoading(false);
    setDetailId(null);
  };

  const handleResumeSub = async (id: string) => {
    setActionLoading(true);
    await apiFetch(`/sales/subscriptions/${id}/resume`, { method: 'POST' });
    await mutateSubs();
    invalidateSales();
    setActionLoading(false);
    setDetailId(null);
  };

  const handleCancelSub = async (id: string) => {
    setActionLoading(true);
    await apiFetch(`/sales/subscriptions/${id}/cancel`, { method: 'POST' });
    await mutateSubs();
    invalidateSales();
    setActionLoading(false);
    setDetailId(null);
  };

  const handleShipOrder = async (id: string) => {
    if (!shipTrackingCode.trim()) {
      return;
    }
    setActionLoading(true);
    await apiFetch(`/sales/orders/${id}/ship`, {
      method: 'PUT',
      body: { trackingCode: shipTrackingCode },
    });
    await mutateOrders();
    invalidateSales();
    setActionLoading(false);
    setShowShipModal(null);
    setShipTrackingCode('');
  };

  const handleChangePlan = async (id: string) => {
    const planName = prompt('Nome do novo plano:');
    if (!planName) {
      return;
    }
    const amount = prompt('Valor do novo plano (ex: 97.00):');
    if (!amount) {
      return;
    }
    setActionLoading(true);
    await apiFetch(`/sales/subscriptions/${id}/change-plan`, {
      method: 'PUT',
      body: { newPlanId: id, newPlanName: planName, newAmount: Number.parseFloat(amount) },
    });
    await mutateSubs();
    setActionLoading(false);
    setDetailId(null);
  };

  const { returnOrder } = useReturnOrder();
  const handleReturnOrder = async (id: string) => {
    setActionLoading(true);
    await returnOrder(id);
    await mutateOrders();
    setActionLoading(false);
    setDetailId(null);
  };

  const {
    alerts: orderAlerts,
    counts: alertCounts,
    generateAlerts,
    resolveAlert,
  } = useOrderAlerts();

  const estrategiasTabContent = (
    <EstrategiasTab
      isMobile={isMobile}
      salesStats={salesStats as SalesStatsData}
      subStats={subStats as SubStatsData}
      orderStats={orderStats as OrderStatsData}
      orderAlertsCount={orderAlerts.length}
      alertCounts={alertCounts}
      salesStages={salesStages as PipelineStage[]}
      onNavigate={(route) => router.push(route)}
      onTabChange={handleTabChange}
      onShowSmartPayment={() => setShowSmartPayment(true)}
    />
  );

  return (
    <div
      data-testid="sales-view-root"
      style={{
        background: 'var(--app-bg-primary)',
        minHeight: '100vh',
        fontFamily: SORA,
        color: 'var(--app-text-primary)',
        padding: isMobile ? 16 : 24,
      }}
    >
      <DetailModal
        detailId={detailId}
        detailType={detailType}
        sales={sales as SaleItem[]}
        subscriptions={subscriptions as SubscriptionItem[]}
        orders={orders as OrderItem[]}
        onClose={() => setDetailId(null)}
        onRefund={handleRefund}
        onPauseSub={handlePauseSub}
        onResumeSub={handleResumeSub}
        onCancelSub={handleCancelSub}
        onChangePlan={handleChangePlan}
        onOpenShipModal={(id) => setShowShipModal(id)}
        onReturnOrder={handleReturnOrder}
        actionLoading={actionLoading}
      />
      <ShipModal
        showShipModal={showShipModal}
        onClose={() => setShowShipModal(null)}
        shipTrackingCode={shipTrackingCode}
        onTrackingCodeChange={setShipTrackingCode}
        onShipOrder={handleShipOrder}
        actionLoading={actionLoading}
      />
      {showSmartPayment && (
        <SmartPaymentModal workspaceId={workspaceId} onClose={() => setShowSmartPayment(false)} />
      )}

      <OrderAlertsBanner
        alerts={orderAlerts}
        alertCounts={alertCounts}
        onGenerate={() => generateAlerts()}
        onResolve={resolveAlert}
      />

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
        {tab === 'vendas' && (
          <GestaoVendas
            salesStats={salesStats as SalesStatsData}
            chart={chart}
            search={search}
            onSearchChange={setSearch}
            filterStatus={filterStatus}
            onFilterStatusChange={setFilterStatus}
            sales={sales as SaleItem[]}
            onOpenDetail={openDetail}
          />
        )}
        {tab === 'assinaturas' && (
          <GestaoAssinaturas
            subStats={subStats as SubStatsData}
            subscriptions={subscriptions as SubscriptionItem[]}
            onOpenDetail={openDetail}
          />
        )}
        {tab === 'fisicos' && (
          <GestaoFisicos
            orderStats={orderStats as OrderStatsData}
            pipeline={pipeline as OrderPipelineData}
            orders={orders as OrderItem[]}
            onOpenDetail={openDetail}
          />
        )}
        {tab === 'estrategias' && estrategiasTabContent}
        {tab === 'pipeline' && (
          <PipelineTab stages={salesStages as PipelineStage[]} isLoading={salesPipelineLoading} />
        )}
      </div>
    </div>
  );
}
