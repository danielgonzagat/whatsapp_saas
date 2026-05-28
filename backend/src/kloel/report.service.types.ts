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
