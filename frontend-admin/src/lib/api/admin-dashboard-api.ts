import { adminFetch } from './admin-client';

/** Admin home period type. */
export type AdminHomePeriod = 'TODAY' | '30D' | 'CUSTOM';
/** Admin home compare type. */
export type AdminHomeCompare = 'PREVIOUS' | 'YOY' | 'NONE';

/** Kpi money value shape. */
export interface KpiMoneyValue {
  /** Value property. */
  value: number;
  /** Previous property. */
  previous: number | null;
  /** Delta pct property. */
  deltaPct: number | null;
}

/** Kpi number value shape. */
export interface KpiNumberValue {
  /** Value property. */
  value: number;
  /** Previous property. */
  previous: number | null;
  /** Delta pct property. */
  deltaPct: number | null;
}

/** Kpi rate value shape. */
export interface KpiRateValue {
  /** Value property. */
  value: number | null;
  /** Previous property. */
  previous: number | null;
  /** Delta pct property. */
  deltaPct: number | null;
}

/** Gateway breakdown row shape. */
export interface GatewayBreakdownRow {
  /** Gateway property. */
  gateway: string;
  /** Gmv in cents property. */
  gmvInCents: number;
  /** Count property. */
  count: number;
}

/** Method breakdown row shape. */
export interface MethodBreakdownRow {
  /** Method property. */
  method: 'CREDIT_CARD' | 'PIX' | 'BOLETO';
  /** Gmv in cents property. */
  gmvInCents: number;
  /** Count property. */
  count: number;
}

/** Gmv daily point shape. */
export interface GmvDailyPoint {
  /** Date property. */
  date: string;
  /** Gmv in cents property. */
  gmvInCents: number;
  /** Count property. */
  count: number;
}

/** Revenue daily point shape. */
export interface RevenueDailyPoint {
  /** Date property. */
  date: string;
  /** Revenue in cents property. */
  revenueInCents: number;
  /** Count property. */
  count: number;
}

/** Admin home response shape. */
export interface AdminHomeResponse {
  /** Range property. */
  range: {
    from: string;
    to: string;
    label: string;
    period: AdminHomePeriod;
    compare: AdminHomeCompare;
  };
  /** Compare property. */
  compare: { from: string; to: string } | null;
  /** Kpis property. */
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
  /** Breakdowns property. */
  breakdowns: {
    byGateway: GatewayBreakdownRow[];
    byMethod: MethodBreakdownRow[];
  };
  /** Series property. */
  series: {
    gmvDaily: GmvDailyPoint[];
    previousGmvDaily: GmvDailyPoint[];
    revenueKloelDaily: RevenueDailyPoint[];
    previousRevenueKloelDaily: RevenueDailyPoint[];
  };
}

/** Admin home query shape. */
export interface AdminHomeQuery {
  /** Period property. */
  period: AdminHomePeriod;
  /** Compare property. */
  compare?: AdminHomeCompare;
  /** From property. */
  from?: string;
  /** To property. */
  to?: string;
}

/** Admin dashboard api. */
export const adminDashboardApi = {
  home(query: AdminHomeQuery): Promise<AdminHomeResponse> {
    const params = new URLSearchParams();
    params.set('period', query.period);
    if (query.compare) {
      params.set('compare', query.compare);
    }
    if (query.from) {
      params.set('from', query.from);
    }
    if (query.to) {
      params.set('to', query.to);
    }
    return adminFetch<AdminHomeResponse>(`/dashboard/home?${params.toString()}`);
  },
};
