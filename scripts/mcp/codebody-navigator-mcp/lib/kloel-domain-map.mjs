// Domain map — the high-level "organs" of the KLOEL organism. Each entry
// lists glob hints for UI, backend, prisma model regexes, and chat tool
// keywords. We use this to make `nav_trace_domain` and `nav_explore_capability_gap`
// give answers oriented by the product, not by directory layout.

export const KLOEL_DOMAINS = {
  produtos: {
    label: 'Produtos',
    aliases: ['products', 'produto', 'produtos', 'product'],
    ui: ['frontend/src/app/produtos', 'frontend/src/pages/produtos', 'frontend/src/components/products', 'frontend/src/components/kloel/Products'],
    backend: ['backend/src/products', 'backend/src/product'],
    prismaModels: ['Product', 'ProductPlan', 'ProductCheckout', 'ProductUrl', 'ProductImage', 'ProductCommission', 'ProductAffiliate'],
    chatToolKeywords: ['create_product', 'update_product', 'save_product', 'product'],
    events: ['product.created', 'product.updated', 'product.published'],
  },
  checkout: {
    label: 'Checkout',
    aliases: ['checkout', 'payment-flow'],
    ui: ['frontend/src/app/checkout', 'frontend/src/components/checkout', 'frontend/src/components/kloel/Checkout'],
    backend: ['backend/src/checkout', 'backend/src/payments', 'backend/src/stripe'],
    prismaModels: ['Checkout', 'CheckoutSession', 'CheckoutCoupon', 'StripeSession', 'Payment'],
    chatToolKeywords: ['create_checkout', 'checkout_link', 'pay'],
    events: ['checkout.created', 'checkout.completed', 'payment.succeeded'],
  },
  coupons: {
    label: 'Coupons / Cupom',
    aliases: ['coupon', 'coupons', 'cupom', 'cupons', 'discount'],
    ui: ['frontend/src/app/produtos', 'frontend/src/components/products', 'frontend/src/components/coupons', 'frontend/src/app/checkout'],
    backend: ['backend/src/products', 'backend/src/checkout', 'backend/src/kloel'],
    prismaModels: ['ProductCoupon', 'CheckoutCoupon', 'Coupon'],
    chatToolKeywords: ['create_coupon', 'save_coupon', 'apply_coupon', 'coupon'],
    events: ['coupon.created', 'coupon.applied'],
  },
  wallet: {
    label: 'Wallet / Carteira',
    aliases: ['wallet', 'carteira', 'saldo'],
    ui: ['frontend/src/app/wallet', 'frontend/src/app/carteira', 'frontend/src/components/wallet'],
    backend: ['backend/src/wallet', 'backend/src/ledger', 'backend/src/payout'],
    prismaModels: ['Wallet', 'WalletTransaction', 'LedgerEntry', 'Payout', 'PayoutRequest'],
    chatToolKeywords: ['wallet_balance', 'request_payout', 'transfer'],
    events: ['wallet.credited', 'wallet.debited', 'payout.requested'],
  },
  billing: {
    label: 'Billing / Assinaturas',
    aliases: ['billing', 'subscription', 'plans'],
    ui: ['frontend/src/app/billing', 'frontend/src/components/billing'],
    backend: ['backend/src/billing', 'backend/src/subscriptions'],
    prismaModels: ['Subscription', 'Invoice', 'BillingPlan', 'PlatformSubscription'],
    chatToolKeywords: ['subscribe', 'cancel_subscription'],
    events: ['subscription.created', 'invoice.paid'],
  },
  whatsapp: {
    label: 'WhatsApp Core',
    aliases: ['whatsapp', 'wa', 'wpp'],
    ui: ['frontend/src/app/whatsapp', 'frontend/src/components/whatsapp', 'frontend/src/components/kloel/Whatsapp'],
    backend: ['backend/src/whatsapp', 'backend/src/waha', 'backend/src/meta'],
    prismaModels: ['WhatsappSession', 'WhatsappMessage', 'WhatsappContact', 'WhatsappChannel'],
    chatToolKeywords: ['send_whatsapp', 'connect_whatsapp', 'whatsapp_qr'],
    events: ['whatsapp.message.received', 'whatsapp.session.ready'],
  },
  inbox: {
    label: 'Inbox',
    aliases: ['inbox', 'chat-list', 'conversations'],
    ui: ['frontend/src/app/inbox', 'frontend/src/components/inbox', 'frontend/src/components/kloel/Inbox'],
    backend: ['backend/src/inbox', 'backend/src/conversations'],
    prismaModels: ['Conversation', 'Message', 'InboxThread'],
    chatToolKeywords: ['reply_inbox', 'open_conversation'],
    events: ['conversation.created', 'message.sent'],
  },
  autopilot: {
    label: 'Autopilot',
    aliases: ['autopilot', 'ai-agent', 'cia'],
    ui: ['frontend/src/app/autopilot', 'frontend/src/components/autopilot'],
    backend: ['backend/src/autopilot', 'backend/src/agent', 'backend/src/kloel'],
    prismaModels: ['AutopilotConfig', 'AgentSession', 'AutopilotJob'],
    chatToolKeywords: ['enable_autopilot', 'pause_autopilot'],
    events: ['autopilot.enabled', 'autopilot.handoff'],
  },
  kloel_brain: {
    label: 'Kloel Brain (chat / cognitive organism)',
    aliases: ['brain', 'kloel', 'cognitive', 'think'],
    ui: ['frontend/src/app/chat', 'frontend/src/components/kloel/Chat', 'frontend/src/components/kloel/Dashboard'],
    backend: ['backend/src/kloel'],
    prismaModels: ['KloelSession', 'KloelMessage', 'KloelMemory'],
    chatToolKeywords: ['think', 'remember', 'plan'],
    events: ['kloel.message.created', 'kloel.action.executed'],
  },
  flows: {
    label: 'Flows',
    aliases: ['flows', 'flow-builder', 'automation'],
    ui: ['frontend/src/app/flows', 'frontend/src/components/flows'],
    backend: ['backend/src/flows', 'worker/src/flows'],
    prismaModels: ['Flow', 'FlowNode', 'FlowRun'],
    chatToolKeywords: ['create_flow', 'run_flow'],
    events: ['flow.created', 'flow.run.completed'],
  },
  crm: {
    label: 'CRM',
    aliases: ['crm', 'contacts', 'pipeline'],
    ui: ['frontend/src/app/crm', 'frontend/src/components/crm'],
    backend: ['backend/src/crm', 'backend/src/contacts'],
    prismaModels: ['Contact', 'Deal', 'Pipeline', 'PipelineStage'],
    chatToolKeywords: ['add_contact', 'move_deal'],
    events: ['contact.created', 'deal.moved'],
  },
  analytics: {
    label: 'Analytics / Reports',
    aliases: ['analytics', 'reports', 'dashboard'],
    ui: ['frontend/src/app/analytics', 'frontend/src/app/dashboard', 'frontend/src/components/analytics'],
    backend: ['backend/src/analytics', 'backend/src/reports'],
    prismaModels: ['ReportSnapshot', 'AnalyticsEvent'],
    chatToolKeywords: ['report_sales', 'report_traffic'],
    events: ['analytics.snapshot.ready'],
  },
  campaigns: {
    label: 'Campaigns',
    aliases: ['campaigns', 'broadcast', 'disparo'],
    ui: ['frontend/src/app/campaigns'],
    backend: ['backend/src/campaigns'],
    prismaModels: ['Campaign', 'CampaignRun', 'BroadcastMessage'],
    chatToolKeywords: ['launch_campaign'],
    events: ['campaign.launched'],
  },
  marketing: {
    label: 'Marketing',
    aliases: ['marketing', 'channels'],
    ui: ['frontend/src/app/marketing'],
    backend: ['backend/src/marketing'],
    prismaModels: ['MarketingChannel', 'MarketingConfig'],
    chatToolKeywords: ['connect_channel'],
    events: ['marketing.channel.connected'],
  },
  affiliate: {
    label: 'Affiliate / Partnerships',
    aliases: ['affiliate', 'parceria', 'partnership'],
    ui: ['frontend/src/app/affiliate', 'frontend/src/app/parcerias'],
    backend: ['backend/src/affiliate', 'backend/src/partnerships'],
    prismaModels: ['Affiliate', 'AffiliateLink', 'CommissionPayout'],
    chatToolKeywords: ['add_affiliate'],
    events: ['affiliate.created'],
  },
  member_area: {
    label: 'Member Area',
    aliases: ['member', 'membros', 'enrollment'],
    ui: ['frontend/src/app/member', 'frontend/src/app/membros'],
    backend: ['backend/src/members', 'backend/src/enrollment'],
    prismaModels: ['Member', 'Enrollment'],
    chatToolKeywords: ['enroll_member'],
    events: ['member.enrolled'],
  },
  auth: {
    label: 'Auth',
    aliases: ['auth', 'authentication', 'login'],
    ui: ['frontend/src/app/login', 'frontend/src/app/auth'],
    backend: ['backend/src/auth'],
    prismaModels: ['User', 'Session', 'RefreshToken', 'OAuthAccount'],
    chatToolKeywords: ['login', 'logout'],
    events: ['user.logged_in'],
  },
  kyc: {
    label: 'KYC',
    aliases: ['kyc', 'compliance'],
    ui: ['frontend/src/app/kyc'],
    backend: ['backend/src/kyc'],
    prismaModels: ['KycStatus', 'KycDocument'],
    chatToolKeywords: ['submit_kyc'],
    events: ['kyc.approved'],
  },
  workspaces: {
    label: 'Workspaces',
    aliases: ['workspace', 'workspaces', 'tenant'],
    ui: ['frontend/src/app/workspace'],
    backend: ['backend/src/workspace', 'backend/src/workspaces'],
    prismaModels: ['Workspace', 'WorkspaceMember'],
    chatToolKeywords: ['switch_workspace'],
    events: ['workspace.created'],
  },
};

export function findDomain(name) {
  if (!name) return null;
  const lower = String(name).toLowerCase();
  const direct = KLOEL_DOMAINS[lower];
  if (direct) return { key: lower, ...direct };
  for (const [key, d] of Object.entries(KLOEL_DOMAINS)) {
    if (d.aliases.some((a) => a.toLowerCase() === lower)) return { key, ...d };
  }
  for (const [key, d] of Object.entries(KLOEL_DOMAINS)) {
    if (d.label.toLowerCase().includes(lower) || d.aliases.some((a) => a.toLowerCase().includes(lower))) {
      return { key, ...d };
    }
  }
  return null;
}

export function listDomains() {
  return Object.entries(KLOEL_DOMAINS).map(([key, d]) => ({
    key,
    label: d.label,
    aliases: d.aliases,
    uiGlobs: d.ui,
    backendGlobs: d.backend,
    prismaModels: d.prismaModels,
    chatToolKeywords: d.chatToolKeywords,
    events: d.events,
  }));
}
