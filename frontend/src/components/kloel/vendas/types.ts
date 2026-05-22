export interface SaleItem {
  id: string;
  leadId?: string;
  leadPhone?: string;
  customerName?: string;
  productName?: string;
  amount: number;
  status: string;
  paymentMethod?: string;
  createdAt?: string;
}

export interface SubscriptionItem {
  id: string;
  customerName?: string;
  planName?: string;
  amount: number;
  status: string;
  totalPaid?: number;
  startedAt?: string;
  nextBillingAt?: string;
}

export interface OrderItem {
  id: string;
  customerName?: string;
  productName?: string;
  amount: number;
  status: string;
  trackingCode?: string;
  addressCity?: string;
  addressState?: string;
  createdAt?: string;
}

export interface SalesStatsData {
  totalRevenue?: number;
  revenueTrend?: number;
  totalTransactions?: number;
  totalPending?: number;
  pendingCount?: number;
  avgTicket?: number;
}

export interface SubStatsData {
  mrr?: number;
  mrrTrend?: number;
  activeCount?: number;
  churnRate?: number;
  avgLtv?: number;
  arr?: number;
  pastDueCount?: number;
  lifecycle?: Record<string, number>;
}

export interface OrderStatsData {
  total?: number;
  processing?: number;
  shipped?: number;
  delivered?: number;
}

export interface OrderPipelineData {
  processing?: number;
  shipped?: number;
  delivered?: number;
  returned?: number;
}

export interface PipelineStage {
  id: string;
  name?: string;
  color?: string;
  deals?: PipelineDeal[];
}

export interface PipelineDeal {
  id: string;
  value?: number;
}

export interface DetailItemData {
  id: string;
  amount?: number;
  paymentMethod?: string;
  createdAt?: string;
  startedAt?: string;
  nextBillingAt?: string;
  totalPaid?: number;
  trackingCode?: string;
  addressCity?: string;
  addressState?: string;
  status?: string;
  customerName?: string;
  customerEmail?: string;
  leadPhone?: string;
  productName?: string;
  planName?: string;
}
