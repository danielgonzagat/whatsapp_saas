import { type CapabilityDefinition } from './capability-registry-v2.types';
import { TIER_0_SELF_AWARENESS_CAPABILITIES } from './partitions/tier-0-self-awareness';
import { TIER_1_PRODUCTS_CAPABILITIES } from './partitions/tier-1-products';
import { TIER_2_PLANS_CAPABILITIES } from './partitions/tier-2-plans';
import { TIER_3_CHECKOUTS_CAPABILITIES } from './partitions/tier-3-checkouts';
import { TIER_4_COUPONS_CAPABILITIES } from './partitions/tier-4-coupons';
import { TIER_5_SALES_CAPABILITIES } from './partitions/tier-5-sales';
import { TIER_6_URLS_CAPABILITIES } from './partitions/tier-6-urls';
import { TIER_7_AFFILIATES_CAPABILITIES } from './partitions/tier-7-affiliates';
import { TIER_8_CRM_CAPABILITIES } from './partitions/tier-8-crm';
import { TIER_9_WALLET_CAPABILITIES } from './partitions/tier-9-wallet';
import { TIER_10_REPORTS_CAPABILITIES } from './partitions/tier-10-reports';
import { TIER_11_CONFIGURATION_CAPABILITIES } from './partitions/tier-11-configuration';
import { TIER_12_MARKETING_CAPABILITIES } from './partitions/tier-12-marketing';

/**
 * KLOEL CAPABILITY REGISTRY — Single source of truth.
 *
 * Every action the Kloel can perform is defined here.
 * Capabilities live in tier-grouped partition files under ./partitions to keep
 * each file under a reasonable size; this barrel re-exports the full list so
 * existing consumers continue to import CAPABILITY_DEFINITIONS unchanged.
 */
export const CAPABILITY_DEFINITIONS: CapabilityDefinition[] = [
  ...TIER_0_SELF_AWARENESS_CAPABILITIES,
  ...TIER_1_PRODUCTS_CAPABILITIES,
  ...TIER_2_PLANS_CAPABILITIES,
  ...TIER_3_CHECKOUTS_CAPABILITIES,
  ...TIER_4_COUPONS_CAPABILITIES,
  ...TIER_5_SALES_CAPABILITIES,
  ...TIER_6_URLS_CAPABILITIES,
  ...TIER_7_AFFILIATES_CAPABILITIES,
  ...TIER_8_CRM_CAPABILITIES,
  ...TIER_9_WALLET_CAPABILITIES,
  ...TIER_10_REPORTS_CAPABILITIES,
  ...TIER_11_CONFIGURATION_CAPABILITIES,
  ...TIER_12_MARKETING_CAPABILITIES,
];

export const CAPABILITY_MAP = new Map<string, CapabilityDefinition>(
  CAPABILITY_DEFINITIONS.map((cap) => [cap.id, cap]),
);

/** Map capability ID -> tier grouping */
export const CAPABILITIES_BY_TIER: Record<number, CapabilityDefinition[]> =
  CAPABILITY_DEFINITIONS.reduce<Record<number, CapabilityDefinition[]>>((acc, cap) => {
    const entry = acc[cap.tier];
    if (entry) {
      entry.push(cap);
    } else {
      acc[cap.tier] = [cap];
    }
    return acc;
  }, {});

export {
  TIER_0_SELF_AWARENESS_CAPABILITIES,
  TIER_1_PRODUCTS_CAPABILITIES,
  TIER_2_PLANS_CAPABILITIES,
  TIER_3_CHECKOUTS_CAPABILITIES,
  TIER_4_COUPONS_CAPABILITIES,
  TIER_5_SALES_CAPABILITIES,
  TIER_6_URLS_CAPABILITIES,
  TIER_7_AFFILIATES_CAPABILITIES,
  TIER_8_CRM_CAPABILITIES,
  TIER_9_WALLET_CAPABILITIES,
  TIER_10_REPORTS_CAPABILITIES,
  TIER_11_CONFIGURATION_CAPABILITIES,
  TIER_12_MARKETING_CAPABILITIES,
};
