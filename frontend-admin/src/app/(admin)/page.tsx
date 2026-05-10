'use client';

import { useMemo } from 'react';
import { firstName, resolveGreeting } from '@/components/admin/admin-greeting';
import {
  AdminMetricGrid,
  AdminPage,
  AdminPageIntro,
} from '@/components/admin/admin-monitor-ui';
import { PeriodFilter } from '@/components/admin/god-view/period-filter';
import { useAdminSession } from '@/lib/auth/admin-session-context';
import { useAdminHomeData } from './_components/useAdminHomeData';
import {
  AdminBottomCharts,
  AdminHealthSection,
  AdminKpiCards,
  AdminProductsSection,
  AdminRevenueChartSection,
  AdminRevenueSection,
} from './_components/AdminHomeSections';

export default function AdminHomePage() {
  const { admin } = useAdminSession();
  const {
    period,
    setPeriod,
    customRange,
    setCustomRange,
    referenceDate,
    data,
    todayData,
    currentMonthData,
    previousMonthData,
    balance,
    totalOrders,
    conversionRate,
    topProducts,
    recentConversations,
    recentNotifications,
    chartLabels,
    revenueSeries,
    previousRevenueSeries,
    orderSeries,
    conversationsSeries,
    averageTicketSeries,
    activeProducts,
    chargebackRatePct,
    catalogActivationPct,
    checkoutCompletionPct,
    operationalScorePct,
  } = useAdminHomeData();

  const greeting = resolveGreeting(referenceDate.getHours());
  const displayName = firstName(admin?.name || 'Daniel');
  const eyebrow = referenceDate
    .toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
    .toUpperCase();

  return (
    <AdminPage>
      <AdminPageIntro
        eyebrow={eyebrow}
        title={
          <>
            {greeting}, <span className="text-[var(--app-accent)]">{displayName}</span>.
          </>
        }
        description="Operação, receita e conversas em um único plano de controle global."
        actions={
          <PeriodFilter
            value={period}
            onChange={setPeriod}
            customRange={customRange}
            onApplyCustomRange={setCustomRange}
          />
        }
      />

      <AdminRevenueSection
        data={data}
        todayData={todayData}
        currentMonthData={currentMonthData}
        previousMonthData={previousMonthData}
        balance={balance}
      />

      <AdminKpiCards
        data={data}
        revenueSeries={revenueSeries}
        orderSeries={orderSeries}
        conversationsSeries={conversationsSeries}
        averageTicketSeries={averageTicketSeries}
        totalOrders={totalOrders}
        conversionRate={conversionRate}
      />

      <AdminRevenueChartSection
        data={data}
        chartLabels={chartLabels}
        revenueSeries={revenueSeries}
        previousRevenueSeries={previousRevenueSeries}
      />

      <AdminProductsSection
        data={data}
        topProducts={topProducts}
        recentConversations={recentConversations}
      />

      <AdminHealthSection
        operationalScorePct={operationalScorePct}
        checkoutCompletionPct={checkoutCompletionPct}
        chargebackRatePct={chargebackRatePct}
      />

      <AdminMetricGrid
        items={[
          {
            label: 'Revenue Kloel',
            value: data?.kpis.revenueKloel.value ?? null,
            detail: 'Receita própria do marketplace',
          },
          {
            label: 'Taxa da Kloel',
            value: data?.kpis.revenueKloelRate.value ?? null,
            kind: 'percentage',
            detail: 'Receita Kloel sobre o GMV aprovado',
          },
          {
            label: 'Reembolsos',
            value: data?.kpis.refundAmount.value ?? null,
            detail: `${data?.kpis.refundCount.value ?? 0} ocorrências no período`,
          },
          {
            label: 'Chargebacks',
            value: data?.kpis.chargebackAmount.value ?? null,
            detail: `${data?.kpis.chargebackCount.value ?? 0} disputas registradas`,
          },
          {
            label: 'Produtores ativos',
            value: data?.kpis.activeProducers.value ?? null,
            kind: 'integer',
            detail: 'Janela móvel de 30 dias',
          },
          {
            label: 'Novos produtores',
            value: data?.kpis.newProducers.value ?? null,
            kind: 'integer',
            detail: `${data?.kpis.totalProducers.value ?? 0} no total do marketplace`,
          },
          {
            label: 'MRR projetado',
            value: data?.kpis.mrrProjected.value ?? null,
            detail: 'Receita recorrente mensal estimada',
          },
          {
            label: 'Churn recorrente',
            value: data?.kpis.churnRate.value ?? null,
            kind: 'percentage',
            detail: 'Cancelamentos sobre a base recorrente',
          },
        ]}
      />

      <AdminBottomCharts data={data} recentNotifications={recentNotifications} />
    </AdminPage>
  );
}
