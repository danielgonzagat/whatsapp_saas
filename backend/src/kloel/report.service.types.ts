/** Return type for ReportService.operations(). */
export interface OperationReport {
  /** Total CheckoutOrder rows created in period. */
  orders: number;
  /** KloelSale rows with status = 'paid'. */
  sales: number;
  /** KloelSale rows with status = 'refunded'. */
  refunds: number;
  /** CheckoutSocialLead rows where convertedAt is null (not completed). */
  abandonments: number;
}

/** Return type for ReportService.abandonments(). */
export interface AbandonmentReport {
  items: AbandonmentItem[];
  total: number;
}

/** Return type for ReportService.getSubscriptions(). */
export interface SubscriptionReport {
  items: SubscriptionReportItem[];
  total: number;
  byStatus: Record<string, number>;
}

/** A single subscription entry in the subscription report. */
export interface SubscriptionReportItem {
  id: string;
  status: string;
  planName: string;
  amount: number;
  interval: string;
  startedAt: string;
  nextBillingAt: string | null;
  cancelledAt: string | null;
}

/** Return type for ReportService.getChargebacks(). */
export interface ChargebackReport {
  items: ChargebackReportItem[];
  total: number;
  totalAmountCents: bigint;
}

/** A single chargeback entry in the chargeback report. */
export interface ChargebackReportItem {
  paymentId: string;
  orderId: string;
  amountCents: bigint;
  customerName: string | null;
  createdAt: string;
}

/** A single abandonment entry. */
export interface AbandonmentItem {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  /** How many checkout steps the lead reached. */
  stepReached: number;
  abandonedAt: string | null;
  createdAt: string;
}
