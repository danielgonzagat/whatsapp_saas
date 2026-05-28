import { type CapabilityDefinition } from '../capability-registry-v2.types';
import { TIER_0A_INTROSPECTION_CAPABILITIES } from './tier-0a-introspection';
import { TIER_0B_QUERY_CAPABILITIES } from './tier-0b-query';
import { TIER_0C_MUTATIONS_CAPABILITIES } from './tier-0c-mutations';

/**
 * KLOEL CAPABILITY REGISTRY partition — Tier 0 (aggregate).
 *
 * Tier 0 is sub-partitioned by capability semantics to keep each file small:
 * - tier-0a-introspection — SELF_AWARENESS (self.*, code access, deps/coverage).
 * - tier-0b-query — QUERY (read-only data fetches).
 * - tier-0c-mutations — MUTATION_SAFE / MUTATION_SENSITIVE / CONFIGURATION
 *   (workspace state changes).
 *
 * Consumers should keep importing CAPABILITY_DEFINITIONS from the barrel
 * '../capability-registry-v2.const' rather than this partition directly. The
 * sub-partitions are exported in case a consumer wants the narrower slice.
 */
export const TIER_0_SELF_AWARENESS_CAPABILITIES: CapabilityDefinition[] = [
  ...TIER_0A_INTROSPECTION_CAPABILITIES,
  ...TIER_0B_QUERY_CAPABILITIES,
  ...TIER_0C_MUTATIONS_CAPABILITIES,
];

export {
  TIER_0A_INTROSPECTION_CAPABILITIES,
  TIER_0B_QUERY_CAPABILITIES,
  TIER_0C_MUTATIONS_CAPABILITIES,
};
