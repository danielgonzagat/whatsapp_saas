import { type CapabilityDefinition } from '../capability-registry-v2.types';

import { TIER_0B_QUERY_COMMERCE_CAPABILITIES } from './tier-0b-query.commerce';
import { TIER_0B_QUERY_COMMS_CAPABILITIES } from './tier-0b-query.comms';
import { TIER_0B_QUERY_SALES_CAPABILITIES } from './tier-0b-query.sales';
import { TIER_0B_QUERY_WORKSPACE_CAPABILITIES } from './tier-0b-query.workspace';

/**
 * KLOEL CAPABILITY REGISTRY sub-partition — Tier 0 (read-only queries).
 *
 * QUERY capabilities: read-only data fetches that don't mutate workspace state.
 *
 * Further sub-partitioned by domain (Gate-fix2-D, 2026-05-28) so each domain's
 * capability list stays reviewable in isolation:
 *
 *   - tier-0b-query.commerce  — products / plans / URLs / reviews / coupons / checkouts / refunds
 *   - tier-0b-query.sales     — orders / sales summary / leads / abandonments / NPS / churn / subscriptions
 *   - tier-0b-query.comms     — WhatsApp / channels / web search / audio / agent memory + sessions
 *   - tier-0b-query.workspace — analytics / billing / settings / wallet
 *
 * Aggregated by '../partitions/tier-0-self-awareness' alongside tier-0a/0c
 * before being re-exported through '../capability-registry-v2.const'.
 */
export const TIER_0B_QUERY_CAPABILITIES: CapabilityDefinition[] = [
  ...TIER_0B_QUERY_COMMERCE_CAPABILITIES,
  ...TIER_0B_QUERY_SALES_CAPABILITIES,
  ...TIER_0B_QUERY_COMMS_CAPABILITIES,
  ...TIER_0B_QUERY_WORKSPACE_CAPABILITIES,
];

export {
  TIER_0B_QUERY_COMMERCE_CAPABILITIES,
  TIER_0B_QUERY_COMMS_CAPABILITIES,
  TIER_0B_QUERY_SALES_CAPABILITIES,
  TIER_0B_QUERY_WORKSPACE_CAPABILITIES,
};
