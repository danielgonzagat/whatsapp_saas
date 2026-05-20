/**
 * Canonical machine-readable capability registry for the Kloel brain.
 * Single source of truth shared by BrainRuntimeService (intent dispatch)
 * and BrainCapabilityExecutorService (self-introspection capability
 * registry → ABI `capabilities.available`). Kept in its own module so
 * both can import it without a circular dependency
 * (brain-runtime → executor already exists).
 *
 * Adding a capability here = it is dispatchable AND it appears in the
 * cognitive self-model. No hardcoded behavior — this IS the registry.
 */
export const OPERATOR_CAPABILITIES = [
  'list_products',
  'search_contact',
  'list_conversations',
  'send_message_via_channel',
  'query_revenue_summary',
  'inspect_self',
  'inspect_runtime',
  // ───────── COMMERCE (2026-05-20) ─────────
  'create_product',
  'update_product',
  'delete_product',
  'create_plan',
  'update_plan',
  'get_product_plans',
  'create_checkout',
  'update_checkout',
  'create_coupon',
  'list_coupons',
  'delete_coupon',
  'validate_coupon',
  'create_payment_link',
  'generate_boleto',
  // ───────── WALLET & SALES ─────────
  'get_wallet_balance',
  'get_wallet_statement',
  'list_orders',
  'get_order_details',
  'get_sales_summary',
  'get_abandonments',
  'list_leads',
  'get_lead_details',
  'update_lead_status',
  'get_dashboard_summary',
  'get_analytics',
  'search_agent_memory',
  'search_agent_sessions',
  'remember_user_info',
  'save_business_info',
  'update_workspace_settings',
] as const;
