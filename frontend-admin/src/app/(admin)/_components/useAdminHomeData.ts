'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { adminCarteiraApi, type MarketplaceTreasuryBalance } from '@/lib/api/admin-carteira-api';
import {
  adminDashboardApi,
  type AdminHomePeriod,
  type AdminHomeResponse,
} from '@/lib/api/admin-dashboard-api';
import { adminNotificationsApi } from '@/lib/api/admin-notifications-api';
import { adminProductsApi, type ListProductsResponse } from '@/lib/api/admin-products-api';
import { adminSupportApi, type AdminSupportOverviewItem } from '@/lib/api/admin-support-api';
import { useAdminSession } from '@/lib/auth/admin-session-context';
import { toIsoDateTime } from './admin-formatters';

export type { AdminHomePeriod };

export function useAdminHomeData() {
  const { admin } = useAdminSession();
  const [period, setPeriod] = useState<AdminHomePeriod>('30D');
  const [customRange, setCustomRange] = useState({ from: '', to: '' });
  const referenceDate = useMemo(() => new Date(), []);

  const currentMonthRange = useMemo(() => {
    const from = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1, 0, 0, 0, 0);
    const to = new Date(referenceDate);
    return { from: toIsoDateTime(from), to: toIsoDateTime(to) };
  }, [referenceDate]);

  const previousMonthRange = useMemo(() => {
    const from = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1, 0, 0, 0, 0);
    const to = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 0, 23, 59, 59, 999);
    return { from: toIsoDateTime(from), to: toIsoDateTime(to) };
  }, [referenceDate]);

  const { data } = useSWR<AdminHomeResponse>(
    admin ? ['admin/dashboard/home', period, customRange.from, customRange.to] : null,
    () =>
      adminDashboardApi.home({
        period,
        compare: 'PREVIOUS',
        from: period === 'CUSTOM' ? customRange.from : undefined,
        to: period === 'CUSTOM' ? customRange.to : undefined,
      }),
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  const { data: todayData } = useSWR<AdminHomeResponse>(
    admin ? ['admin/dashboard/home', 'TODAY'] : null,
    () => adminDashboardApi.home({ period: 'TODAY', compare: 'PREVIOUS' }),
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  const { data: currentMonthData } = useSWR<AdminHomeResponse>(
    admin
      ? ['admin/dashboard/home', 'CURRENT_MONTH', currentMonthRange.from, currentMonthRange.to]
      : null,
    () =>
      adminDashboardApi.home({
        period: 'CUSTOM',
        compare: 'NONE',
        from: currentMonthRange.from,
        to: currentMonthRange.to,
      }),
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  const { data: previousMonthData } = useSWR<AdminHomeResponse>(
    admin
      ? ['admin/dashboard/home', 'PREVIOUS_MONTH', previousMonthRange.from, previousMonthRange.to]
      : null,
    () =>
      adminDashboardApi.home({
        period: 'CUSTOM',
        compare: 'NONE',
        from: previousMonthRange.from,
        to: previousMonthRange.to,
      }),
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  const { data: balance } = useSWR<MarketplaceTreasuryBalance>(
    admin ? ['admin/carteira/balance', 'BRL'] : null,
    () => adminCarteiraApi.balance('BRL'),
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  const { data: productsData } = useSWR<ListProductsResponse>(
    admin ? ['admin/products', 'home-top'] : null,
    () => adminProductsApi.list({ take: 5 }),
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  const { data: supportData } = useSWR(
    admin ? ['admin/support/overview', 'home'] : null,
    () => adminSupportApi.overview(),
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  const { data: notificationsData } = useSWR(
    admin ? ['admin/notifications', 'home'] : null,
    () => adminNotificationsApi.list(),
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  const totalOrders =
    (data?.kpis.approvedCount.value ?? 0) +
    (data?.kpis.declinedCount.value ?? 0) +
    (data?.kpis.pendingCount.value ?? 0) +
    (data?.kpis.refundCount.value ?? 0) +
    (data?.kpis.chargebackCount.value ?? 0);
  const conversionRate = totalOrders > 0 ? (data?.kpis.approvedCount.value ?? 0) / totalOrders : 0;

  const topProducts = useMemo(
    () =>
      [...(productsData?.items || [])]
        .sort((left, right) => right.commerce.last30dGmvInCents - left.commerce.last30dGmvInCents)
        .slice(0, 5),
    [productsData?.items],
  );

  const recentConversations = useMemo(
    () =>
      [...(supportData?.items || [])]
        .sort(
          (left, right) =>
            new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime(),
        )
        .slice(0, 5),
    [supportData?.items],
  );

  const recentNotifications = useMemo(
    () => (notificationsData?.items || []).slice(0, 6),
    [notificationsData?.items],
  );

  const chartLabels = useMemo(
    () =>
      (data?.series.gmvDaily || []).map((point) =>
        new Date(point.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      ),
    [data?.series.gmvDaily],
  );
  const revenueSeries = useMemo(
    () => (data?.series.gmvDaily || []).map((point) => point.gmvInCents),
    [data?.series.gmvDaily],
  );
  const previousRevenueSeries = useMemo(
    () => (data?.series.previousGmvDaily || []).map((point) => point.gmvInCents),
    [data?.series.previousGmvDaily],
  );
  const orderSeries = useMemo(
    () => (data?.series.gmvDaily || []).map((point) => point.count),
    [data?.series.gmvDaily],
  );
  const conversationsSeries = useMemo(
    () => (data?.series.revenueKloelDaily || []).map((point) => point.count),
    [data?.series.revenueKloelDaily],
  );
  const averageTicketSeries = useMemo(
    () =>
      (data?.series.gmvDaily || []).map((point) =>
        point.count > 0 ? Math.round(point.gmvInCents / point.count) : 0,
      ),
    [data?.series.gmvDaily],
  );

  const activeProducts = topProducts.filter((item) => item.active).length;
  const chargebackRatePct =
    totalOrders > 0 ? ((data?.kpis.chargebackCount.value ?? 0) / totalOrders) * 100 : 0;
  const catalogActivationPct =
    topProducts.length > 0 ? (activeProducts / topProducts.length) * 100 : 0;
  const checkoutCompletionPct = conversionRate * 100;
  const operationalScorePct = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (checkoutCompletionPct + catalogActivationPct + Math.max(0, 100 - chargebackRatePct * 4)) /
          3,
      ),
    ),
  );

  return {
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
    productsData,
    supportData,
    notificationsData,
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
  };
}
