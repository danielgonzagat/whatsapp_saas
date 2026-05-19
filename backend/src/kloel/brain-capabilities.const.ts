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
] as const;

type OperatorCapability = (typeof OPERATOR_CAPABILITIES)[number];
