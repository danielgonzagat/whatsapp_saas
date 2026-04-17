import { adminFetch } from './admin-client';

export type AdminHomePeriod = 'TODAY' | '30D' | 'CUSTOM';
export type AdminHomeCompare = 'PREVIOUS' | 'YOY' | 'NONE';

export interface KpiMoneyValue {
  value: number;
  previous: number | null;
  deltaPct: number | null;
}

export interface KpiNumberValue {
  value: number;
  previous: number | null;
  deltaPct: number | null;
}

export interface KpiRateValue {
  value: number | null;
  previous: number | null;
  deltaPct: number | null;
}

export interface GatewayBreakdownRow {
  gateway: string;
  gmvInCents: number;
  count: number;
}

export interface MethodBreakdownRow {
  method: 'CREDIT_CARD' | 'PIX' | 'BOLETO';
  gmvInCents: number;
  count: number;
}

export interface GmvDailyPoint {
  date: string;
  gmvInCents: number;
  count: number;
}

export interface RevenueDailyPoint {
  date: string;
  revenueInCents: number;
  count: number;
}

export interface AdminHomeResponse {
  range: {
    from: string;
    to: string;
    label: string;
    period: AdminHomePeriod;
    compare: AdminHomeCompare;
  };
  compare: { from: string; to: string } | null;
  kpis: {
    gmv: KpiMoneyValue;
    approvedCount: KpiNumberValue;
    declinedCount: KpiNumberValue;
    pendingCount: KpiNumberValue;
    approvalRate: KpiRateValue;
    refundCount: KpiNumberValue;
    refundAmount: KpiMoneyValue;
    chargebackCount: KpiNumberValue;
    chargebackAmount: KpiMoneyValue;
    averageTicket: KpiMoneyValue;
    activeProducers: { value: number; windowDays: 30 };
    newProducers: KpiNumberValue;
    totalProducers: { value: number };
    revenueKloel: KpiMoneyValue;
    revenueKloelRate: KpiRateValue;
    mrrProjected: KpiMoneyValue;
    churnRate: KpiRateValue;
    conversations: KpiNumberValue;
    responseTimeMinutes: KpiNumberValue;
  };
  breakdowns: {
    byGateway: GatewayBreakdownRow[];
    byMethod: MethodBreakdownRow[];
  };
  series: {
    gmvDaily: GmvDailyPoint[];
    previousGmvDaily: GmvDailyPoint[];
    revenueKloelDaily: RevenueDailyPoint[];
    previousRevenueKloelDaily: RevenueDailyPoint[];
  };
}

export interface AdminHomeQuery {
  period: AdminHomePeriod;
  compare?: AdminHomeCompare;
  from?: string;
  to?: string;
}

export const adminDashboardApi = {
  home(query: AdminHomeQuery): Promise<AdminHomeResponse> {
    const params = new URLSearchParams();
    params.set('period', query.period);
    if (query.compare) params.set('compare', query.compare);
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
    return adminFetch<AdminHomeResponse>(`/dashboard/home?${params.toString()}`);
  },
};
