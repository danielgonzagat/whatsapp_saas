import type { ReactNode } from 'react';

/** Filter fields used across all report tabs. */
export interface ReportFilters {
  startDate?: string;
  endDate?: string;
  product?: string;
  status?: string;
  paymentMethod?: string;
  page?: number;
  perPage?: number;
}

/** Row types used by report tabs. */
export interface ReportRowFields {
  id?: string;
  status?: string;
  totalInCents?: number;
  paymentMethod?: string;
  createdAt?: string;
  buyerName?: string;
  buyerEmail?: string;
  productName?: string;
  planName?: string;
  vendas?: number;
  receita?: number;
  comissao?: number;
  partnerName?: string;
  partnerEmail?: string;
  source?: string;
  order?: {
    totalInCents?: number;
    customerName?: string;
    orderNumber?: string;
    customerEmail?: string;
    plan?: { name?: string; product?: { name?: string } };
  };
  refundedAt?: string;
  _count?: number;
  orderNumber?: string;
  customerName?: string;
  customerEmail?: string;
  plan?: { name?: string; product?: { name?: string } };
  totalSales?: number;
  totalRevenue?: number;
  totalCommission?: number;
  amount?: number;
  nextBillingAt?: string;
}

export type ReportRow = ReportRowFields & Record<string, unknown>;

/** Response shapes for useReport. */
export interface PaginatedReport {
  data: ReportRow[];
  total: number;
}

export interface VendasSummary {
  totalRevenue: number;
  totalCount: number;
  ticketMedio: number;
  conversao: number;
  paidCount: number;
  totalCommission: number;
}

export interface ChurnResponse {
  total: number;
  monthly: ReportRow[];
}

export interface AssinaturasResponse {
  data: ReportRow[];
  total: number;
  summary: SubscriptionSummaryRow[];
}

export interface MetricasResponse {
  byMethod: Record<string, number>;
  totalSales: number;
  conversao: number;
  roas: string;
  totalAdSpend: number;
}

export interface ChargebackResponse {
  data: ReportRow[];
  total: number;
  monthly: ReportRow[];
}

export interface SubscriptionSummaryRow {
  status: string;
  _count: number;
}

export interface TooltipPayloadEntry {
  name: string;
  value: number;
  color?: string;
}

export type IconFn = (size: number) => ReactNode;

export type SetFilters = React.Dispatch<React.SetStateAction<ReportFilters>>;

export type SetPage = React.Dispatch<React.SetStateAction<number>>;
