/** Admin client row shape. */
export interface AdminClientRow {
  /** Workspace id property. */
  workspaceId: string;
  /** Name property. */
  name: string;
  /** Owner email property. */
  ownerEmail: string | null;
  /** Owner name property. */
  ownerName: string | null;
  /** Created at property. */
  createdAt: string;
  /** Kyc status property. */
  kycStatus: string;
  /** Gmv last30d in cents property. */
  gmvLast30dInCents: number;
  /** Previous gmv last30d in cents property. */
  previousGmvLast30dInCents: number;
  /** Growth rate property. */
  growthRate: number | null;
  /** Last sale at property. */
  lastSaleAt: string | null;
  /** Product count property. */
  productCount: number;
  /** Plan property. */
  plan: string | null;
  /** Subscription status property. */
  subscriptionStatus: string | null;
  /** Custom domain property. */
  customDomain: string | null;
  /** Health score property. */
  healthScore: number;
}

/** List clients response shape. */
export interface ListClientsResponse {
  /** Items property. */
  items: AdminClientRow[];
  /** Total property. */
  total: number;
}

/** Client workspace row type. */
export type ClientWorkspaceRow = {
  id: string;
  name: string;
  customDomain: string | null;
  createdAt: Date;
  agents: Array<{ email: string | null; name: string | null; kycStatus: string | null }>;
  subscription: { plan: string | null; status: string | null } | null;
};

/** Admin client metric maps shape. */
export interface AdminClientMetricMaps {
  /** Current gmv map property. */
  currentGmvMap: Map<string, number>;
  /** Previous gmv map property. */
  previousGmvMap: Map<string, number>;
  /** Last sale map property. */
  lastSaleMap: Map<string, string | null>;
  /** Product map property. */
  productMap: Map<string, number>;
}
