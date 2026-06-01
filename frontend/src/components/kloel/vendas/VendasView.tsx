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
  const [actionError, setActionError] = useState<string | null>(null);
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

  function requireActionSuccess<T extends { error?: string | undefined; success?: boolean | undefined }>(
    response: T,
    fallback: string,
  ): T {
    if (response.error) {
      throw new Error(response.error);
    }
    if (response.success === false) {
      throw new Error(fallback);
    }
    return response;
  }

  const resolveActionError = (error: unknown, fallback: string) =>
    error instanceof Error && error.message ? error.message : fallback;

  const runSalesAction = async (operation: () => Promise<void>, fallback: string) => {
    setActionLoading(true);
    setActionError(null);
    try {
      await operation();
    } catch (error) {
      setActionError(resolveActionError(error, fallback));
    } finally {
      setActionLoading(false);
    }
  };

  const handleRefund = async (id: string) => {
    const message = 'Não foi possível reembolsar a venda.';
    await runSalesAction(async () => {
      requireActionSuccess(await apiFetch(`/sales/${id}/refund`, { method: 'POST' }), message);
      await mutateSales();
      invalidateSales();
      setDetailId(null);
    }, message);
  };

  const handlePauseSub = async (id: string) => {
    const message = 'Não foi possível pausar a assinatura.';
    await runSalesAction(async () => {
      requireActionSuccess(
        await apiFetch(`/sales/subscriptions/${id}/pause`, { method: 'POST' }),
        message,
      );
      await mutateSubs();
      invalidateSales();
      setDetailId(null);
    }, message);
  };

  const handleResumeSub = async (id: string) => {
    const message = 'Não foi possível retomar a assinatura.';
    await runSalesAction(async () => {
      requireActionSuccess(
        await apiFetch(`/sales/subscriptions/${id}/resume`, { method: 'POST' }),
        message,
      );
      await mutateSubs();
      invalidateSales();
      setDetailId(null);
    }, message);
  };

  const handleCancelSub = async (id: string) => {
    const message = 'Não foi possível cancelar a assinatura.';
    await runSalesAction(async () => {
      requireActionSuccess(
        await apiFetch(`/sales/subscriptions/${id}/cancel`, { method: 'POST' }),
        message,
      );
      await mutateSubs();
      invalidateSales();
      setDetailId(null);
    }, message);
  };

  const handleShipOrder = async (id: string) => {
    if (!shipTrackingCode.trim()) {
      return;
    }
    const message = 'Não foi possível marcar o pedido como enviado.';
    await runSalesAction(async () => {
      requireActionSuccess(
        await apiFetch(`/sales/orders/${id}/ship`, {
          method: 'PUT',
          body: { trackingCode: shipTrackingCode },
        }),
        message,
      );
      await mutateOrders();
      invalidateSales();
      setShowShipModal(null);
      setShipTrackingCode('');
    }, message);
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
    const message = 'Não foi possível mudar o plano da assinatura.';
    await runSalesAction(async () => {
      requireActionSuccess(
        await apiFetch(`/sales/subscriptions/${id}/change-plan`, {
          method: 'PUT',
          body: { newPlanId: id, newPlanName: planName, newAmount: Number.parseFloat(amount) },
        }),
        message,
      );
      await mutateSubs();
      setDetailId(null);
    }, message);
  };

  const { returnOrder } = useReturnOrder();
  const handleReturnOrder = async (id: string) => {
    await runSalesAction(async () => {
      await returnOrder(id);
      await mutateOrders();
      setDetailId(null);
    }, 'Não foi possível solicitar devolução do pedido.');
  };

  const {
    alerts: orderAlerts,
    counts: alertCounts,
    generateAlerts,
    resolveAlert,
  } = useOrderAlerts();

  const handleGenerateAlerts = async () => {
    await runSalesAction(async () => {
      await generateAlerts();
    }, 'Não foi possível gerar alertas de pedidos.');
  };

  const handleResolveAlert = async (id: string) => {
    await runSalesAction(async () => {
      await resolveAlert(id);
    }, 'Não foi possível resolver o alerta de pedido.');
  };

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
        onGenerate={handleGenerateAlerts}
        onResolve={handleResolveAlert}
      />
      {actionError && (
        <div
          role="alert"
          aria-live="polite"
          style={{
            border: '1px solid rgba(239,68,68,0.34)',
            background: 'rgba(239,68,68,0.08)',
            color: 'var(--app-text-primary)',
            borderRadius: 6,
            padding: '10px 12px',
            marginBottom: 16,
            fontSize: 12,
            fontFamily: SORA,
          }}
        >
          {actionError}
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
