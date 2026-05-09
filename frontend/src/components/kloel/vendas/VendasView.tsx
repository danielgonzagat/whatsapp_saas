'use client';

import { kloelT } from '@/lib/i18n/t';
import CRMPipelineView from '@/components/kloel/crm/CRMPipelineView';
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
import type {
  SaleItem,
  SubscriptionItem,
  OrderItem,
  SalesStatsData,
  SubStatsData,
  OrderStatsData,
  OrderPipelineData,
  PipelineStage,
  PipelineDeal,
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
      setTab(defaultTab);
      prevDefaultV.current = defaultTab;
    }
  }, [defaultTab]);

  useEffect(() => {
    if (requestedTab && requestedTab !== tab) {
      setTab(requestedTab);
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
        <SmartPaymentModal
          workspaceId={workspaceId}
          onClose={() => setShowSmartPayment(false)}
        />
      )}

      {orderAlerts.length > 0 && (
        <div
          style={{
            background: 'rgba(239,68,68,0.06)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 6,
            padding: '12px 16px',
            marginBottom: 16,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: orderAlerts.length > 1 ? 8 : 0,
            }}
          >
            <svg
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              stroke="#EF4444"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                d={kloelT(
                  'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
                )}
              />
              <line x1={12} y1={9} x2={12} y2={13} />
              <line x1={12} y1={17} x2={12.01} y2={17} />
            </svg>
            <span style={{ fontSize: 12, color: '#EF4444', fontFamily: SORA, flex: 1 }}>
              {orderAlerts.length} alerta{orderAlerts.length > 1 ? 's' : ''}:
              {alertCounts?.missingTracking ? ` ${alertCounts.missingTracking} sem rastreio` : ''}
              {alertCounts?.possibleLost ? ` ${alertCounts.possibleLost} possivel extravio` : ''}
              {alertCounts?.chargebacks ? ` ${alertCounts.chargebacks} chargeback` : ''}
            </span>
            <button
              type="button"
              onClick={() => generateAlerts()}
              style={{
                background: 'none',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 6,
                color: '#EF4444',
                fontSize: 10,
                fontWeight: 600,
                padding: '4px 10px',
                cursor: 'pointer',
                fontFamily: SORA,
              }}
            >
              {kloelT('Atualizar')}
            </button>
          </div>
          {orderAlerts.slice(0, 3).map((alert) => (
            <div
              key={alert.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 0',
                borderTop: '1px solid rgba(239,68,68,0.1)',
              }}
            >
              <span style={{ fontSize: 11, color: '#EF4444', fontFamily: SORA, flex: 1 }}>
                {alert.message}
              </span>
              <button
                type="button"
                onClick={() => resolveAlert(alert.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--app-text-secondary)',
                  fontSize: 10,
                  cursor: 'pointer',
                  fontFamily: SORA,
                  textDecoration: 'underline',
                  padding: 0,
                }}
              >
                {kloelT('Resolver')}
              </button>
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
          <div>
            {!salesPipelineLoading && salesStages.length > 0 && (
              <div
                style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}
              >
                {salesStages.map((stage: PipelineStage) => {
                  const deals: PipelineDeal[] = stage.deals || [];
                  const totalValue = deals.reduce((sum: number, d) => sum + (d.value || 0), 0);
                  return (
                    <div
                      key={stage.id}
                      style={{
                        flex: 1,
                        minWidth: 120,
                        background: 'var(--app-bg-card)',
                        border: '1px solid var(--app-border-primary)',
                        borderRadius: 6,
                        padding: '12px 14px',
                      }}
                    >
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}
                      >
                        <div
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: stage.color || 'colors.ember.primary',
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: 'var(--app-text-secondary)',
                            textTransform: 'uppercase',
                            letterSpacing: '.05em',
                            fontFamily: SORA,
                          }}
                        >
                          {stage.name}
                        </span>
                      </div>
                      <span
                        style={{
                          fontFamily: "var(--font-jetbrains), 'JetBrains Mono', monospace",
                          fontSize: 20,
                          fontWeight: 700,
                          color: 'var(--app-text-primary)',
                          display: 'block',
                        }}
                      >
                        {deals.length}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          color: 'var(--app-text-tertiary)',
                          fontFamily: SORA,
                        }}
                      >
                        {totalValue > 0
                          ? 'R$ ' +
                            totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
                          : 'R$ 0,00'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <CRMPipelineView />
          </div>
        )}
      </div>
    </div>
  );
}
