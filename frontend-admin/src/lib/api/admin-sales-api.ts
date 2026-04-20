import { adminFetch } from './admin-client';
import type {
  AdminTransactionRow,
  OrderStatusValue,
  PaymentMethodValue,
} from './admin-transactions-api';

/** Admin sales overview response shape. */
export interface AdminSalesOverviewResponse {
  summary: {
    revenueKloelInCents: number;
    gmvInCents: number;
    transactionCount: number;
    averageTicketInCents: number;
    mrrProjectedInCents: number;
    churnRate: number | null;
    arrProjectedInCents: number | null;
    paidCount: number;
    pendingCount: number;
    refundedCount: number;
    chargebackCount: number;
    shippedCount: number;
    deliveredCount: number;
  };
  chart: Array<{
    label: string;
    totalInCents: number;
  }>;
  gatewayOptions: string[];
  items: AdminTransactionRow[];
}

/** Admin sales api. */
export const adminSalesApi = {
  overview(
    query: {
      search?: string;
      status?: OrderStatusValue | '';
      method?: PaymentMethodValue | '';
      gateway?: string;
    } = {},
  ) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, String(value));
      }
    }
    const qs = params.toString();
    return adminFetch<AdminSalesOverviewResponse>(qs ? `/sales/overview?${qs}` : '/sales/overview');
  },
};
