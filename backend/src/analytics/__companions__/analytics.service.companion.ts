/**
 * Pure helper functions for AnalyticsService.
 * Extracted to keep the service file under the architecture line budget.
 */

export interface ReportSale {
  amount: number;
  status: string;
  paymentMethod?: string | null;
  productName?: string | null;
  createdAt: Date;
}

interface ReportWindow {
  since: Date;
  prevSince: Date;
  days: number;
}

export const DAY_MS = 24 * 60 * 60 * 1000;

function resolvePeriodDays(period: string): number {
  if (period === '7d') {
    return 7;
  }
  if (period === '90d') {
    return 90;
  }
  if (period === '12m') {
    return 365;
  }
  return 30;
}

function resolveCustomWindow(startDate: Date, endDate: Date): ReportWindow {
  const diffMs = endDate.getTime() - startDate.getTime();
  const days = Math.max(1, Math.ceil(diffMs / DAY_MS));
  return {
    since: startDate,
    prevSince: new Date(startDate.getTime() - diffMs),
    days,
  };
}

function resolveRollingWindow(period: string): ReportWindow {
  const days = resolvePeriodDays(period);
  const now = Date.now();
  return {
    since: new Date(now - days * DAY_MS),
    prevSince: new Date(now - days * 2 * DAY_MS),
    days,
  };
}

export function resolveReportWindow(
  period: string,
  startDate?: Date,
  endDate?: Date,
): ReportWindow {
  if (period === 'custom' && startDate && endDate) {
    return resolveCustomWindow(startDate, endDate);
  }
  return resolveRollingWindow(period);
}

export function computeTrendPct(current: number, previous: number): number {
  return previous > 0 ? ((current - previous) / previous) * 100 : 0;
}

function sumBy<T>(items: readonly T[], pick: (item: T) => number): number {
  return items.reduce((sum, item) => sum + pick(item), 0);
}

export interface SalesSummary {
  paidSales: ReportSale[];
  prevPaidSales: ReportSale[];
  refunds: ReportSale[];
  totalRevenue: number;
  prevRevenue: number;
  revenueTrend: number;
  totalPending: number;
  avgTicket: number;
}

export function buildSalesSummary(sales: ReportSale[], prevSales: ReportSale[]): SalesSummary {
  const paidSales = sales.filter((s) => s.status === 'paid');
  const prevPaidSales = prevSales.filter((s) => s.status === 'paid');
  const refunds = sales.filter((s) => s.status === 'refunded');
  const totalRevenue = sumBy(paidSales, (s) => s.amount);
  const prevRevenue = sumBy(prevPaidSales, (s) => s.amount);
  const pendingSales = sales.filter((s) => s.status === 'pending');
  const totalPending = sumBy(pendingSales, (s) => s.amount);
  const avgTicket = paidSales.length > 0 ? totalRevenue / paidSales.length : 0;
  return {
    paidSales,
    prevPaidSales,
    refunds,
    totalRevenue,
    prevRevenue,
    revenueTrend: computeTrendPct(totalRevenue, prevRevenue),
    totalPending,
    avgTicket,
  };
}

export function aggregateTopProducts(paidSales: readonly ReportSale[]) {
  const productMap: Record<string, { name: string; sales: number; revenue: number }> = {};
  paidSales.forEach((s) => {
    const name = s.productName || 'Sem produto';
    if (!productMap[name]) {
      productMap[name] = { name, sales: 0, revenue: 0 };
    }
    productMap[name].sales++;
    productMap[name].revenue += s.amount;
  });
  return Object.values(productMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
}

export function aggregatePaymentMethods(paidSales: readonly ReportSale[]) {
  const paymentMap: Record<string, { method: string; count: number; revenue: number }> = {};
  paidSales.forEach((s) => {
    const method = s.paymentMethod || 'OUTRO';
    if (!paymentMap[method]) {
      paymentMap[method] = { method, count: 0, revenue: 0 };
    }
    paymentMap[method].count++;
    paymentMap[method].revenue += s.amount;
  });
  return Object.values(paymentMap);
}

export function aggregateTimePatterns(paidSales: readonly ReportSale[]): {
  salesByHour: number[];
  salesByWeekday: number[];
} {
  const salesByHour = new Array<number>(24).fill(0);
  const salesByWeekday = new Array<number>(7).fill(0);
  paidSales.forEach((s) => {
    const d = new Date(s.createdAt);
    salesByHour[d.getHours()]++;
    salesByWeekday[d.getDay()]++;
  });
  return { salesByHour, salesByWeekday };
}

export interface ReportKpiInput {
  totalRevenue: number;
  revenueTrend: number;
  paidSales: readonly ReportSale[];
  prevPaidSales: readonly ReportSale[];
  leads: number;
  leadsTrend: number;
  conversionRate: number;
  avgTicket: number;
  totalPending: number;
  adSpend: number;
}

function computeSalesTrend(
  paidSales: readonly ReportSale[],
  prevPaidSales: readonly ReportSale[],
): number {
  if (prevPaidSales.length === 0) {
    return 0;
  }
  return Math.round(((paidSales.length - prevPaidSales.length) / prevPaidSales.length) * 1000) / 10;
}

function computeRoas(totalRevenue: number, adSpend: number): number | null {
  if (totalRevenue <= 0 || adSpend <= 0) {
    return null;
  }
  return Math.round((totalRevenue / adSpend) * 100) / 100;
}

export function buildReportKpi(input: ReportKpiInput) {
  return {
    totalRevenue: input.totalRevenue,
    revenueTrend: Math.round(input.revenueTrend * 10) / 10,
    totalSales: input.paidSales.length,
    salesTrend: computeSalesTrend(input.paidSales, input.prevPaidSales),
    totalLeads: input.leads,
    leadsTrend: Math.round(input.leadsTrend * 10) / 10,
    conversionRate: Math.round(input.conversionRate * 10) / 10,
    avgTicket: Math.round(input.avgTicket * 100) / 100,
    totalPending: input.totalPending,
    adSpend: input.adSpend,
    roas: computeRoas(input.totalRevenue, input.adSpend),
  };
}

export function buildReportFinancial(
  wallet: unknown,
  refunds: readonly ReportSale[],
): { available: number; pending: number; refunds: number; refundCount: number } {
  const walletRecord = (wallet as Record<string, unknown> | null) ?? null;
  return {
    available: Number(walletRecord?.availableBalance ?? 0) || 0,
    pending: Number(walletRecord?.pendingBalance ?? 0) || 0,
    refunds: sumBy(refunds, (s) => s.amount),
    refundCount: refunds.length,
  };
}
