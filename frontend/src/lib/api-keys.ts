/**
 * KLOEL COSMOS — SWR Cache Key Constants
 * Centralized keys prevent typos and enable targeted invalidation.
 */

export const API_KEYS = {
  products: {
    list: (params?: Record<string, string>) => ['/products', params] as const,
    detail: (id: string) => [`/products/${id}`] as const,
    categories: () => ['/products/categories/list'] as const,
    plans: (productId: string) => [`/products/${productId}/plans`] as const,
    plan: (productId: string, planId: string) =>
      [`/products/${productId}/plans/${planId}`] as const,
    checkouts: (productId: string) => [`/products/${productId}/checkouts`] as const,
    coupons: (productId: string) => [`/products/${productId}/coupons`] as const,
    urls: (productId: string) => [`/products/${productId}/urls`] as const,
    aiConfig: (productId: string) => [`/products/${productId}/ai-config`] as const,
    reviews: (productId: string) => [`/products/${productId}/reviews`] as const,
    commissions: (productId: string) => [`/products/${productId}/commissions`] as const,
  },

  campaigns: {
    list: () => ['/campaigns'] as const,
    detail: (id: string) => [`/campaigns/${id}`] as const,
  },

  crm: {
    contacts: (params?: Record<string, string>) => ['/crm/contacts', params] as const,
    contact: (phone: string) => [`/crm/contacts/${phone}`] as const,
    pipelines: () => ['/crm/pipelines'] as const,
    deals: (params?: Record<string, string>) => ['/crm/deals', params] as const,
  },

  flows: {
    list: (wsId: string) => [`/flows/${wsId}`] as const,
    detail: (wsId: string, flowId: string) => [`/flows/${wsId}/${flowId}`] as const,
    templates: () => ['/flows/templates'] as const,
    executions: (wsId: string) => [`/flows/${wsId}/executions`] as const,
  },

  analytics: {
    dashboard: () => ['/analytics/dashboard'] as const,
    stats: () => ['/analytics/stats'] as const,
    activity: () => ['/analytics/activity'] as const,
    advanced: (params?: Record<string, string>) => ['/analytics/advanced', params] as const,
  },

  billing: {
    status: () => ['/billing/status'] as const,
    subscription: () => ['/billing/subscription'] as const,
    usage: () => ['/billing/usage'] as const,
    paymentMethods: () => ['/billing/payment-methods'] as const,
  },

  autopilot: {
    status: () => ['/autopilot/status'] as const,
    config: () => ['/autopilot/config'] as const,
    stats: () => ['/autopilot/stats'] as const,
    actions: (params?: Record<string, string>) => ['/autopilot/actions', params] as const,
    insights: () => ['/autopilot/insights'] as const,
    moneyReport: () => ['/autopilot/money-report'] as const,
    nextBestAction: () => ['/autopilot/next-best-action'] as const,
  },

  inbox: {
    conversations: (wsId: string) => [`/inbox/${wsId}/conversations`] as const,
    agents: (wsId: string) => [`/inbox/${wsId}/agents`] as const,
    messages: (convId: string) => [`/inbox/conversations/${convId}/messages`] as const,
  },

  marketplace: {
    templates: () => ['/marketplace/templates'] as const,
  },

  dashboard: {
    stats: () => ['/dashboard/stats'] as const,
  },

  wallet: {
    balance: (wsId: string) => [`/kloel/wallet/${wsId}/balance`] as const,
    transactions: (wsId: string) => [`/kloel/wallet/${wsId}/transactions`] as const,
  },

  followups: {
    list: () => ['/followups'] as const,
    stats: () => ['/followups/stats'] as const,
  },
} as const;
